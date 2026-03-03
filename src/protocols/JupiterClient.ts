import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';

/**
 * Well-known token mints
 */
export const KNOWN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',        // Wrapped SOL (native)
  USDC_MAINNET: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
  USDT_MAINNET: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT mainnet
} as const;

/**
 * Jupiter quote response
 */
export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

/**
 * Jupiter swap response
 */
export interface JupiterSwapResponse {
  swapTransaction: string; // base64-encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

/**
 * Swap result
 */
export interface SwapResult {
  success: boolean;
  signature?: string;
  inputAmount: number;
  outputAmount?: number;
  route?: string;
  error?: string;
}

/**
 * wSOL wrap/unwrap result
 */
export interface WrapResult {
  success: boolean;
  signature?: string;
  amount: number;
  direction: 'wrap' | 'unwrap';
  error?: string;
}

/**
 * JupiterClient — DeFi swap integration for AI agents
 *
 * Provides two levels of swap capability:
 * 1. Jupiter Aggregator API (mainnet — full DEX routing)
 * 2. SOL ↔ wSOL native wrapping (devnet — always available)
 *
 * On devnet, Jupiter routes may not be available, so the client
 * falls back to wSOL wrap/unwrap which is a real on-chain protocol
 * interaction using the SPL Token program.
 */
export class JupiterClient {
  private static readonly JUPITER_API = 'https://quote-api.jup.ag/v6';
  private connection: web3.Connection;

  constructor(connection: web3.Connection) {
    this.connection = connection;
  }

  // ─── Jupiter Aggregator API ──────────────────────────────────

  /**
   * Get a swap quote from Jupiter
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amountLamports: number,
    slippageBps: number = 50
  ): Promise<JupiterQuote> {
    const url = new URL(`${JupiterClient.JUPITER_API}/quote`);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amountLamports.toString());
    url.searchParams.set('slippageBps', slippageBps.toString());
    url.searchParams.set('swapMode', 'ExactIn');

    const response = await fetch(url.toString());
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jupiter quote failed (${response.status}): ${body}`);
    }

    return response.json() as Promise<JupiterQuote>;
  }

  /**
   * Get a swap transaction from Jupiter
   */
  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string
  ): Promise<JupiterSwapResponse> {
    const response = await fetch(`${JupiterClient.JUPITER_API}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jupiter swap tx failed (${response.status}): ${body}`);
    }

    return response.json() as Promise<JupiterSwapResponse>;
  }

  /**
   * Execute a full Jupiter swap: quote → build tx → sign → send
   *
   * Works on mainnet. On devnet, may fail if no liquidity exists —
   * use wrapSol/unwrapSol as the guaranteed devnet fallback.
   */
  async executeSwap(
    keypair: web3.Keypair,
    inputMint: string,
    outputMint: string,
    amountLamports: number,
    slippageBps: number = 50
  ): Promise<SwapResult> {
    try {
      // 1. Get quote
      console.log(`[Jupiter] Getting quote: ${inputMint} → ${outputMint}`);
      const quote = await this.getQuote(inputMint, outputMint, amountLamports, slippageBps);

      const routeLabels = quote.routePlan.map((r) => r.swapInfo.label).join(' → ');
      console.log(`[Jupiter] Route: ${routeLabels}`);
      console.log(`[Jupiter] In: ${quote.inAmount}  Out: ${quote.outAmount}`);

      // 2. Get swap transaction
      console.log(`[Jupiter] Building swap transaction...`);
      const swapResponse = await this.getSwapTransaction(
        quote,
        keypair.publicKey.toString()
      );

      // 3. Deserialize the versioned transaction
      const txBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
      const versionedTx = web3.VersionedTransaction.deserialize(txBuf);

      // 4. Sign with agent keypair
      versionedTx.sign([keypair]);

      // 5. Send and confirm
      console.log(`[Jupiter] Sending swap transaction...`);
      const signature = await this.connection.sendRawTransaction(
        versionedTx.serialize(),
        { skipPreflight: false, maxRetries: 3 }
      );

      await this.connection.confirmTransaction({
        signature,
        blockhash: versionedTx.message.recentBlockhash,
        lastValidBlockHeight: swapResponse.lastValidBlockHeight,
      });

      console.log(`[Jupiter] Swap confirmed: ${signature}`);

      return {
        success: true,
        signature,
        inputAmount: Number(quote.inAmount),
        outputAmount: Number(quote.outAmount),
        route: routeLabels,
      };
    } catch (error: any) {
      return {
        success: false,
        inputAmount: amountLamports,
        error: error.message,
      };
    }
  }

  // ─── wSOL Wrapping (always available on devnet) ──────────────

  /**
   * Wrap SOL → wSOL
   *
   * Creates or reuses an Associated Token Account for wSOL,
   * then transfers SOL into it by calling syncNative.
   * This is a real SPL Token program interaction.
   */
  async wrapSol(keypair: web3.Keypair, amountSol: number): Promise<WrapResult> {
    try {
      const lamports = Math.floor(amountSol * web3.LAMPORTS_PER_SOL);
      const wsolMint = new web3.PublicKey(KNOWN_MINTS.SOL);

      console.log(`[wSOL] Wrapping ${amountSol} SOL → wSOL`);

      // Get or create the wSOL ATA
      const ata = await splToken.getAssociatedTokenAddress(
        wsolMint,
        keypair.publicKey
      );

      const transaction = new web3.Transaction();

      // Check if ATA exists
      const ataInfo = await this.connection.getAccountInfo(ata);
      if (!ataInfo) {
        console.log(`[wSOL] Creating wSOL token account...`);
        transaction.add(
          splToken.createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            ata,
            keypair.publicKey,
            wsolMint
          )
        );
      }

      // Transfer SOL to the wSOL ATA
      transaction.add(
        web3.SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: ata,
          lamports,
        })
      );

      // Sync native — tells the token program to update the token balance
      transaction.add(
        splToken.createSyncNativeInstruction(ata)
      );

      // Sign and send
      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      transaction.sign(keypair);

      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false }
      );

      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      console.log(`[wSOL] Wrapped ${amountSol} SOL → wSOL: ${signature}`);

      return {
        success: true,
        signature,
        amount: amountSol,
        direction: 'wrap',
      };
    } catch (error: any) {
      return {
        success: false,
        amount: amountSol,
        direction: 'wrap',
        error: error.message,
      };
    }
  }

  /**
   * Unwrap wSOL → SOL
   *
   * Closes the wSOL ATA and reclaims the SOL balance + rent.
   */
  async unwrapSol(keypair: web3.Keypair): Promise<WrapResult> {
    try {
      const wsolMint = new web3.PublicKey(KNOWN_MINTS.SOL);
      const ata = await splToken.getAssociatedTokenAddress(
        wsolMint,
        keypair.publicKey
      );

      // Check current wSOL balance
      const ataInfo = await this.connection.getAccountInfo(ata);
      if (!ataInfo) {
        return {
          success: false,
          amount: 0,
          direction: 'unwrap',
          error: 'No wSOL account found',
        };
      }

      const tokenBalance = await this.connection.getTokenAccountBalance(ata);
      const wsolAmount = Number(tokenBalance.value.uiAmount || 0);
      console.log(`[wSOL] Unwrapping ${wsolAmount} wSOL → SOL`);

      // Close the wSOL account — balance is returned as SOL
      const transaction = new web3.Transaction().add(
        splToken.createCloseAccountInstruction(
          ata,
          keypair.publicKey,  // destination for SOL
          keypair.publicKey   // authority
        )
      );

      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      transaction.sign(keypair);

      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false }
      );

      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      console.log(`[wSOL] Unwrapped ${wsolAmount} wSOL → SOL: ${signature}`);

      return {
        success: true,
        signature,
        amount: wsolAmount,
        direction: 'unwrap',
      };
    } catch (error: any) {
      return {
        success: false,
        amount: 0,
        direction: 'unwrap',
        error: error.message,
      };
    }
  }

  /**
   * Get wSOL balance for a wallet
   */
  async getWsolBalance(owner: web3.PublicKey): Promise<number> {
    try {
      const wsolMint = new web3.PublicKey(KNOWN_MINTS.SOL);
      const ata = await splToken.getAssociatedTokenAddress(wsolMint, owner);
      const balance = await this.connection.getTokenAccountBalance(ata);
      return Number(balance.value.uiAmount || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get a human-readable swap quote (useful for agent decision-making)
   */
  async getReadableQuote(
    inputMint: string,
    outputMint: string,
    amountLamports: number,
    slippageBps: number = 50
  ): Promise<{
    inputAmount: string;
    outputAmount: string;
    priceImpact: string;
    route: string;
    minimumReceived: string;
  }> {
    const quote = await this.getQuote(inputMint, outputMint, amountLamports, slippageBps);

    return {
      inputAmount: quote.inAmount,
      outputAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
      route: quote.routePlan.map((r) => r.swapInfo.label).join(' → '),
      minimumReceived: quote.otherAmountThreshold,
    };
  }
}

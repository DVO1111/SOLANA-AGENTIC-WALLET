import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { AgenticWallet } from './AgenticWallet';

/**
 * Supported Token-2022 extensions for agentic wallets
 */
export type TokenExtension =
  | 'transfer-fees'
  | 'memo-required'
  | 'non-transferable'
  | 'metadata'
  | 'mint-close-authority'
  | 'permanent-delegate'
  | 'interest-bearing';

/**
 * Configuration for creating a Token-2022 mint with extensions
 */
export interface ExtendedMintConfig {
  /** Token decimals (default: 9) */
  decimals?: number;

  /** Transfer fee config: basis points (100 = 1%) and max fee in token base units */
  transferFee?: {
    feeBasisPoints: number;
    maxFee: bigint;
  };

  /** Require memo on every transfer to/from token accounts */
  memoRequired?: boolean;

  /** Non-transferable (soulbound) token — cannot be transferred after minting */
  nonTransferable?: boolean;

  /** On-chain metadata */
  metadata?: {
    name: string;
    symbol: string;
    uri: string;
    additionalMetadata?: [string, string][];
  };

  /** Allow the mint to be closed (reclaim rent SOL) */
  mintCloseAuthority?: boolean;

  /** Permanent delegate: this authority can transfer/burn any holder's tokens */
  permanentDelegate?: web3.PublicKey;

  /** Interest-bearing: annual rate in basis points (100 = 1%) */
  interestRate?: number;
}

/**
 * Result from creating an extended mint
 */
export interface ExtendedMintResult {
  mint: web3.PublicKey;
  extensions: TokenExtension[];
  decimals: number;
  transactionSignature: string;
}

/**
 * TokenExtensionsManager — Token-2022 extension operations for AI agent wallets
 *
 * Supports creating and managing tokens with:
 * - Transfer Fees (automated revenue collection)
 * - Memo Required (enforced audit trail)
 * - Non-Transferable / Soulbound (agent credentials)
 * - On-chain Metadata (token identity)
 * - Mint Close Authority (rent reclamation)
 * - Permanent Delegate (admin recovery)
 * - Interest-Bearing tokens
 */
export class TokenExtensionsManager {
  private wallet: AgenticWallet;
  private connection: web3.Connection;

  constructor(wallet: AgenticWallet, connection: web3.Connection) {
    this.wallet = wallet;
    this.connection = connection;
  }

  /**
   * Create a Token-2022 mint with one or more extensions
   */
  async createExtendedMint(config: ExtendedMintConfig): Promise<ExtendedMintResult> {
    const payer = this.wallet.getKeypair();
    const mintKeypair = web3.Keypair.generate();
    const decimals = config.decimals ?? 9;
    const extensions: TokenExtension[] = [];

    // Determine which extensions are active
    const extensionTypes: splToken.ExtensionType[] = [];

    if (config.transferFee) {
      extensionTypes.push(splToken.ExtensionType.TransferFeeConfig);
      extensions.push('transfer-fees');
    }
    if (config.nonTransferable) {
      extensionTypes.push(splToken.ExtensionType.NonTransferable);
      extensions.push('non-transferable');
    }
    if (config.mintCloseAuthority) {
      extensionTypes.push(splToken.ExtensionType.MintCloseAuthority);
      extensions.push('mint-close-authority');
    }
    if (config.permanentDelegate) {
      extensionTypes.push(splToken.ExtensionType.PermanentDelegate);
      extensions.push('permanent-delegate');
    }
    if (config.interestRate !== undefined) {
      extensionTypes.push(splToken.ExtensionType.InterestBearingConfig);
      extensions.push('interest-bearing');
    }
    if (config.metadata) {
      extensionTypes.push(splToken.ExtensionType.MetadataPointer);
      extensions.push('metadata');
    }

    // Calculate space needed for the mint account
    const mintSpace = splToken.getMintLen(extensionTypes);
    const lamports = await this.connection.getMinimumBalanceForRentExemption(mintSpace);

    // Build the transaction with all extension init instructions
    const transaction = new web3.Transaction();

    // 1. Create the account for the mint
    transaction.add(
      web3.SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintSpace,
        lamports,
        programId: splToken.TOKEN_2022_PROGRAM_ID,
      })
    );

    // 2. Initialize extensions (must come before InitializeMint)
    if (config.transferFee) {
      transaction.add(
        splToken.createInitializeTransferFeeConfigInstruction(
          mintKeypair.publicKey,
          payer.publicKey,        // transfer fee config authority
          payer.publicKey,        // withdraw withheld authority
          config.transferFee.feeBasisPoints,
          config.transferFee.maxFee,
          splToken.TOKEN_2022_PROGRAM_ID
        )
      );
    }

    if (config.mintCloseAuthority) {
      transaction.add(
        splToken.createInitializeMintCloseAuthorityInstruction(
          mintKeypair.publicKey,
          payer.publicKey,
          splToken.TOKEN_2022_PROGRAM_ID
        )
      );
    }

    if (config.nonTransferable) {
      transaction.add(
        splToken.createInitializeNonTransferableMintInstruction(
          mintKeypair.publicKey,
          splToken.TOKEN_2022_PROGRAM_ID
        )
      );
    }

    if (config.permanentDelegate) {
      transaction.add(
        splToken.createInitializePermanentDelegateInstruction(
          mintKeypair.publicKey,
          config.permanentDelegate,
          splToken.TOKEN_2022_PROGRAM_ID
        )
      );
    }

    if (config.interestRate !== undefined) {
      transaction.add(
        splToken.createInitializeInterestBearingMintInstruction(
          mintKeypair.publicKey,
          payer.publicKey,        // rate authority
          config.interestRate,
          splToken.TOKEN_2022_PROGRAM_ID
        )
      );
    }

    if (config.metadata) {
      transaction.add(
        splToken.createInitializeMetadataPointerInstruction(
          mintKeypair.publicKey,
          payer.publicKey,        // metadata authority
          mintKeypair.publicKey,  // metadata account (self-referencing for Token-2022)
          splToken.TOKEN_2022_PROGRAM_ID
        )
      );
    }

    // 3. Initialize the mint itself
    transaction.add(
      splToken.createInitializeMint2Instruction(
        mintKeypair.publicKey,
        decimals,
        payer.publicKey,           // mint authority
        payer.publicKey,           // freeze authority
        splToken.TOKEN_2022_PROGRAM_ID
      )
    );

    // 4. Initialize on-chain metadata (must come AFTER InitializeMint)
    if (config.metadata) {
      transaction.add(
        splToken.createInitializeInstruction({
          programId: splToken.TOKEN_2022_PROGRAM_ID,
          mint: mintKeypair.publicKey,
          metadata: mintKeypair.publicKey,
          name: config.metadata.name,
          symbol: config.metadata.symbol,
          uri: config.metadata.uri,
          mintAuthority: payer.publicKey,
          updateAuthority: payer.publicKey,
        })
      );

      // Add any additional metadata fields
      if (config.metadata.additionalMetadata) {
        for (const [key, value] of config.metadata.additionalMetadata) {
          transaction.add(
            splToken.createUpdateFieldInstruction({
              programId: splToken.TOKEN_2022_PROGRAM_ID,
              metadata: mintKeypair.publicKey,
              updateAuthority: payer.publicKey,
              field: key,
              value,
            })
          );
        }
      }
    }

    // Send and confirm
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer.publicKey;
    transaction.sign(payer, mintKeypair);

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false }
    );

    await this.connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    console.log(`[TokenExtensions] Created mint: ${mintKeypair.publicKey.toString()}`);
    console.log(`  Extensions: ${extensions.join(', ')}`);

    return {
      mint: mintKeypair.publicKey,
      extensions,
      decimals,
      transactionSignature: signature,
    };
  }

  /**
   * Create a Token-2022 Associated Token Account
   */
  async createExtendedTokenAccount(
    mint: web3.PublicKey,
    owner?: web3.PublicKey
  ): Promise<web3.PublicKey> {
    const payer = this.wallet.getKeypair();
    const tokenOwner = owner || payer.publicKey;

    const ata = await splToken.getOrCreateAssociatedTokenAccount(
      this.connection,
      payer,
      mint,
      tokenOwner,
      false,
      undefined,
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    return ata.address;
  }

  /**
   * Mint Token-2022 tokens to a destination
   */
  async mintExtendedTokens(
    mint: web3.PublicKey,
    destination: web3.PublicKey,
    amount: bigint
  ): Promise<string> {
    const payer = this.wallet.getKeypair();

    const signature = await splToken.mintTo(
      this.connection,
      payer,
      mint,
      destination,
      payer.publicKey,
      amount,
      [],
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    return signature;
  }

  /**
   * Transfer Token-2022 tokens (handles transfer fee extension automatically)
   */
  async transferExtendedTokens(
    mint: web3.PublicKey,
    source: web3.PublicKey,
    destination: web3.PublicKey,
    amount: bigint,
    hasTransferFee: boolean = false
  ): Promise<string> {
    const payer = this.wallet.getKeypair();

    if (hasTransferFee) {
      // Use transferChecked for tokens with transfer fees
      const decimals = await this.getMintDecimals(mint);
      const signature = await splToken.transferChecked(
        this.connection,
        payer,
        source,
        mint,
        destination,
        payer.publicKey,
        amount,
        decimals,
        [],
        undefined,
        splToken.TOKEN_2022_PROGRAM_ID
      );
      return signature;
    }

    const signature = await splToken.transfer(
      this.connection,
      payer,
      source,
      destination,
      payer.publicKey,
      amount,
      [],
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    return signature;
  }

  /**
   * Enable memo-required on a token account
   * After this, every transfer to/from this account must include a memo instruction
   */
  async enableMemoRequired(tokenAccount: web3.PublicKey): Promise<string> {
    const payer = this.wallet.getKeypair();

    const signature = await splToken.enableRequiredMemoTransfers(
      this.connection,
      payer,
      tokenAccount,
      payer.publicKey,
      [],
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    console.log(`[TokenExtensions] Memo required enabled on ${tokenAccount.toString()}`);
    return signature;
  }

  /**
   * Disable memo-required on a token account
   */
  async disableMemoRequired(tokenAccount: web3.PublicKey): Promise<string> {
    const payer = this.wallet.getKeypair();

    const signature = await splToken.disableRequiredMemoTransfers(
      this.connection,
      payer,
      tokenAccount,
      payer.publicKey,
      [],
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    return signature;
  }

  /**
   * Get transfer fee configuration from a mint
   */
  async getTransferFeeConfig(mint: web3.PublicKey): Promise<{
    feeBasisPoints: number;
    maxFee: bigint;
    transferFeeConfigAuthority: string | null;
    withdrawWithheldAuthority: string | null;
  } | null> {
    const mintInfo = await splToken.getMint(
      this.connection,
      mint,
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    const feeConfig = splToken.getTransferFeeConfig(mintInfo);
    if (!feeConfig) return null;

    return {
      feeBasisPoints: feeConfig.newerTransferFee.transferFeeBasisPoints,
      maxFee: feeConfig.newerTransferFee.maximumFee,
      transferFeeConfigAuthority: feeConfig.transferFeeConfigAuthority?.toString() || null,
      withdrawWithheldAuthority: feeConfig.withdrawWithheldAuthority?.toString() || null,
    };
  }

  /**
   * Get on-chain metadata for a Token-2022 mint
   */
  async getTokenMetadata(mint: web3.PublicKey): Promise<{
    name: string;
    symbol: string;
    uri: string;
    additionalMetadata: [string, string][];
  } | null> {
    try {
      const metadata = await splToken.getTokenMetadata(
        this.connection,
        mint,
        undefined,
        splToken.TOKEN_2022_PROGRAM_ID
      );

      if (!metadata) return null;

      return {
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        additionalMetadata: metadata.additionalMetadata as [string, string][],
      };
    } catch {
      return null;
    }
  }

  /**
   * Update on-chain metadata field
   */
  async updateMetadataField(
    mint: web3.PublicKey,
    field: string,
    value: string
  ): Promise<string> {
    const payer = this.wallet.getKeypair();

    const transaction = new web3.Transaction().add(
      splToken.createUpdateFieldInstruction({
        programId: splToken.TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: payer.publicKey,
        field,
        value,
      })
    );

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer.publicKey;
    transaction.sign(payer);

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize()
    );

    await this.connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return signature;
  }

  /**
   * Get the withheld transfer fees from a token account
   */
  async getWithheldFees(tokenAccount: web3.PublicKey): Promise<bigint> {
    const account = await splToken.getAccount(
      this.connection,
      tokenAccount,
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    const feeAmount = splToken.getTransferFeeAmount(account);
    if (!feeAmount) return 0n;

    return feeAmount.withheldAmount;
  }

  /**
   * Check which extensions a mint has
   */
  async getMintExtensions(mint: web3.PublicKey): Promise<TokenExtension[]> {
    const mintInfo = await splToken.getMint(
      this.connection,
      mint,
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    const extensions: TokenExtension[] = [];

    if (splToken.getTransferFeeConfig(mintInfo)) extensions.push('transfer-fees');
    if (splToken.getNonTransferable(mintInfo)) extensions.push('non-transferable');
    if (splToken.getMintCloseAuthority(mintInfo)) extensions.push('mint-close-authority');
    if (splToken.getMetadataPointerState(mintInfo)) extensions.push('metadata');

    return extensions;
  }

  /**
   * Get token balance for a Token-2022 account
   */
  async getExtendedTokenBalance(tokenAccount: web3.PublicKey): Promise<bigint> {
    const account = await splToken.getAccount(
      this.connection,
      tokenAccount,
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );

    return account.amount;
  }

  /**
   * Get the decimal count for a mint
   */
  private async getMintDecimals(mint: web3.PublicKey): Promise<number> {
    const mintInfo = await splToken.getMint(
      this.connection,
      mint,
      undefined,
      splToken.TOKEN_2022_PROGRAM_ID
    );
    return mintInfo.decimals;
  }

  /**
   * List all Token-2022 accounts owned by this wallet
   */
  async getExtendedTokenAccounts(): Promise<any[]> {
    const accounts = await this.connection.getParsedTokenAccountsByOwner(
      this.wallet.publicKey,
      { programId: splToken.TOKEN_2022_PROGRAM_ID }
    );
    return accounts.value;
  }
}

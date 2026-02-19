import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { AgenticWallet } from './AgenticWallet';

/**
 * TokenManager handles SPL token operations for agentic wallets
 */
export class TokenManager {
  private wallet: AgenticWallet;
  private connection: web3.Connection;

  constructor(wallet: AgenticWallet, connection: web3.Connection) {
    this.wallet = wallet;
    this.connection = connection;
  }

  /**
   * Get token account balance
   */
  async getTokenBalance(
    tokenAccountAddress: string
  ): Promise<number> {
    try {
      const account = await this.connection.getParsedAccountInfo(
        new web3.PublicKey(tokenAccountAddress)
      );

      if (!account.value || !account.value.data || typeof account.value.data === 'string') {
        throw new Error('Invalid token account');
      }

      const parsedData = account.value.data as any;
      const balance = parsedData.parsed?.info?.tokenAmount?.uiAmount || 0;
      return balance;
    } catch (error) {
      console.error('Error fetching token balance:', error);
      throw error;
    }
  }

  /**
   * Create an Associated Token Account (ATA) for SPL tokens
   */
  async createAssociatedTokenAccount(
    mintAddress: string
  ): Promise<web3.PublicKey> {
    try {
      const mint = new web3.PublicKey(mintAddress);
      const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.getKeypair(),
        mint,
        this.wallet.publicKey
      );
      return tokenAccount.address;
    } catch (error) {
      console.error('Error creating associated token account:', error);
      throw error;
    }
  }

  /**
   * Transfer SPL tokens
   */
  async transferToken(
    sourceTokenAccount: string,
    destinationTokenAccount: string,
    amount: number,
    decimals: number
  ): Promise<string> {
    try {
      const instruction = splToken.createTransferInstruction(
        new web3.PublicKey(sourceTokenAccount),
        new web3.PublicKey(destinationTokenAccount),
        this.wallet.publicKey,
        BigInt(amount) * BigInt(Math.pow(10, decimals)),
        []
      );

      const transaction = new web3.Transaction().add(instruction);
      const signature = await this.wallet.sendTransaction(transaction);
      return signature;
    } catch (error) {
      console.error('Error transferring token:', error);
      throw error;
    }
  }

  /**
   * Get all token accounts for wallet
   */
  async getTokenAccounts(): Promise<any[]> {
    try {
      const accounts = await this.connection.getParsedTokenAccountsByOwner(
        this.wallet.publicKey,
        { programId: splToken.TOKEN_PROGRAM_ID }
      );
      return accounts.value;
    } catch (error) {
      console.error('Error fetching token accounts:', error);
      throw error;
    }
  }

  /**
   * Get token metadata
   */
  async getTokenMetadata(mintAddress: string): Promise<any> {
    try {
      const mint = new web3.PublicKey(mintAddress);
      const account = await this.connection.getParsedAccountInfo(mint);
      return account.value;
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      throw error;
    }
  }
}

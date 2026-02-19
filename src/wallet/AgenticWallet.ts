import * as web3 from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AgenticWallet manages autonomous wallet operations for AI agents
 * Handles key management, transaction signing, and fund management
 */
export class AgenticWallet {
  private keypair: web3.Keypair;
  private connection: web3.Connection;
  public publicKey: web3.PublicKey;

  constructor(keypair: web3.Keypair, connection: web3.Connection) {
    this.keypair = keypair;
    this.connection = connection;
    this.publicKey = keypair.publicKey;
  }

  /**
   * Create a new wallet programmatically
   */
  static create(connection: web3.Connection): AgenticWallet {
    const keypair = web3.Keypair.generate();
    return new AgenticWallet(keypair, connection);
  }

  /**
   * Load wallet from a saved keypair file
   */
  static fromFile(
    filePath: string,
    connection: web3.Connection
  ): AgenticWallet {
    const secretKeyString = fs.readFileSync(filePath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    const keypair = web3.Keypair.fromSecretKey(secretKey);
    return new AgenticWallet(keypair, connection);
  }

  /**
   * Save wallet to a file (Store in secure location in production)
   */
  saveToFile(filePath: string): void {
    const secretKeyArray = Array.from(this.keypair.secretKey);
    fs.writeFileSync(filePath, JSON.stringify(secretKeyArray));
    console.log(`Wallet saved to ${filePath}`);
  }

  /**
   * Get wallet balance in SOL
   */
  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.publicKey);
    return balance / web3.LAMPORTS_PER_SOL;
  }

  /**
   * Get formatted wallet address
   */
  getAddress(): string {
    return this.publicKey.toString();
  }

  /**
   * Sign a transaction automatically (autonomous signing)
   */
  async signTransaction(
    transaction: web3.Transaction
  ): Promise<web3.Transaction> {
    transaction.sign(this.keypair);
    return transaction;
  }

  /**
   * Sign multiple transactions
   */
  async signTransactions(
    transactions: web3.Transaction[]
  ): Promise<web3.Transaction[]> {
    return transactions.map((tx) => {
      tx.sign(this.keypair);
      return tx;
    });
  }

  /**
   * Send a transaction autonomously
   */
  async sendTransaction(transaction: web3.Transaction): Promise<string> {
    try {
      // Set recent blockhash
      const blockHash = await this.connection.getRecentBlockhash();
      transaction.recentBlockhash = blockHash.blockhash;
      transaction.feePayer = this.publicKey;

      // Sign transaction
      await this.signTransaction(transaction);

      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize()
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature);

      return signature;
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Send SOL to another address
   */
  async sendSOL(destination: string, amount: number): Promise<string> {
    const transaction = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: this.publicKey,
        toPubkey: new web3.PublicKey(destination),
        lamports: amount * web3.LAMPORTS_PER_SOL,
      })
    );

    return this.sendTransaction(transaction);
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(limit: number = 10): Promise<any[]> {
    const signatures = await this.connection.getSignaturesForAddress(
      this.publicKey,
      { limit }
    );

    const transactions = await Promise.all(
      signatures.map((sig) => this.connection.getTransaction(sig.signature))
    );

    return transactions.filter((tx) => tx !== null);
  }

  /**
   * Get the underlying keypair (use with caution)
   */
  getKeypair(): web3.Keypair {
    return this.keypair;
  }
}

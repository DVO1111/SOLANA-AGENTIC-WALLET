import * as web3 from '@solana/web3.js';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { TokenManager } from '../wallet/TokenManager';

/**
 * Represents an AI agent with autonomous wallet capabilities
 */
export interface AgentConfig {
  id: string;
  name: string;
  strategy: 'trading' | 'liquidity-provider' | 'arbitrage' | 'custom';
  maxTransactionSize: number;
  autoApprove: boolean;
}

/**
 * Decision represents an action an agent wants to take
 */
export interface Decision {
  type: 'transfer' | 'swap' | 'stake' | 'harvest' | 'custom';
  targetAddress?: string;
  amount?: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Agent represents an autonomous AI agent managing a wallet
 */
export class Agent {
  private config: AgentConfig;
  private wallet: AgenticWallet;
  private tokenManager: TokenManager;
  private transactionLog: Array<{
    signature: string;
    decision: Decision;
    success: boolean;
    timestamp: number;
  }> = [];

  constructor(
    config: AgentConfig,
    wallet: AgenticWallet,
    tokenManager: TokenManager
  ) {
    this.config = config;
    this.wallet = wallet;
    this.tokenManager = tokenManager;
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Get agent's wallet address
   */
  getWalletAddress(): string {
    return this.wallet.getAddress();
  }

  /**
   * Evaluate a decision and optionally execute it
   */
  async evaluateDecision(decision: Decision): Promise<boolean> {
    console.log(
      `[${this.config.name}] Evaluating decision:`,
      decision
    );

    // Check transaction size
    if (
      decision.amount &&
      decision.amount > this.config.maxTransactionSize
    ) {
      console.log(
        `[${this.config.name}] Decision exceeds max transaction size`
      );
      return false;
    }

    // Auto-approve if enabled
    if (this.config.autoApprove) {
      return this.executeDecision(decision);
    }

    return false;
  }

  /**
   * Execute a decision (make a transaction)
   */
  async executeDecision(decision: Decision): Promise<boolean> {
    try {
      let signature: string;

      switch (decision.type) {
        case 'transfer':
          if (!decision.targetAddress || !decision.amount) {
            throw new Error('Invalid transfer decision');
          }
          signature = await this.wallet.sendSOL(
            decision.targetAddress,
            decision.amount
          );
          break;

        case 'custom':
          // Custom logic for other transaction types
          console.log(
            `[${this.config.name}] Executing custom decision`
          );
          signature = 'custom_' + Date.now();
          break;

        default:
          throw new Error(`Unknown decision type: ${decision.type}`);
      }

      // Log transaction
      this.transactionLog.push({
        signature,
        decision,
        success: true,
        timestamp: Date.now(),
      });

      console.log(
        `[${this.config.name}] Decision executed: ${signature}`
      );
      return true;
    } catch (error) {
      console.error(`[${this.config.name}] Failed to execute decision:`, error);
      this.transactionLog.push({
        signature: 'failed',
        decision,
        success: false,
        timestamp: Date.now(),
      });
      return false;
    }
  }

  /**
   * Get agent's wallet balance
   */
  async getBalance(): Promise<number> {
    return this.wallet.getBalance();
  }

  /**
   * Get transaction log
   */
  getTransactionLog(): typeof this.transactionLog {
    return this.transactionLog;
  }

  /**
   * Get agent stats
   */
  async getStats(): Promise<{
    id: string;
    name: string;
    walletAddress: string;
    balance: number;
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
  }> {
    const balance = await this.getBalance();
    const totalTransactions = this.transactionLog.length;
    const successfulTransactions = this.transactionLog.filter(
      (t) => t.success
    ).length;
    const failedTransactions = totalTransactions - successfulTransactions;

    return {
      id: this.config.id,
      name: this.config.name,
      walletAddress: this.wallet.getAddress(),
      balance,
      totalTransactions,
      successfulTransactions,
      failedTransactions,
    };
  }
}

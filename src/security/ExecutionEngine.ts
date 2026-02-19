import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { SecureKeyStore } from './SecureKeyStore';

/**
 * Action types supported by the execution engine
 */
export type ActionType =
  | 'transfer_sol'
  | 'transfer_token'
  | 'create_token_account'
  | 'close_account'
  | 'custom';

/**
 * Permission levels for agent operations
 */
export enum PermissionLevel {
  READ_ONLY = 0,        // Can only read balances/state
  LIMITED = 1,          // Small transactions only
  STANDARD = 2,         // Normal operations
  ELEVATED = 3,         // Large transactions
  ADMIN = 4,            // Full access
}

/**
 * Permission configuration for an agent
 */
export interface AgentPermissions {
  level: PermissionLevel;
  maxTransactionAmount: number;      // Max SOL per transaction
  maxDailyVolume: number;            // Max SOL per day
  allowedActions: ActionType[];      // Whitelisted action types
  allowedDestinations?: string[];    // Optional address whitelist
  rateLimit: number;                 // Max transactions per minute
  requiresApproval?: number;         // Amount threshold requiring approval
}

/**
 * Action parameters for execution
 */
export interface ActionParams {
  // Common fields
  action: ActionType;
  
  // For transfers
  destination?: string;
  amount?: number;
  
  // For token operations
  mint?: string;
  tokenAccount?: string;
  decimals?: number;
  
  // For custom actions
  instructions?: web3.TransactionInstruction[];
  
  // Metadata
  memo?: string;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Execution result
 */
export interface ExecutionResult {
  success: boolean;
  signature?: string;
  error?: string;
  action: ActionType;
  amount?: number;
  fee?: number;
  timestamp: number;
  confirmations?: number;
}

/**
 * Rate limiter for tracking transaction frequency
 */
class RateLimiter {
  private transactions: Map<string, number[]> = new Map();

  canExecute(agentId: string, limit: number): boolean {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    
    const txTimes = this.transactions.get(agentId) || [];
    const recentTxs = txTimes.filter((t) => now - t < windowMs);
    
    return recentTxs.length < limit;
  }

  recordTransaction(agentId: string): void {
    const txTimes = this.transactions.get(agentId) || [];
    txTimes.push(Date.now());
    
    // Keep only last 100 entries
    if (txTimes.length > 100) {
      txTimes.shift();
    }
    
    this.transactions.set(agentId, txTimes);
  }
}

/**
 * Volume tracker for daily limits
 */
class VolumeTracker {
  private dailyVolume: Map<string, { amount: number; date: string }> = new Map();

  getVolume(agentId: string): number {
    const today = new Date().toISOString().split('T')[0];
    const record = this.dailyVolume.get(agentId);
    
    if (!record || record.date !== today) {
      return 0;
    }
    
    return record.amount;
  }

  addVolume(agentId: string, amount: number): void {
    const today = new Date().toISOString().split('T')[0];
    const record = this.dailyVolume.get(agentId);
    
    if (!record || record.date !== today) {
      this.dailyVolume.set(agentId, { amount, date: today });
    } else {
      record.amount += amount;
    }
  }
}

/**
 * ExecutionEngine provides a safe API for agent transaction execution
 * 
 * Security features:
 * - Permission-scoped execution
 * - Rate limiting
 * - Daily volume limits
 * - Action whitelisting
 * - Destination whitelisting (optional)
 * - No direct key access - uses SecureKeyStore
 */
export class ExecutionEngine {
  private keyStore: SecureKeyStore;
  private connection: web3.Connection;
  private permissions: Map<string, AgentPermissions> = new Map();
  private rateLimiter: RateLimiter = new RateLimiter();
  private volumeTracker: VolumeTracker = new VolumeTracker();
  private executionLog: ExecutionResult[] = [];

  constructor(keyStore: SecureKeyStore, connection: web3.Connection) {
    this.keyStore = keyStore;
    this.connection = connection;
  }

  /**
   * Register an agent with specific permissions
   */
  registerAgent(agentId: string, permissions: AgentPermissions): void {
    this.permissions.set(agentId, permissions);
    console.log(`[ExecutionEngine] Agent registered: ${agentId}`);
    console.log(`  Permission Level: ${PermissionLevel[permissions.level]}`);
    console.log(`  Max Tx Amount: ${permissions.maxTransactionAmount} SOL`);
    console.log(`  Daily Limit: ${permissions.maxDailyVolume} SOL`);
    console.log(`  Rate Limit: ${permissions.rateLimit} tx/min`);
  }

  /**
   * Main execution API
   * 
   * Pattern: execute(action, parameters) → signed transaction → send
   */
  async execute(
    agentId: string,
    walletPassword: string,
    params: ActionParams
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // 1. Validate permissions
      const permCheck = this.validatePermissions(agentId, params);
      if (!permCheck.allowed) {
        return this.createResult(false, params.action, permCheck.reason);
      }

      // 2. Check rate limit
      const perms = this.permissions.get(agentId)!;
      if (!this.rateLimiter.canExecute(agentId, perms.rateLimit)) {
        return this.createResult(false, params.action, 'Rate limit exceeded');
      }

      // 3. Check daily volume
      const currentVolume = this.volumeTracker.getVolume(agentId);
      const txAmount = params.amount || 0;
      if (currentVolume + txAmount > perms.maxDailyVolume) {
        return this.createResult(
          false,
          params.action,
          `Daily volume limit exceeded (${currentVolume.toFixed(4)}/${perms.maxDailyVolume} SOL)`
        );
      }

      // 4. Retrieve key (in-memory only)
      const { secretKey, cleanup } = await this.keyStore.retrieveKey(
        agentId,
        walletPassword
      );

      try {
        // 5. Create keypair from decrypted key
        const keypair = web3.Keypair.fromSecretKey(secretKey);

        // 6. Build transaction based on action
        const transaction = await this.buildTransaction(keypair.publicKey, params);

        // 7. Get recent blockhash and set fee payer
        const { blockhash, lastValidBlockHeight } = 
          await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = keypair.publicKey;

        // 8. Sign transaction
        transaction.sign(keypair);

        // 9. Send transaction
        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          { skipPreflight: false }
        );

        // 10. Wait for confirmation
        await this.connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });

        // 11. Record successful execution
        this.rateLimiter.recordTransaction(agentId);
        this.volumeTracker.addVolume(agentId, txAmount);

        const result = this.createResult(true, params.action, undefined, {
          signature,
          amount: txAmount,
        });

        this.executionLog.push(result);
        
        console.log(`[ExecutionEngine] Executed ${params.action} for ${agentId}`);
        console.log(`  Signature: ${signature}`);
        console.log(`  Amount: ${txAmount} SOL`);
        console.log(`  Time: ${Date.now() - startTime}ms`);

        return result;

      } finally {
        // Always cleanup the decrypted key
        cleanup();
      }

    } catch (error: any) {
      const result = this.createResult(false, params.action, error.message);
      this.executionLog.push(result);
      return result;
    }
  }

  /**
   * Validate agent permissions for an action
   */
  private validatePermissions(
    agentId: string,
    params: ActionParams
  ): { allowed: boolean; reason?: string } {
    const perms = this.permissions.get(agentId);

    if (!perms) {
      return { allowed: false, reason: 'Agent not registered' };
    }

    // Check permission level
    if (perms.level === PermissionLevel.READ_ONLY) {
      return { allowed: false, reason: 'Read-only agent cannot execute transactions' };
    }

    // Check action whitelist
    if (!perms.allowedActions.includes(params.action)) {
      return { allowed: false, reason: `Action not allowed: ${params.action}` };
    }

    // Check transaction amount
    const amount = params.amount || 0;
    if (amount > perms.maxTransactionAmount) {
      return {
        allowed: false,
        reason: `Amount ${amount} exceeds max ${perms.maxTransactionAmount} SOL`,
      };
    }

    // Check destination whitelist (if configured)
    if (perms.allowedDestinations && params.destination) {
      if (!perms.allowedDestinations.includes(params.destination)) {
        return { allowed: false, reason: 'Destination not in whitelist' };
      }
    }

    // Check if approval required
    if (perms.requiresApproval && amount >= perms.requiresApproval) {
      // In production, this would trigger an approval workflow
      console.log(`[ExecutionEngine] Transaction requires approval: ${amount} SOL`);
      // For demo, we'll allow it
    }

    return { allowed: true };
  }

  /**
   * Build transaction based on action type
   */
  private async buildTransaction(
    fromPubkey: web3.PublicKey,
    params: ActionParams
  ): Promise<web3.Transaction> {
    const transaction = new web3.Transaction();

    switch (params.action) {
      case 'transfer_sol':
        if (!params.destination || params.amount === undefined) {
          throw new Error('Missing destination or amount for transfer_sol');
        }
        transaction.add(
          web3.SystemProgram.transfer({
            fromPubkey,
            toPubkey: new web3.PublicKey(params.destination),
            lamports: Math.floor(params.amount * web3.LAMPORTS_PER_SOL),
          })
        );
        break;

      case 'transfer_token':
        if (!params.tokenAccount || !params.destination || !params.amount || !params.decimals) {
          throw new Error('Missing parameters for transfer_token');
        }
        transaction.add(
          splToken.createTransferInstruction(
            new web3.PublicKey(params.tokenAccount),
            new web3.PublicKey(params.destination),
            fromPubkey,
            BigInt(params.amount * Math.pow(10, params.decimals))
          )
        );
        break;

      case 'create_token_account':
        if (!params.mint) {
          throw new Error('Missing mint for create_token_account');
        }
        // Get associated token account address
        const ata = await splToken.getAssociatedTokenAddress(
          new web3.PublicKey(params.mint),
          fromPubkey
        );
        transaction.add(
          splToken.createAssociatedTokenAccountInstruction(
            fromPubkey,
            ata,
            fromPubkey,
            new web3.PublicKey(params.mint)
          )
        );
        break;

      case 'custom':
        if (!params.instructions || params.instructions.length === 0) {
          throw new Error('Missing instructions for custom action');
        }
        params.instructions.forEach((ix) => transaction.add(ix));
        break;

      default:
        throw new Error(`Unknown action: ${params.action}`);
    }

    // Add memo if provided
    if (params.memo) {
      // Note: Would need @solana/spl-memo for proper memo program
      console.log(`[Memo] ${params.memo}`);
    }

    return transaction;
  }

  /**
   * Create execution result
   */
  private createResult(
    success: boolean,
    action: ActionType,
    error?: string,
    data?: { signature?: string; amount?: number }
  ): ExecutionResult {
    return {
      success,
      action,
      error,
      signature: data?.signature,
      amount: data?.amount,
      timestamp: Date.now(),
    };
  }

  /**
   * Get balance for an agent's wallet (read-only, no key needed)
   */
  async getBalance(agentId: string): Promise<number> {
    const info = this.keyStore.getWalletInfo(agentId);
    if (!info) {
      throw new Error(`Wallet not found: ${agentId}`);
    }

    const publicKey = new web3.PublicKey(info.publicKey);
    const balance = await this.connection.getBalance(publicKey);
    return balance / web3.LAMPORTS_PER_SOL;
  }

  /**
   * Get execution history for an agent
   */
  getExecutionHistory(agentId?: string): ExecutionResult[] {
    // In production, filter by agent
    return this.executionLog;
  }

  /**
   * Get agent's daily volume
   */
  getDailyVolume(agentId: string): number {
    return this.volumeTracker.getVolume(agentId);
  }

  /**
   * Get agent's remaining daily allowance
   */
  getRemainingAllowance(agentId: string): number {
    const perms = this.permissions.get(agentId);
    if (!perms) return 0;
    
    const used = this.volumeTracker.getVolume(agentId);
    return Math.max(0, perms.maxDailyVolume - used);
  }
}

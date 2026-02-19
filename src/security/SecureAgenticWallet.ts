import * as web3 from '@solana/web3.js';
import { SecureKeyStore } from './SecureKeyStore';
import {
  ExecutionEngine,
  ActionParams,
  ActionType,
  AgentPermissions,
  PermissionLevel,
  ExecutionResult,
} from './ExecutionEngine';

export { PermissionLevel, ActionType };
export type { AgentPermissions, ActionParams, ExecutionResult };

/**
 * Secure wallet configuration
 */
export interface SecureWalletConfig {
  agentId: string;
  name: string;
  permissions: AgentPermissions;
}

/**
 * SecureAgenticWallet - Production-ready secure wallet for AI agents
 * 
 * Features:
 * - Encrypted keypair storage (AES-256-GCM)
 * - In-memory decryption only during execution
 * - No raw key exposure to agent logic
 * - Permission-scoped execution
 * - Rate limiting and volume tracking
 * - Safe execution API: execute(action, params) → result
 */
export class SecureAgenticWallet {
  private keyStore: SecureKeyStore;
  private executionEngine: ExecutionEngine;
  private connection: web3.Connection;
  private config: SecureWalletConfig;
  private password: string;

  private constructor(
    keyStore: SecureKeyStore,
    executionEngine: ExecutionEngine,
    connection: web3.Connection,
    config: SecureWalletConfig,
    password: string
  ) {
    this.keyStore = keyStore;
    this.executionEngine = executionEngine;
    this.connection = connection;
    this.config = config;
    this.password = password;
  }

  /**
   * Create a new secure wallet with encrypted storage
   */
  static async create(
    connection: web3.Connection,
    keyStorePath: string,
    config: SecureWalletConfig,
    password: string
  ): Promise<SecureAgenticWallet> {
    const keyStore = new SecureKeyStore(keyStorePath);

    // Check if wallet already exists
    if (keyStore.hasWallet(config.agentId)) {
      throw new Error(`Wallet already exists: ${config.agentId}`);
    }

    // Generate new keypair
    const keypair = web3.Keypair.generate();

    // Store encrypted keypair
    await keyStore.storeKey(
      config.agentId,
      keypair.secretKey,
      keypair.publicKey.toString(),
      password,
      { name: config.name, createdAt: Date.now() }
    );

    // Create execution engine and register agent
    const executionEngine = new ExecutionEngine(keyStore, connection);
    executionEngine.registerAgent(config.agentId, config.permissions);

    console.log(`[SecureAgenticWallet] Created wallet: ${config.agentId}`);
    console.log(`  Public Key: ${keypair.publicKey.toString()}`);

    // Zero out the keypair secret key
    keypair.secretKey.fill(0);

    return new SecureAgenticWallet(
      keyStore,
      executionEngine,
      connection,
      config,
      password
    );
  }

  /**
   * Load an existing secure wallet
   */
  static async load(
    connection: web3.Connection,
    keyStorePath: string,
    agentId: string,
    permissions: AgentPermissions,
    password: string
  ): Promise<SecureAgenticWallet> {
    const keyStore = new SecureKeyStore(keyStorePath);

    if (!keyStore.hasWallet(agentId)) {
      throw new Error(`Wallet not found: ${agentId}`);
    }

    // Verify password by attempting to retrieve key
    const { cleanup } = await keyStore.retrieveKey(agentId, password);
    cleanup(); // Immediately cleanup - we just needed to verify

    // Get wallet info
    const info = keyStore.getWalletInfo(agentId);
    if (!info) {
      throw new Error(`Could not get wallet info: ${agentId}`);
    }

    const config: SecureWalletConfig = {
      agentId,
      name: info.metadata?.name || agentId,
      permissions,
    };

    // Create execution engine
    const executionEngine = new ExecutionEngine(keyStore, connection);
    executionEngine.registerAgent(agentId, permissions);

    console.log(`[SecureAgenticWallet] Loaded wallet: ${agentId}`);
    console.log(`  Public Key: ${info.publicKey}`);

    return new SecureAgenticWallet(
      keyStore,
      executionEngine,
      connection,
      config,
      password
    );
  }

  /**
   * Get wallet public address (safe - no key exposure)
   */
  getAddress(): string {
    const info = this.keyStore.getWalletInfo(this.config.agentId);
    return info?.publicKey || '';
  }

  /**
   * Get wallet balance (safe - no key exposure)
   */
  async getBalance(): Promise<number> {
    return this.executionEngine.getBalance(this.config.agentId);
  }

  /**
   * Execute an action through the safe execution API
   * 
   * Pattern: execute(action, params) → signed tx → send → result
   */
  async execute(params: ActionParams): Promise<ExecutionResult> {
    return this.executionEngine.execute(
      this.config.agentId,
      this.password,
      params
    );
  }

  /**
   * Convenience method: Transfer SOL
   */
  async transferSOL(destination: string, amount: number): Promise<ExecutionResult> {
    return this.execute({
      action: 'transfer_sol',
      destination,
      amount,
    });
  }

  /**
   * Convenience method: Transfer SPL Token
   */
  async transferToken(
    tokenAccount: string,
    destination: string,
    amount: number,
    decimals: number
  ): Promise<ExecutionResult> {
    return this.execute({
      action: 'transfer_token',
      tokenAccount,
      destination,
      amount,
      decimals,
    });
  }

  /**
   * Get remaining daily allowance
   */
  getRemainingAllowance(): number {
    return this.executionEngine.getRemainingAllowance(this.config.agentId);
  }

  /**
   * Get daily volume used
   */
  getDailyVolume(): number {
    return this.executionEngine.getDailyVolume(this.config.agentId);
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): ExecutionResult[] {
    return this.executionEngine.getExecutionHistory(this.config.agentId);
  }

  /**
   * Get wallet configuration
   */
  getConfig(): SecureWalletConfig {
    return { ...this.config };
  }

  /**
   * Check if an action would be permitted
   */
  canExecute(params: ActionParams): { allowed: boolean; reason?: string } {
    const perms = this.config.permissions;

    // Check action whitelist
    if (!perms.allowedActions.includes(params.action)) {
      return { allowed: false, reason: `Action not allowed: ${params.action}` };
    }

    // Check amount
    const amount = params.amount || 0;
    if (amount > perms.maxTransactionAmount) {
      return {
        allowed: false,
        reason: `Amount ${amount} exceeds max ${perms.maxTransactionAmount} SOL`,
      };
    }

    // Check daily volume
    const remaining = this.getRemainingAllowance();
    if (amount > remaining) {
      return {
        allowed: false,
        reason: `Amount ${amount} exceeds remaining allowance ${remaining.toFixed(4)} SOL`,
      };
    }

    // Check destination whitelist
    if (perms.allowedDestinations && params.destination) {
      if (!perms.allowedDestinations.includes(params.destination)) {
        return { allowed: false, reason: 'Destination not whitelisted' };
      }
    }

    return { allowed: true };
  }

  /**
   * Get volume statistics for reporting
   */
  getVolumeStats(): { dailyVolume: number; remaining: number; maxDaily: number } {
    const remaining = this.getRemainingAllowance();
    return {
      dailyVolume: this.config.permissions.maxDailyVolume - remaining,
      remaining,
      maxDaily: this.config.permissions.maxDailyVolume,
    };
  }

  /**
   * Cleanup any sensitive data
   */
  cleanup(): void {
    // Password is stored in memory - nothing to do here since
    // it's needed for future operations. The actual key cleanup
    // happens in ExecutionEngine after each transaction.
  }
}

/**
 * Create default permissions for different agent types
 */
export function createDefaultPermissions(
  type: 'trading' | 'liquidity' | 'monitor' | 'admin'
): AgentPermissions {
  switch (type) {
    case 'trading':
      return {
        level: PermissionLevel.STANDARD,
        maxTransactionAmount: 0.5,
        maxDailyVolume: 5,
        allowedActions: ['transfer_sol', 'transfer_token'],
        rateLimit: 30,
        requiresApproval: 1,
      };

    case 'liquidity':
      return {
        level: PermissionLevel.ELEVATED,
        maxTransactionAmount: 2,
        maxDailyVolume: 20,
        allowedActions: ['transfer_sol', 'transfer_token', 'create_token_account'],
        rateLimit: 20,
        requiresApproval: 5,
      };

    case 'monitor':
      return {
        level: PermissionLevel.READ_ONLY,
        maxTransactionAmount: 0,
        maxDailyVolume: 0,
        allowedActions: [],
        rateLimit: 100,
      };

    case 'admin':
      return {
        level: PermissionLevel.ADMIN,
        maxTransactionAmount: 10,
        maxDailyVolume: 100,
        allowedActions: ['transfer_sol', 'transfer_token', 'create_token_account', 'close_account', 'custom'],
        rateLimit: 60,
        requiresApproval: 10,
      };
  }
}

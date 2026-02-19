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
 * Agent state for the state machine
 */
export type AgentState = 'idle' | 'evaluating' | 'executing' | 'cooldown';

/**
 * Rule-based strategy context passed to the strategy evaluator
 */
export interface StrategyContext {
  balance: number;
  lastTradeTimestamp: number;
  totalTrades: number;
  successRate: number;
  averageTradeSize: number;
  consecutiveFailures: number;
  cooldownUntil: number;
}

/**
 * Agent represents an autonomous AI agent managing a wallet
 * 
 * Features:
 * - State machine: idle → evaluating → executing → cooldown → idle
 * - Rule-based strategy engine with weighted scoring
 * - Cooldown management between trades
 * - Risk adjustment based on success rate
 */
export class Agent {
  private config: AgentConfig;
  private wallet: AgenticWallet;
  private tokenManager: TokenManager;
  private state: AgentState = 'idle';
  private cooldownUntil: number = 0;
  private consecutiveFailures: number = 0;
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
   * Get current agent state
   */
  getState(): AgentState {
    if (Date.now() < this.cooldownUntil) return 'cooldown';
    return this.state;
  }

  /**
   * Get agent's wallet address
   */
  getWalletAddress(): string {
    return this.wallet.getAddress();
  }

  /**
   * Build strategy context from current agent state
   */
  private async buildStrategyContext(): Promise<StrategyContext> {
    const balance = await this.wallet.getBalance();
    const successfulTrades = this.transactionLog.filter(t => t.success).length;
    const totalTrades = this.transactionLog.length;
    const successRate = totalTrades > 0 ? successfulTrades / totalTrades : 1;
    const avgSize = totalTrades > 0
      ? this.transactionLog.reduce((sum, t) => sum + (t.decision.amount || 0), 0) / totalTrades
      : 0;
    const lastTrade = this.transactionLog.length > 0
      ? this.transactionLog[this.transactionLog.length - 1].timestamp
      : 0;

    return {
      balance,
      lastTradeTimestamp: lastTrade,
      totalTrades,
      successRate,
      averageTradeSize: avgSize,
      consecutiveFailures: this.consecutiveFailures,
      cooldownUntil: this.cooldownUntil,
    };
  }

  /**
   * Score a decision using rule-based strategy evaluation
   * Returns a score from 0 (reject) to 1 (strong accept)
   */
  scoreDecision(decision: Decision, ctx: StrategyContext): number {
    let score = 0.5; // Base score

    // Rule 1: Reject if in cooldown
    if (Date.now() < ctx.cooldownUntil) {
      return 0;
    }

    // Rule 2: Balance check — don't trade with < 10% remaining
    const amountRatio = (decision.amount || 0) / Math.max(ctx.balance, 0.001);
    if (amountRatio > 0.9) return 0; // Never spend > 90% of balance
    if (amountRatio > 0.5) score -= 0.2; // Penalize large trades
    if (amountRatio < 0.2) score += 0.1; // Reward conservative trades

    // Rule 3: Cooldown between trades (minimum 30 seconds)
    const timeSinceLastTrade = Date.now() - ctx.lastTradeTimestamp;
    if (ctx.lastTradeTimestamp > 0 && timeSinceLastTrade < 30000) {
      score -= 0.3; // Too soon
    } else if (timeSinceLastTrade > 300000) {
      score += 0.1; // Long gap, more likely to trade
    }

    // Rule 4: Risk adjustment based on consecutive failures
    if (ctx.consecutiveFailures >= 3) return 0; // Circuit breaker
    if (ctx.consecutiveFailures >= 1) score -= 0.15 * ctx.consecutiveFailures;

    // Rule 5: Success rate adjustment
    if (ctx.successRate < 0.5 && ctx.totalTrades >= 3) {
      score -= 0.2; // Bad track record
    } else if (ctx.successRate > 0.8 && ctx.totalTrades >= 3) {
      score += 0.1; // Good track record
    }

    // Rule 6: Strategy-specific scoring
    switch (this.config.strategy) {
      case 'trading':
        // Traders prefer transfers and swaps
        if (decision.type === 'transfer' || decision.type === 'swap') score += 0.15;
        if (decision.type === 'stake') score -= 0.1; // Traders don't stake
        break;
      case 'liquidity-provider':
        // LPs prefer staking and custom operations
        if (decision.type === 'stake' || decision.type === 'custom') score += 0.15;
        if (decision.type === 'harvest') score += 0.2; // LPs harvest rewards
        break;
      case 'arbitrage':
        // Arbitrageurs want fast, small trades
        if (decision.type === 'swap') score += 0.2;
        if (amountRatio < 0.1) score += 0.1; // Small = good for arb
        break;
      case 'custom':
        // No specific bias
        break;
    }

    return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
  }

  /**
   * Generate a smart decision based on strategy and current context
   */
  async generateDecision(peerAddresses: string[] = []): Promise<Decision | null> {
    const ctx = await this.buildStrategyContext();

    // Circuit breaker: don't trade if 3+ consecutive failures
    if (ctx.consecutiveFailures >= 3) {
      console.log(`[${this.config.name}] Circuit breaker active (${ctx.consecutiveFailures} failures)`);
      return null;
    }

    // Cooldown check
    if (Date.now() < ctx.cooldownUntil) {
      console.log(`[${this.config.name}] In cooldown until ${new Date(ctx.cooldownUntil).toISOString()}`);
      return null;
    }

    // Strategy-based decision generation
    switch (this.config.strategy) {
      case 'trading':
        return this.generateTradingDecision(ctx, peerAddresses);
      case 'liquidity-provider':
        return this.generateLPDecision(ctx, peerAddresses);
      case 'arbitrage':
        return this.generateArbitrageDecision(ctx, peerAddresses);
      default:
        return null;
    }
  }

  private generateTradingDecision(ctx: StrategyContext, peers: string[]): Decision | null {
    // Rule: need minimum balance to trade
    if (ctx.balance < 0.05) return null;

    // Rule: wait at least 30s between trades
    if (ctx.lastTradeTimestamp > 0 && Date.now() - ctx.lastTradeTimestamp < 30000) return null;

    // Determine trade size: 5-15% of balance, capped by maxTransactionSize
    const riskFactor = ctx.successRate > 0.7 ? 0.15 : 0.05;
    const tradeSize = Math.min(
      ctx.balance * riskFactor,
      this.config.maxTransactionSize
    );

    // Choose a peer address or generate one
    const target = peers.length > 0
      ? peers[Math.floor(Math.random() * peers.length)]
      : web3.Keypair.generate().publicKey.toString();

    return {
      type: 'transfer',
      targetAddress: target,
      amount: Math.round(tradeSize * 10000) / 10000, // 4 decimal precision
      timestamp: Date.now(),
      metadata: {
        strategy: 'trading',
        riskFactor,
        balanceBefore: ctx.balance,
        reason: `Balance ${ctx.balance.toFixed(4)} SOL > 0.05 threshold, risk factor ${riskFactor}`,
      },
    };
  }

  private generateLPDecision(ctx: StrategyContext, peers: string[]): Decision | null {
    if (ctx.balance < 0.03) return null;

    // LPs alternate between staking and harvesting
    const shouldHarvest = ctx.totalTrades > 0 && ctx.totalTrades % 3 === 0;

    if (shouldHarvest) {
      return {
        type: 'harvest',
        amount: 0,
        timestamp: Date.now(),
        metadata: {
          strategy: 'liquidity-provider',
          reason: `Harvesting after ${ctx.totalTrades} operations`,
        },
      };
    }

    // Provide liquidity: conservative sizing (5-10%)
    const lpSize = Math.min(ctx.balance * 0.08, this.config.maxTransactionSize);
    const target = peers.length > 0
      ? peers[Math.floor(Math.random() * peers.length)]
      : web3.Keypair.generate().publicKey.toString();

    return {
      type: 'transfer',
      targetAddress: target,
      amount: Math.round(lpSize * 10000) / 10000,
      timestamp: Date.now(),
      metadata: {
        strategy: 'liquidity-provider',
        reason: `LP provision of ${lpSize.toFixed(4)} SOL`,
      },
    };
  }

  private generateArbitrageDecision(ctx: StrategyContext, peers: string[]): Decision | null {
    if (ctx.balance < 0.02) return null;

    // Arb bots do small, fast trades
    const arbSize = Math.min(ctx.balance * 0.03, this.config.maxTransactionSize * 0.3);
    const target = peers.length > 0
      ? peers[Math.floor(Math.random() * peers.length)]
      : web3.Keypair.generate().publicKey.toString();

    return {
      type: 'transfer',
      targetAddress: target,
      amount: Math.round(arbSize * 10000) / 10000,
      timestamp: Date.now(),
      metadata: {
        strategy: 'arbitrage',
        reason: `Arb opportunity: ${arbSize.toFixed(4)} SOL`,
        speedPriority: 'high',
      },
    };
  }

  /**
   * Evaluate a decision and optionally execute it
   * Uses the scoring engine for intelligent decision-making
   */
  async evaluateDecision(decision: Decision): Promise<boolean> {
    this.state = 'evaluating';
    const ctx = await this.buildStrategyContext();
    const score = this.scoreDecision(decision, ctx);

    console.log(
      `[${this.config.name}] Decision score: ${score.toFixed(2)} (type=${decision.type}, amount=${decision.amount || 0})`
    );

    // Check transaction size hard limit
    if (
      decision.amount &&
      decision.amount > this.config.maxTransactionSize
    ) {
      console.log(
        `[${this.config.name}] REJECTED: exceeds max transaction size (${decision.amount} > ${this.config.maxTransactionSize})`
      );
      this.state = 'idle';
      return false;
    }

    // Score threshold for auto-approval
    const APPROVAL_THRESHOLD = 0.4;
    if (this.config.autoApprove && score >= APPROVAL_THRESHOLD) {
      return this.executeDecision(decision);
    } else if (score < APPROVAL_THRESHOLD) {
      console.log(
        `[${this.config.name}] REJECTED: score ${score.toFixed(2)} below threshold ${APPROVAL_THRESHOLD}`
      );
      this.state = 'idle';
      return false;
    }

    this.state = 'idle';
    return false;
  }

  /**
   * Execute a decision (make a transaction)
   */
  async executeDecision(decision: Decision): Promise<boolean> {
    this.state = 'executing';
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

        case 'swap':
          // Swap is simulated as a transfer with metadata
          if (!decision.targetAddress || !decision.amount) {
            throw new Error('Invalid swap decision');
          }
          signature = await this.wallet.sendSOL(
            decision.targetAddress,
            decision.amount
          );
          break;

        case 'stake':
          // Stake operation: transfer to a staking address
          if (!decision.targetAddress || !decision.amount) {
            throw new Error('Invalid stake decision');
          }
          signature = await this.wallet.sendSOL(
            decision.targetAddress,
            decision.amount
          );
          break;

        case 'harvest':
          // Harvest: log yield collection (no on-chain action in demo)
          console.log(`[${this.config.name}] Harvesting yields...`);
          signature = 'harvest_' + Date.now();
          break;

        case 'custom':
          console.log(
            `[${this.config.name}] Executing custom decision`
          );
          signature = 'custom_' + Date.now();
          break;

        default:
          throw new Error(`Unknown decision type: ${decision.type}`);
      }

      // Log success
      this.transactionLog.push({
        signature,
        decision,
        success: true,
        timestamp: Date.now(),
      });

      this.consecutiveFailures = 0;

      // Set cooldown: 15 seconds after successful trade
      this.cooldownUntil = Date.now() + 15000;
      this.state = 'cooldown';

      console.log(
        `[${this.config.name}] ✓ Executed: ${signature.slice(0, 20)}...`
      );
      return true;
    } catch (error) {
      console.error(`[${this.config.name}] ✗ Failed:`, error);
      this.transactionLog.push({
        signature: 'failed',
        decision,
        success: false,
        timestamp: Date.now(),
      });

      this.consecutiveFailures++;

      // Exponential cooldown after failures: 30s, 60s, 120s
      this.cooldownUntil = Date.now() + 30000 * Math.pow(2, this.consecutiveFailures - 1);
      this.state = 'cooldown';

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
    strategy: string;
    state: AgentState;
    walletAddress: string;
    balance: number;
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    successRate: string;
    consecutiveFailures: number;
  }> {
    const balance = await this.getBalance();
    const totalTransactions = this.transactionLog.length;
    const successfulTransactions = this.transactionLog.filter(
      (t) => t.success
    ).length;
    const failedTransactions = totalTransactions - successfulTransactions;
    const successRate = totalTransactions > 0
      ? ((successfulTransactions / totalTransactions) * 100).toFixed(1) + '%'
      : 'N/A';

    return {
      id: this.config.id,
      name: this.config.name,
      strategy: this.config.strategy,
      state: this.getState(),
      walletAddress: this.wallet.getAddress(),
      balance,
      totalTransactions,
      successfulTransactions,
      failedTransactions,
      successRate,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

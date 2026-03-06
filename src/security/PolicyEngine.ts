/**
 * PolicyEngine — Standalone spending-policy enforcement for AI agent wallets
 *
 * This is the "guardrail layer" that sits between agent decisions and
 * on-chain execution. Every transaction must pass ALL active policies
 * before the Execution Engine will sign it.
 *
 * Policies are composable: stack as many as you need per agent.
 *
 * Example:
 *   const policy = new PolicyEngine();
 *   policy.addPolicy(maxPerTransaction(0.5));
 *   policy.addPolicy(dailySpendingCap(5));
 *   policy.addPolicy(allowedRecipients(['addr1', 'addr2']));
 *   policy.addPolicy(actionWhitelist(['transfer_sol', 'swap']));
 *   policy.addPolicy(cooldownBetweenTx(10_000));
 *
 *   const result = policy.evaluate(request);
 *   if (!result.allowed) console.log(result.violations);
 */

/**
 * A transaction request to be evaluated against policies
 */
export interface PolicyRequest {
  agentId: string;
  action: string;
  amount: number;              // SOL amount
  destination?: string;
  timestamp: number;
  /** Program IDs of all instructions in the transaction (for program whitelist) */
  programIds?: string[];
}

/**
 * Result of a single policy check
 */
export interface PolicyViolation {
  policy: string;              // Policy name
  message: string;             // Human-readable reason
  severity: 'block' | 'warn'; // Block = hard stop, Warn = advisory
}

/**
 * Aggregate result of all policy evaluations
 */
export interface PolicyResult {
  allowed: boolean;
  violations: PolicyViolation[];
  checkedPolicies: number;
}

/**
 * A single policy function: takes a request + state, returns violations (if any)
 */
export type PolicyFn = (
  request: PolicyRequest,
  state: PolicyState
) => PolicyViolation[];

/**
 * Mutable state tracked by the PolicyEngine across evaluations
 */
export interface PolicyState {
  /** Total spent today (SOL), keyed by agentId */
  dailySpend: Map<string, { amount: number; date: string }>;
  /** Timestamp of last transaction per agentId */
  lastTxTimestamp: Map<string, number>;
  /** Number of transactions today per agentId */
  dailyTxCount: Map<string, { count: number; date: string }>;
}

// ─── Built-in Policy Factories ──────────────────────────────────

/**
 * Maximum SOL per single transaction
 */
export function maxPerTransaction(maxSol: number): PolicyFn {
  return (req) => {
    if (req.amount > maxSol) {
      return [{
        policy: 'max_per_transaction',
        message: `Amount ${req.amount} SOL exceeds per-tx limit of ${maxSol} SOL`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Daily aggregate spending cap
 */
export function dailySpendingCap(maxDailySol: number): PolicyFn {
  return (req, state) => {
    const today = new Date().toISOString().split('T')[0];
    const record = state.dailySpend.get(req.agentId);
    const spent = record && record.date === today ? record.amount : 0;

    if (spent + req.amount > maxDailySol) {
      return [{
        policy: 'daily_spending_cap',
        message: `Daily spend ${(spent + req.amount).toFixed(4)} SOL would exceed cap of ${maxDailySol} SOL (already spent ${spent.toFixed(4)})`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Daily transaction count limit
 */
export function dailyTransactionLimit(maxTx: number): PolicyFn {
  return (req, state) => {
    const today = new Date().toISOString().split('T')[0];
    const record = state.dailyTxCount.get(req.agentId);
    const count = record && record.date === today ? record.count : 0;

    if (count >= maxTx) {
      return [{
        policy: 'daily_transaction_limit',
        message: `Daily transaction count ${count} has reached limit of ${maxTx}`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Minimum cooldown between transactions (milliseconds)
 */
export function cooldownBetweenTx(cooldownMs: number): PolicyFn {
  return (req, state) => {
    const lastTs = state.lastTxTimestamp.get(req.agentId) || 0;
    const elapsed = req.timestamp - lastTs;

    if (lastTs > 0 && elapsed < cooldownMs) {
      return [{
        policy: 'cooldown_between_tx',
        message: `Only ${elapsed}ms since last tx, cooldown requires ${cooldownMs}ms`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Whitelist of allowed action types
 */
export function actionWhitelist(allowed: string[]): PolicyFn {
  return (req) => {
    if (!allowed.includes(req.action)) {
      return [{
        policy: 'action_whitelist',
        message: `Action '${req.action}' not in whitelist: [${allowed.join(', ')}]`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Whitelist of allowed recipient addresses
 */
export function allowedRecipients(addresses: string[]): PolicyFn {
  return (req) => {
    if (req.destination && !addresses.includes(req.destination)) {
      return [{
        policy: 'allowed_recipients',
        message: `Destination ${req.destination?.slice(0, 12)}... not in allowed list`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Minimum balance reserve — agent must keep at least X SOL
 */
export function minimumBalanceReserve(reserveSol: number, getCurrentBalance: () => number): PolicyFn {
  return (req) => {
    const balance = getCurrentBalance();
    if (balance - req.amount < reserveSol) {
      return [{
        policy: 'minimum_balance_reserve',
        message: `Balance ${balance.toFixed(4)} - ${req.amount.toFixed(4)} would drop below reserve of ${reserveSol} SOL`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Maximum single transaction as percentage of balance
 */
export function maxPercentOfBalance(maxPercent: number, getCurrentBalance: () => number): PolicyFn {
  return (req) => {
    const balance = getCurrentBalance();
    const percent = (req.amount / Math.max(balance, 0.0001)) * 100;
    if (percent > maxPercent) {
      return [{
        policy: 'max_percent_of_balance',
        message: `Amount is ${percent.toFixed(1)}% of balance, exceeds ${maxPercent}% limit`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Time-of-day trading window (UTC hours)
 */
export function tradingWindow(startHourUTC: number, endHourUTC: number): PolicyFn {
  return () => {
    const hour = new Date().getUTCHours();
    if (hour < startHourUTC || hour >= endHourUTC) {
      return [{
        policy: 'trading_window',
        message: `Current hour ${hour} UTC is outside trading window ${startHourUTC}-${endHourUTC} UTC`,
        severity: 'block',
      }];
    }
    return [];
  };
}

/**
 * Whitelist of allowed Solana program IDs.
 * Prevents agents from signing instructions to unapproved on-chain programs.
 *
 * Example: only allow System Program, Token Program, and Memo:
 *   allowedProgramIds([
 *     '11111111111111111111111111111111',      // System
 *     'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token
 *     'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', // Memo v2
 *   ])
 */
export function allowedProgramIds(programIds: string[]): PolicyFn {
  const allowed = new Set(programIds);
  return (req) => {
    if (!req.programIds || req.programIds.length === 0) {
      return []; // No instruction-level data — skip (checked elsewhere)
    }
    const forbidden = req.programIds.filter((pid) => !allowed.has(pid));
    if (forbidden.length > 0) {
      return [{
        policy: 'allowed_program_ids',
        message: `Forbidden program(s): ${forbidden.map((p) => p.slice(0, 12) + '...').join(', ')}. Allowed: ${programIds.map((p) => p.slice(0, 12) + '...').join(', ')}`,
        severity: 'block',
      }];
    }
    return [];
  };
}

// ─── PolicyEngine ───────────────────────────────────────────────

/**
 * PolicyEngine composes multiple policy functions and evaluates
 * transaction requests against all of them. If any policy returns
 * a 'block' violation, the transaction is denied.
 *
 * The engine maintains per-agent state (daily spend, tx counts, etc.)
 * that persists across evaluations within the same runtime.
 */
export class PolicyEngine {
  private policies: Array<{ name: string; fn: PolicyFn }> = [];
  private state: PolicyState = {
    dailySpend: new Map(),
    lastTxTimestamp: new Map(),
    dailyTxCount: new Map(),
  };

  /**
   * Add a policy to the engine
   */
  addPolicy(fn: PolicyFn, name?: string): void {
    this.policies.push({
      name: name || `policy_${this.policies.length + 1}`,
      fn,
    });
  }

  /**
   * Evaluate a transaction request against all policies
   */
  evaluate(request: PolicyRequest): PolicyResult {
    const violations: PolicyViolation[] = [];

    for (const { fn } of this.policies) {
      const result = fn(request, this.state);
      violations.push(...result);
    }

    const blocked = violations.some((v) => v.severity === 'block');

    return {
      allowed: !blocked,
      violations,
      checkedPolicies: this.policies.length,
    };
  }

  /**
   * Record a successful transaction (updates internal state)
   * Call this AFTER a transaction is confirmed.
   */
  recordTransaction(agentId: string, amount: number): void {
    const today = new Date().toISOString().split('T')[0];

    // Update daily spend
    const spendRecord = this.state.dailySpend.get(agentId);
    if (!spendRecord || spendRecord.date !== today) {
      this.state.dailySpend.set(agentId, { amount, date: today });
    } else {
      spendRecord.amount += amount;
    }

    // Update last tx timestamp
    this.state.lastTxTimestamp.set(agentId, Date.now());

    // Update daily tx count
    const countRecord = this.state.dailyTxCount.get(agentId);
    if (!countRecord || countRecord.date !== today) {
      this.state.dailyTxCount.set(agentId, { count: 1, date: today });
    } else {
      countRecord.count++;
    }
  }

  /**
   * Get a snapshot of policy state for an agent
   */
  getAgentPolicyState(agentId: string): {
    dailySpend: number;
    txCount: number;
    lastTxMs: number;
  } {
    const today = new Date().toISOString().split('T')[0];
    const spend = this.state.dailySpend.get(agentId);
    const count = this.state.dailyTxCount.get(agentId);

    return {
      dailySpend: spend && spend.date === today ? spend.amount : 0,
      txCount: count && count.date === today ? count.count : 0,
      lastTxMs: this.state.lastTxTimestamp.get(agentId) || 0,
    };
  }

  /**
   * List all registered policies
   */
  listPolicies(): string[] {
    return this.policies.map((p) => p.name);
  }

  /**
   * Get total number of policies
   */
  get policyCount(): number {
    return this.policies.length;
  }
}

// ─── Preset Policy Bundles ──────────────────────────────────────

/**
 * Create a conservative policy bundle suitable for trading agents
 */
export function createTradingPolicies(): PolicyEngine {
  const engine = new PolicyEngine();
  engine.addPolicy(maxPerTransaction(0.5), 'max_per_tx_0.5');
  engine.addPolicy(dailySpendingCap(5), 'daily_cap_5');
  engine.addPolicy(dailyTransactionLimit(100), 'daily_tx_limit_100');
  engine.addPolicy(cooldownBetweenTx(5000), 'cooldown_5s');
  engine.addPolicy(actionWhitelist(['transfer_sol', 'transfer_token', 'swap', 'write_memo']), 'trading_actions');
  engine.addPolicy(allowedProgramIds([
    '11111111111111111111111111111111',                        // System Program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',            // Token Program
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',           // Associated Token Account
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',            // Memo v2
    'So11111111111111111111111111111111111111112',              // Wrapped SOL
  ]), 'trading_programs');
  return engine;
}

/**
 * Create a strict policy bundle suitable for LP/staking agents
 */
export function createLiquidityPolicies(): PolicyEngine {
  const engine = new PolicyEngine();
  engine.addPolicy(maxPerTransaction(2), 'max_per_tx_2');
  engine.addPolicy(dailySpendingCap(20), 'daily_cap_20');
  engine.addPolicy(dailyTransactionLimit(50), 'daily_tx_limit_50');
  engine.addPolicy(cooldownBetweenTx(10000), 'cooldown_10s');
  engine.addPolicy(
    actionWhitelist(['transfer_sol', 'transfer_token', 'create_token_account', 'swap', 'write_memo']),
    'lp_actions'
  );
  engine.addPolicy(allowedProgramIds([
    '11111111111111111111111111111111',                        // System Program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',            // Token Program
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',            // Token-2022
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',           // Associated Token Account
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',            // Memo v2
    'So11111111111111111111111111111111111111112',              // Wrapped SOL
  ]), 'lp_programs');
  return engine;
}

/**
 * Create a minimal read-heavy policy (monitoring agents)
 */
export function createMonitorPolicies(): PolicyEngine {
  const engine = new PolicyEngine();
  engine.addPolicy(maxPerTransaction(0), 'no_spending');
  engine.addPolicy(dailySpendingCap(0), 'zero_daily');
  engine.addPolicy(actionWhitelist(['write_memo']), 'memo_only');
  return engine;
}

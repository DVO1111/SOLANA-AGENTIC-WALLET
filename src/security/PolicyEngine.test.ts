import {
  PolicyEngine,
  maxPerTransaction,
  dailySpendingCap,
  dailyTransactionLimit,
  cooldownBetweenTx,
  actionWhitelist,
  allowedRecipients,
  maxPercentOfBalance,
  createTradingPolicies,
  createLiquidityPolicies,
  createMonitorPolicies,
} from './PolicyEngine';
import type { PolicyRequest } from './PolicyEngine';

function makeRequest(overrides: Partial<PolicyRequest> = {}): PolicyRequest {
  return {
    agentId: 'test-agent',
    action: 'transfer_sol',
    amount: 0.1,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('PolicyEngine', () => {
  describe('maxPerTransaction', () => {
    it('allows amounts within limit', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(maxPerTransaction(1));
      const result = engine.evaluate(makeRequest({ amount: 0.5 }));
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('blocks amounts exceeding limit', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(maxPerTransaction(0.1));
      const result = engine.evaluate(makeRequest({ amount: 0.5 }));
      expect(result.allowed).toBe(false);
      expect(result.violations[0].policy).toBe('max_per_transaction');
    });
  });

  describe('dailySpendingCap', () => {
    it('allows first transaction within cap', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(dailySpendingCap(1));
      const result = engine.evaluate(makeRequest({ amount: 0.5 }));
      expect(result.allowed).toBe(true);
    });

    it('blocks when daily cap would be exceeded', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(dailySpendingCap(1));
      // Record prior spending
      engine.recordTransaction('test-agent', 0.8);
      const result = engine.evaluate(makeRequest({ amount: 0.5 }));
      expect(result.allowed).toBe(false);
      expect(result.violations[0].policy).toBe('daily_spending_cap');
    });
  });

  describe('dailyTransactionLimit', () => {
    it('allows transactions under limit', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(dailyTransactionLimit(3));
      const result = engine.evaluate(makeRequest());
      expect(result.allowed).toBe(true);
    });

    it('blocks when tx count reached', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(dailyTransactionLimit(2));
      engine.recordTransaction('test-agent', 0.1);
      engine.recordTransaction('test-agent', 0.1);
      const result = engine.evaluate(makeRequest());
      expect(result.allowed).toBe(false);
    });
  });

  describe('cooldownBetweenTx', () => {
    it('allows when enough time has passed', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(cooldownBetweenTx(1000));
      const result = engine.evaluate(makeRequest());
      expect(result.allowed).toBe(true);
    });

    it('blocks when within cooldown window', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(cooldownBetweenTx(60000));
      engine.recordTransaction('test-agent', 0.1);
      const result = engine.evaluate(makeRequest({ timestamp: Date.now() + 100 }));
      expect(result.allowed).toBe(false);
      expect(result.violations[0].policy).toBe('cooldown_between_tx');
    });
  });

  describe('actionWhitelist', () => {
    it('allows whitelisted actions', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(actionWhitelist(['transfer_sol', 'swap']));
      const result = engine.evaluate(makeRequest({ action: 'swap' }));
      expect(result.allowed).toBe(true);
    });

    it('blocks non-whitelisted actions', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(actionWhitelist(['transfer_sol']));
      const result = engine.evaluate(makeRequest({ action: 'custom' }));
      expect(result.allowed).toBe(false);
    });
  });

  describe('allowedRecipients', () => {
    it('allows whitelisted destinations', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(allowedRecipients(['addr1', 'addr2']));
      const result = engine.evaluate(makeRequest({ destination: 'addr1' }));
      expect(result.allowed).toBe(true);
    });

    it('blocks non-whitelisted destinations', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(allowedRecipients(['addr1']));
      const result = engine.evaluate(makeRequest({ destination: 'addr-unknown' }));
      expect(result.allowed).toBe(false);
    });
  });

  describe('maxPercentOfBalance', () => {
    it('allows within percent threshold', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(maxPercentOfBalance(50, () => 10));
      const result = engine.evaluate(makeRequest({ amount: 3 }));
      expect(result.allowed).toBe(true);
    });

    it('blocks when exceeding percent', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(maxPercentOfBalance(20, () => 1));
      const result = engine.evaluate(makeRequest({ amount: 0.5 }));
      expect(result.allowed).toBe(false);
    });
  });

  describe('composability', () => {
    it('passes when all policies allow', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(maxPerTransaction(1));
      engine.addPolicy(dailySpendingCap(10));
      engine.addPolicy(actionWhitelist(['transfer_sol', 'swap']));
      const result = engine.evaluate(makeRequest({ amount: 0.5 }));
      expect(result.allowed).toBe(true);
      expect(result.checkedPolicies).toBe(3);
    });

    it('fails when any single policy blocks', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(maxPerTransaction(0.01)); // will block
      engine.addPolicy(actionWhitelist(['transfer_sol'])); // will pass
      const result = engine.evaluate(makeRequest({ amount: 0.5 }));
      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(1);
    });

    it('collects violations from multiple policies', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(maxPerTransaction(0.01));
      engine.addPolicy(actionWhitelist(['swap']));
      const result = engine.evaluate(makeRequest({ action: 'transfer_sol', amount: 0.5 }));
      expect(result.violations.length).toBe(2);
    });
  });

  describe('state tracking', () => {
    it('tracks daily spend correctly', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(dailySpendingCap(1));
      engine.recordTransaction('agent-a', 0.3);
      engine.recordTransaction('agent-a', 0.2);
      const state = engine.getAgentPolicyState('agent-a');
      expect(state.dailySpend).toBeCloseTo(0.5);
      expect(state.txCount).toBe(2);
    });

    it('isolates state between agents', () => {
      const engine = new PolicyEngine();
      engine.recordTransaction('agent-a', 1);
      engine.recordTransaction('agent-b', 2);
      expect(engine.getAgentPolicyState('agent-a').dailySpend).toBe(1);
      expect(engine.getAgentPolicyState('agent-b').dailySpend).toBe(2);
    });
  });

  describe('preset bundles', () => {
    it('createTradingPolicies has expected policies', () => {
      const engine = createTradingPolicies();
      expect(engine.policyCount).toBe(5);
      expect(engine.listPolicies()).toContain('max_per_tx_0.5');
    });

    it('createLiquidityPolicies has expected policies', () => {
      const engine = createLiquidityPolicies();
      expect(engine.policyCount).toBe(5);
    });

    it('createMonitorPolicies blocks spending', () => {
      const engine = createMonitorPolicies();
      const result = engine.evaluate(makeRequest({ amount: 0.01 }));
      expect(result.allowed).toBe(false);
    });
  });
});

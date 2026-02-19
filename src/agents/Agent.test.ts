import * as web3 from '@solana/web3.js';
import { Agent, AgentConfig } from '../agents/Agent';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { TokenManager } from '../wallet/TokenManager';

describe('Agent', () => {
  let agent: Agent;
  let wallet: AgenticWallet;
  let tokenManager: TokenManager;
  let connection: web3.Connection;

  beforeAll(() => {
    connection = new web3.Connection('https://api.devnet.solana.com', 'confirmed');
    wallet = AgenticWallet.create(connection);
    tokenManager = new TokenManager(wallet, connection);
  });

  beforeEach(() => {
    const config: AgentConfig = {
      id: 'test-agent-1',
      name: 'Test Trading Bot',
      strategy: 'trading',
      maxTransactionSize: 1,
      autoApprove: true,
    };

    agent = new Agent(config, wallet, tokenManager);
  });

  test('should create an agent', () => {
    expect(agent).toBeDefined();
    expect(agent.getConfig().id).toBe('test-agent-1');
  });

  test('should get wallet address', () => {
    const address = agent.getWalletAddress();
    expect(address).toBeDefined();
    expect(address).toMatch(/^[1-9A-HJ-NP-Z]{32,35}$/);
  });

  test('should get agent config', () => {
    const config = agent.getConfig();
    expect(config.name).toBe('Test Trading Bot');
    expect(config.strategy).toBe('trading');
    expect(config.maxTransactionSize).toBe(1);
  });

  test('should reject decision exceeding maxTransactionSize', async () => {
    const decision = {
      type: 'transfer' as const,
      targetAddress: web3.Keypair.generate().publicKey.toString(),
      amount: 5, // Exceeds max of 1
      timestamp: Date.now(),
    };

    const result = await agent.evaluateDecision(decision);
    expect(result).toBe(false);
  });

  test('should get agent stats', async () => {
    const stats = await agent.getStats();

    expect(stats.id).toBe('test-agent-1');
    expect(stats.name).toBe('Test Trading Bot');
    expect(stats.walletAddress).toBeDefined();
    expect(typeof stats.balance).toBe('number');
    expect(stats.totalTransactions).toBeGreaterThanOrEqual(0);
  });

  test('should maintain transaction log', async () => {
    const initialLog = agent.getTransactionLog();
    expect(Array.isArray(initialLog)).toBe(true);
    expect(initialLog.length).toBe(0);
  });

  test('should create agent with different strategies', () => {
    const strategies: Array<'trading' | 'liquidity-provider' | 'arbitrage' | 'custom'> = [
      'trading',
      'liquidity-provider',
      'arbitrage',
      'custom',
    ];

    strategies.forEach((strategy) => {
      const config: AgentConfig = {
        id: `agent-${strategy}`,
        name: `Agent ${strategy}`,
        strategy,
        maxTransactionSize: 1,
        autoApprove: true,
      };

      const testAgent = new Agent(config, wallet, tokenManager);
      expect(testAgent.getConfig().strategy).toBe(strategy);
    });
  });
});

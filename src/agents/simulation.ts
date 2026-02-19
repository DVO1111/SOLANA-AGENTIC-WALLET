import * as web3 from '@solana/web3.js';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { TokenManager } from '../wallet/TokenManager';
import { Agent, AgentConfig, Decision } from './Agent';

type SimulationLogEntry = {
  timestamp: number;
  agentId: string;
  action: string;
  details: any;
};

/**
 * MultiAgentTestHarness manages multiple agents in a simulation environment
 */
export class MultiAgentTestHarness {
  private agents: Map<string, Agent> = new Map();
  private connection: web3.Connection;
  private simulationLog: SimulationLogEntry[] = [];

  constructor(connection: web3.Connection) {
    this.connection = connection;
  }

  /**
   * Register a new agent with the harness
   */
  async registerAgent(config: AgentConfig): Promise<Agent> {
    // Create wallet for agent
    const wallet = AgenticWallet.create(this.connection);
    const tokenManager = new TokenManager(wallet, this.connection);

    // Create agent
    const agent = new Agent(config, wallet, tokenManager);

    // Store agent
    this.agents.set(config.id, agent);

    this.simulationLog.push({
      timestamp: Date.now(),
      agentId: config.id,
      action: 'AGENT_REGISTERED',
      details: { name: config.name, strategy: config.strategy },
    });

    console.log(`Registered agent: ${config.name} (${config.id})`);
    console.log(`Agent wallet: ${wallet.getAddress()}`);

    return agent;
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all agents
   */
  listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Simulate a decision for an agent
   */
  async simulateAgentDecision(
    agentId: string,
    decision: Decision
  ): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.simulationLog.push({
      timestamp: Date.now(),
      agentId,
      action: 'DECISION_EVALUATED',
      details: { decision },
    });

    const result = await agent.evaluateDecision(decision);

    if (result) {
      this.simulationLog.push({
        timestamp: Date.now(),
        agentId,
        action: 'DECISION_EXECUTED',
        details: { decision, result },
      });
    }

    return result;
  }

  /**
   * Run a trading simulation round
   */
  async runSimulationRound(roundNumber: number): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Simulation Round ${roundNumber}`);
    console.log(`${'='.repeat(60)}\n`);

    for (const agent of this.agents.values()) {
      const config = agent.getConfig();
      const balance = await agent.getBalance();

      console.log(`\n[${config.name}] Balance: ${balance} SOL`);

      // Simulate decision based on strategy
      if (config.strategy === 'trading' && balance > 0.1) {
        // Simulate a trading decision
        const decision: Decision = {
          type: 'transfer',
          targetAddress: web3.Keypair.generate().publicKey.toString(),
          amount: Math.min(0.01, balance * 0.1),
          timestamp: Date.now(),
          metadata: { roundNumber },
        };

        await this.simulateAgentDecision(config.id, decision);
      } else if (
        config.strategy === 'liquidity-provider' &&
        balance > 0.05
      ) {
        // Simulate a liquidity provision decision
        const decision: Decision = {
          type: 'custom',
          amount: Math.min(0.05, balance * 0.2),
          timestamp: Date.now(),
          metadata: { roundNumber, strategyType: 'liquidity-provision' },
        };

        await this.simulateAgentDecision(config.id, decision);
      }
    }
  }

  /**
   * Get simulation report
   */
  async getSimulationReport(): Promise<{
    totalAgents: number;
    agentStats: any[];
    simulationLog: SimulationLogEntry[];
  }> {
    const agentStats = await Promise.all(
      Array.from(this.agents.values()).map((agent) => agent.getStats())
    );

    return {
      totalAgents: this.agents.size,
      agentStats,
      simulationLog: this.simulationLog,
    };
  }

  /**
   * Print simulation report
   */
  async printReport(): Promise<void> {
    const report = await this.getSimulationReport();

    console.log(`\n${'='.repeat(60)}`);
    console.log('SIMULATION REPORT');
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Total Agents: ${report.totalAgents}\n`);

    console.log('Agent Statistics:');
    console.log('-'.repeat(60));
    for (const stats of report.agentStats) {
      console.log(`Agent: ${stats.name} (${stats.id})`);
      console.log(`  Wallet: ${stats.walletAddress}`);
      console.log(`  Balance: ${stats.balance.toFixed(6)} SOL`);
      console.log(
        `  Transactions: ${stats.successfulTransactions}/${stats.totalTransactions} successful`
      );
      console.log('');
    }
  }

  /**
   * Fund agents with SOL (for devnet testing)
   */
  async fundAgentsFromFaucet(adminWallet: AgenticWallet): Promise<void> {
    console.log('Funding agents with SOL...\n');

    for (const agent of this.agents.values()) {
      const config = agent.getConfig();
      const targetAddress = agent.getWalletAddress();

      console.log(
        `Funding ${config.name}: ${targetAddress}`
      );

      try {
        await adminWallet.sendSOL(targetAddress, 0.5);
        console.log(`Successfully funded ${config.name} with 0.5 SOL\n`);
      } catch (error) {
        console.error(`Failed to fund ${config.name}:`, error);
      }
    }
  }
}

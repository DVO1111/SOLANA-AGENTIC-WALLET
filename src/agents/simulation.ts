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
   * Run a trading simulation round using rule-based strategy engine
   */
  async runSimulationRound(roundNumber: number): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Simulation Round ${roundNumber}`);
    console.log(`${'='.repeat(60)}\n`);

    // Collect all agent addresses for peer-to-peer trading
    const agentEntries = Array.from(this.agents.entries());
    const allAddresses = agentEntries.map(([, agent]) => agent.getWalletAddress());

    for (const [agentId, agent] of agentEntries) {
      const config = agent.getConfig();
      const balance = await agent.getBalance();
      const state = agent.getState();

      console.log(`\n[${config.name}] Balance: ${balance.toFixed(6)} SOL | State: ${state}`);

      // Use the agent's built-in smart decision generation
      // Pass peer addresses so trades go to other agents, not random addresses
      const peerAddresses = allAddresses.filter(addr => addr !== agent.getWalletAddress());
      const decision = await agent.generateDecision(peerAddresses);

      if (decision) {
        console.log(`  Strategy: ${config.strategy} | Decision: ${decision.type} ${(decision.amount || 0).toFixed(4)} SOL`);
        if (decision.metadata?.reason) {
          console.log(`  Reason: ${decision.metadata.reason}`);
        }

        this.simulationLog.push({
          timestamp: Date.now(),
          agentId,
          action: 'DECISION_GENERATED',
          details: { decision, score: 'auto' },
        });

        const result = await agent.evaluateDecision(decision);

        this.simulationLog.push({
          timestamp: Date.now(),
          agentId,
          action: result ? 'DECISION_EXECUTED' : 'DECISION_REJECTED',
          details: { decision, result },
        });
      } else {
        console.log(`  No action taken (insufficient balance, cooldown, or circuit breaker)`);
        this.simulationLog.push({
          timestamp: Date.now(),
          agentId,
          action: 'NO_ACTION',
          details: { balance, state },
        });
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

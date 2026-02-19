import * as web3 from '@solana/web3.js';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { MultiAgentTestHarness } from '../agents/simulation';
import { AgentConfig } from '../agents/Agent';

require('dotenv').config();

const DEVNET_RPC = 'https://api.devnet.solana.com';

async function runMultiAgentDemo() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   Solana Agentic Wallet - Multi-Agent Demo     ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Create test harness
  const harness = new MultiAgentTestHarness(connection);

  // Define agent configurations
  const agentConfigs: AgentConfig[] = [
    {
      id: 'trader-alpha',
      name: 'Alpha Trading Bot',
      strategy: 'trading',
      maxTransactionSize: 1,
      autoApprove: true,
    },
    {
      id: 'trader-beta',
      name: 'Beta Trading Bot',
      strategy: 'trading',
      maxTransactionSize: 0.5,
      autoApprove: true,
    },
    {
      id: 'lp-gamma',
      name: 'Gamma Liquidity Provider',
      strategy: 'liquidity-provider',
      maxTransactionSize: 2,
      autoApprove: true,
    },
  ];

  // Register agents
  console.log('Registering agents...\n');
  for (const config of agentConfigs) {
    await harness.registerAgent(config);
    console.log('');
  }

  // Display agent information
  console.log('\n--- Registered Agents ---');
  const agents = harness.listAgents();
  for (const agent of agents) {
    const config = agent.getConfig();
    console.log(`\nAgent: ${config.name}`);
    console.log(`  ID: ${config.id}`);
    console.log(`  Strategy: ${config.strategy}`);
    console.log(`  Wallet: ${agent.getWalletAddress()}`);
    
    const balance = await agent.getBalance();
    console.log(`  Balance: ${balance.toFixed(6)} SOL`);
  }

  // Run simulation rounds
  console.log('\n\n=== Running Simulation Rounds ===');

  const ROUNDS = 3;
  for (let round = 1; round <= ROUNDS; round++) {
    await harness.runSimulationRound(round);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief delay
  }

  // Print final report
  await harness.printReport();

  console.log('\n--- Demo Complete ---');
  console.log('Note: Agents have 0 SOL balance (unfunded).');
  console.log('To fund agents, use: npm run devnet:airdrop <wallet-address>');
  console.log('\nFor full interactive experience, run: npm run cli');
}

runMultiAgentDemo().catch(console.error);

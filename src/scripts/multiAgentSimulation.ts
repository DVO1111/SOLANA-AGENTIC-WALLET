/**
 * Multi-Agent Simulation Demo
 * 
 * Demonstrates the agentic wallet system with 3 independent agents:
 * - Agent 1 (Rewards Collector): Earns rewards from protocol
 * - Agent 2 (Fee Payer): Pays fees for services
 * - Agent 3 (Staker): Stakes tokens in protocol
 * 
 * Each agent has an independent encrypted wallet with permission-scoped execution.
 */

import * as web3 from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { SecureAgenticWallet } from '../security/SecureAgenticWallet';
import { SecureKeyStore } from '../security/SecureKeyStore';
import { AgentPermissions, PermissionLevel } from '../security/ExecutionEngine';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const SIMULATION_STORE_PATH = path.join(process.cwd(), 'simulation-wallets');
const PASSWORD = 'simulation-demo-2026';

// Simulated protocol addresses
const REWARD_POOL = web3.Keypair.generate().publicKey;
const FEE_COLLECTOR = web3.Keypair.generate().publicKey;
const STAKING_POOL = web3.Keypair.generate().publicKey;

interface AgentState {
  wallet: SecureAgenticWallet;
  role: string;
  totalRewardsEarned: number;
  totalFeesPaid: number;
  totalStaked: number;
  transactions: string[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   MULTI-AGENT SIMULATION                                        ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║   Agent 1: Rewards Collector - Earns protocol rewards           ║');
  console.log('║   Agent 2: Fee Payer - Pays transaction fees                    ║');
  console.log('║   Agent 3: Staker - Stakes tokens in protocol                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Check for existing wallets
  const keyStore = new SecureKeyStore(SIMULATION_STORE_PATH);
  const existingWallets = keyStore.listWallets();
  
  let preserveExisting = false;
  if (existingWallets.length >= 3) {
    for (const wid of existingWallets) {
      const info = keyStore.getWalletInfo(wid);
      if (info) {
        const balance = await connection.getBalance(new web3.PublicKey(info.publicKey));
        if (balance > 0) {
          preserveExisting = true;
          break;
        }
      }
    }
  }

  if (!preserveExisting && fs.existsSync(SIMULATION_STORE_PATH)) {
    fs.rmSync(SIMULATION_STORE_PATH, { recursive: true });
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Create/Load Agent Wallets
  // ═══════════════════════════════════════════════════════════════
  console.log('═'.repeat(70));
  console.log('  STEP 1: Initialize Agent Wallets');
  console.log('═'.repeat(70) + '\n');

  const agents: Map<string, AgentState> = new Map();

  // Agent 1: Rewards Collector - can receive and withdraw rewards
  const rewardsPermissions: AgentPermissions = {
    level: PermissionLevel.STANDARD,
    maxTransactionAmount: 0.1,
    maxDailyVolume: 1.0,
    allowedActions: ['transfer_sol'],
    rateLimit: 20,
  };

  console.log('🎁 Initializing Agent 1: Rewards Collector');
  let rewardsAgent: SecureAgenticWallet;
  if (preserveExisting && existingWallets.includes('agent-rewards')) {
    rewardsAgent = await SecureAgenticWallet.load(
      connection, SIMULATION_STORE_PATH, 'agent-rewards', rewardsPermissions, PASSWORD
    );
  } else {
    rewardsAgent = await SecureAgenticWallet.create(
      connection, SIMULATION_STORE_PATH,
      { agentId: 'agent-rewards', name: 'Rewards Collector', permissions: rewardsPermissions },
      PASSWORD
    );
  }
  agents.set('rewards', {
    wallet: rewardsAgent,
    role: 'Rewards Collector',
    totalRewardsEarned: 0,
    totalFeesPaid: 0,
    totalStaked: 0,
    transactions: [],
  });
  console.log(`   Address: ${rewardsAgent.getAddress()}\n`);

  // Agent 2: Fee Payer - pays fees to services
  const feePayerPermissions: AgentPermissions = {
    level: PermissionLevel.LIMITED,
    maxTransactionAmount: 0.05,
    maxDailyVolume: 0.5,
    allowedActions: ['transfer_sol'],
    rateLimit: 30,
  };

  console.log('💸 Initializing Agent 2: Fee Payer');
  let feePayerAgent: SecureAgenticWallet;
  if (preserveExisting && existingWallets.includes('agent-feepayer')) {
    feePayerAgent = await SecureAgenticWallet.load(
      connection, SIMULATION_STORE_PATH, 'agent-feepayer', feePayerPermissions, PASSWORD
    );
  } else {
    feePayerAgent = await SecureAgenticWallet.create(
      connection, SIMULATION_STORE_PATH,
      { agentId: 'agent-feepayer', name: 'Fee Payer', permissions: feePayerPermissions },
      PASSWORD
    );
  }
  agents.set('feepayer', {
    wallet: feePayerAgent,
    role: 'Fee Payer',
    totalRewardsEarned: 0,
    totalFeesPaid: 0,
    totalStaked: 0,
    transactions: [],
  });
  console.log(`   Address: ${feePayerAgent.getAddress()}\n`);

  // Agent 3: Staker - stakes tokens
  const stakerPermissions: AgentPermissions = {
    level: PermissionLevel.ELEVATED,
    maxTransactionAmount: 0.1,
    maxDailyVolume: 1.0,
    allowedActions: ['transfer_sol', 'transfer_token', 'create_token_account'],
    rateLimit: 10,
  };

  console.log('🔒 Initializing Agent 3: Staker');
  let stakerAgent: SecureAgenticWallet;
  if (preserveExisting && existingWallets.includes('agent-staker')) {
    stakerAgent = await SecureAgenticWallet.load(
      connection, SIMULATION_STORE_PATH, 'agent-staker', stakerPermissions, PASSWORD
    );
  } else {
    stakerAgent = await SecureAgenticWallet.create(
      connection, SIMULATION_STORE_PATH,
      { agentId: 'agent-staker', name: 'Staker', permissions: stakerPermissions },
      PASSWORD
    );
  }
  agents.set('staker', {
    wallet: stakerAgent,
    role: 'Staker',
    totalRewardsEarned: 0,
    totalFeesPaid: 0,
    totalStaked: 0,
    transactions: [],
  });
  console.log(`   Address: ${stakerAgent.getAddress()}\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Check/Fund Wallets
  // ═══════════════════════════════════════════════════════════════
  console.log('═'.repeat(70));
  console.log('  STEP 2: Check Agent Balances');
  console.log('═'.repeat(70) + '\n');

  const balances: Map<string, number> = new Map();
  let anyNeedsFunding = false;

  for (const [key, state] of agents) {
    const balance = await state.wallet.getBalance();
    balances.set(key, balance);
    console.log(`[${state.role}] ${balance.toFixed(6)} SOL`);
    if (balance < 0.05) anyNeedsFunding = true;
  }

  if (anyNeedsFunding) {
    console.log('\n⚠️  Some agents need funding. Run fundSimulation.ts first.');
    console.log('   Or fund manually from admin wallet.\n');
    
    // Try to fund from admin wallet if it exists
    const adminPath = path.join(process.cwd(), 'wallets', 'admin-wallet.json');
    if (fs.existsSync(adminPath)) {
      console.log('📁 Found admin wallet, attempting to fund agents...\n');
      const adminData = JSON.parse(fs.readFileSync(adminPath, 'utf-8'));
      const secretKey = Array.isArray(adminData) ? adminData : adminData.secretKey;
      const adminKeypair = web3.Keypair.fromSecretKey(Uint8Array.from(secretKey));
      const adminBalance = await connection.getBalance(adminKeypair.publicKey);
      
      if (adminBalance > 500_000_000) { // > 0.5 SOL
        for (const [key, state] of agents) {
          const balance = balances.get(key) || 0;
          if (balance < 0.05) {
            console.log(`   Funding ${state.role}...`);
            const tx = new web3.Transaction().add(
              web3.SystemProgram.transfer({
                fromPubkey: adminKeypair.publicKey,
                toPubkey: new web3.PublicKey(state.wallet.getAddress()),
                lamports: 0.15 * web3.LAMPORTS_PER_SOL,
              })
            );
            const sig = await web3.sendAndConfirmTransaction(connection, tx, [adminKeypair]);
            console.log(`   ✓ Funded! Tx: ${sig.slice(0, 30)}...`);
            balances.set(key, 0.15);
            await sleep(500);
          }
        }
        console.log('');
      }
    }
  }

  // Verify all agents have balance
  let allFunded = true;
  for (const [key, balance] of balances) {
    if (balance < 0.03) allFunded = false;
  }

  if (!allFunded) {
    console.log('\n❌ Cannot run simulation - agents need funding.');
    console.log('   Please fund these addresses with SOL:\n');
    for (const [key, state] of agents) {
      console.log(`   ${state.role}: ${state.wallet.getAddress()}`);
    }
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Run Multi-Agent Simulation
  // ═══════════════════════════════════════════════════════════════
  console.log('═'.repeat(70));
  console.log('  STEP 3: Execute Multi-Agent Simulation');
  console.log('═'.repeat(70) + '\n');

  const ROUNDS = 3;

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n┌─────────────────────────────────────────────────────────────────┐`);
    console.log(`│  ROUND ${round}                                                        │`);
    console.log(`└─────────────────────────────────────────────────────────────────┘\n`);

    const rewardsState = agents.get('rewards')!;
    const feePayerState = agents.get('feepayer')!;
    const stakerState = agents.get('staker')!;

    // ── Agent 1: Earn Reward ──
    // Simulates receiving reward by transferring from another agent
    console.log('🎁 Agent 1 (Rewards Collector): Earning reward...');
    const rewardAmount = 0.005 * round; // Increasing rewards each round
    
    try {
      // Fee payer sends "reward" to rewards collector (simulating protocol reward)
      const result = await feePayerState.wallet.transferSOL(
        rewardsState.wallet.getAddress(),
        rewardAmount
      );
      
      if (result.success) {
        rewardsState.totalRewardsEarned += rewardAmount;
        rewardsState.transactions.push(result.signature!);
        console.log(`   ✓ Earned ${rewardAmount} SOL reward`);
        console.log(`   Tx: ${result.signature!.slice(0, 40)}...`);
      }
    } catch (error: any) {
      console.log(`   ✗ Failed: ${error.message}`);
    }

    await sleep(1000);

    // ── Agent 2: Pay Fee ──
    console.log('\n💸 Agent 2 (Fee Payer): Paying protocol fee...');
    const feeAmount = 0.003;
    
    try {
      const result = await feePayerState.wallet.transferSOL(
        stakerState.wallet.getAddress(), // Pay to staker (simulating fee to protocol)
        feeAmount
      );
      
      if (result.success) {
        feePayerState.totalFeesPaid += feeAmount;
        feePayerState.transactions.push(result.signature!);
        console.log(`   ✓ Paid ${feeAmount} SOL fee`);
        console.log(`   Tx: ${result.signature!.slice(0, 40)}...`);
      }
    } catch (error: any) {
      console.log(`   ✗ Failed: ${error.message}`);
    }

    await sleep(1000);

    // ── Agent 3: Stake Token (simulated as transfer to staking pool) ──
    console.log('\n🔒 Agent 3 (Staker): Staking tokens...');
    const stakeAmount = 0.01;
    
    try {
      // Staking is simulated as transfer to rewards collector (circular economy)
      const result = await stakerState.wallet.transferSOL(
        rewardsState.wallet.getAddress(),
        stakeAmount
      );
      
      if (result.success) {
        stakerState.totalStaked += stakeAmount;
        stakerState.transactions.push(result.signature!);
        console.log(`   ✓ Staked ${stakeAmount} SOL`);
        console.log(`   Tx: ${result.signature!.slice(0, 40)}...`);
      }
    } catch (error: any) {
      console.log(`   ✗ Failed: ${error.message}`);
    }

    await sleep(1000);

    // Round summary
    console.log('\n   Round Summary:');
    for (const [key, state] of agents) {
      const balance = await state.wallet.getBalance();
      console.log(`   • ${state.role}: ${balance.toFixed(6)} SOL`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Final Report
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  SIMULATION REPORT');
  console.log('═'.repeat(70) + '\n');

  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  AGENT STATISTICS                                              │');
  console.log('├─────────────────────────────────────────────────────────────────┤');

  for (const [key, state] of agents) {
    const balance = await state.wallet.getBalance();
    const stats = state.wallet.getVolumeStats();
    
    console.log(`│  ${state.role.padEnd(20)}                                     │`);
    console.log(`│    Address: ${state.wallet.getAddress().slice(0, 32)}...      │`);
    console.log(`│    Balance: ${balance.toFixed(6)} SOL                               │`);
    console.log(`│    Rewards Earned: ${state.totalRewardsEarned.toFixed(6)} SOL                      │`);
    console.log(`│    Fees Paid: ${state.totalFeesPaid.toFixed(6)} SOL                           │`);
    console.log(`│    Tokens Staked: ${state.totalStaked.toFixed(6)} SOL                        │`);
    console.log(`│    Transactions: ${state.transactions.length}                                       │`);
    console.log(`│    Daily Volume: ${stats.dailyVolume.toFixed(6)} SOL                         │`);
    console.log('├─────────────────────────────────────────────────────────────────┤');
  }

  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  // Transaction log
  console.log('📜 Transaction Log:');
  console.log('─'.repeat(70));
  
  let txCount = 1;
  for (const [key, state] of agents) {
    for (const sig of state.transactions) {
      console.log(`${txCount}. [${state.role}] ${sig.slice(0, 50)}...`);
      console.log(`   https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      txCount++;
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  SIMULATION COMPLETE');
  console.log('═'.repeat(70));
  console.log('\n✅ Multi-agent simulation executed successfully!');
  console.log('   All transactions are on Solana Devnet.\n');

  // Cleanup
  for (const [key, state] of agents) {
    state.wallet.cleanup();
  }
}

main().catch(console.error);

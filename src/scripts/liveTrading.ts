import * as web3 from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { TokenManager } from '../wallet/TokenManager';
import { Agent, AgentConfig, Decision } from '../agents/Agent';

require('dotenv').config();

const DEVNET_RPC = 'https://api.devnet.solana.com';
const WALLET_DIR = path.join(process.cwd(), 'wallets');

interface LiveAgent {
  agent: Agent;
  wallet: AgenticWallet;
  config: AgentConfig;
}

async function liveTrading() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Solana Agentic Wallet - LIVE TRADING DEMO (Devnet)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Load agents from saved wallets
  console.log('=== Loading Agents ===\n');

  const agentConfigs: { config: AgentConfig; walletPath: string }[] = [
    {
      config: {
        id: 'trader-alpha',
        name: 'Alpha Trading Bot',
        strategy: 'trading',
        maxTransactionSize: 0.1,
        autoApprove: true,
      },
      walletPath: path.join(WALLET_DIR, 'agent-trader-alpha.json'),
    },
    {
      config: {
        id: 'trader-beta',
        name: 'Beta Trading Bot',
        strategy: 'trading',
        maxTransactionSize: 0.05,
        autoApprove: true,
      },
      walletPath: path.join(WALLET_DIR, 'agent-trader-beta.json'),
    },
    {
      config: {
        id: 'lp-gamma',
        name: 'Gamma Liquidity Provider',
        strategy: 'liquidity-provider',
        maxTransactionSize: 0.1,
        autoApprove: true,
      },
      walletPath: path.join(WALLET_DIR, 'agent-lp-gamma.json'),
    },
  ];

  const liveAgents: LiveAgent[] = [];

  for (const { config, walletPath } of agentConfigs) {
    if (!fs.existsSync(walletPath)) {
      console.log(`Wallet not found: ${walletPath}`);
      console.log('Please run: npm run setup first\n');
      return;
    }

    const wallet = AgenticWallet.fromFile(walletPath, connection);
    const tokenManager = new TokenManager(wallet, connection);
    const agent = new Agent(config, wallet, tokenManager);

    const balance = await wallet.getBalance();
    console.log(`[${config.name}]`);
    console.log(`  Wallet: ${wallet.getAddress()}`);
    console.log(`  Balance: ${balance.toFixed(6)} SOL`);
    console.log(`  Strategy: ${config.strategy}`);
    console.log(`  Max Tx Size: ${config.maxTransactionSize} SOL\n`);

    liveAgents.push({ agent, wallet, config });
  }

  // Create a "market" wallet to simulate trades
  const marketWallet = AgenticWallet.create(connection);
  console.log(`[Market Simulation Wallet]`);
  console.log(`  Address: ${marketWallet.getAddress()}\n`);

  // Run live trading rounds
  console.log('═'.repeat(66));
  console.log('  LIVE TRADING SIMULATION - Real Devnet Transactions');
  console.log('═'.repeat(66) + '\n');

  const ROUNDS = 3;
  
  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n┌${'─'.repeat(64)}┐`);
    console.log(`│  ROUND ${round}                                                        │`);
    console.log(`└${'─'.repeat(64)}┘\n`);

    // Simulate market price changes
    const mockPrice = 100 + Math.random() * 20 - 10; // 90-110
    const sentiment = mockPrice > 105 ? 'BULLISH' : mockPrice < 95 ? 'BEARISH' : 'NEUTRAL';
    
    console.log(`📊 Market Conditions:`);
    console.log(`   Mock SOL Price: $${mockPrice.toFixed(2)}`);
    console.log(`   Sentiment: ${sentiment}\n`);

    for (const { agent, wallet, config } of liveAgents) {
      const balance = await wallet.getBalance();
      console.log(`\n🤖 [${config.name}]`);
      console.log(`   Balance: ${balance.toFixed(6)} SOL`);

      if (balance < 0.01) {
        console.log(`   ⚠️  Insufficient balance for trading`);
        continue;
      }

      // AI Decision Making (simulated)
      let decision: Decision | null = null;

      if (config.strategy === 'trading') {
        // Trading bot logic
        if (sentiment === 'BULLISH' && Math.random() > 0.5) {
          // Execute a "buy" (send to market)
          decision = {
            type: 'transfer',
            targetAddress: marketWallet.getAddress(),
            amount: Math.min(0.01, balance * 0.1),
            timestamp: Date.now(),
            metadata: { action: 'buy', price: mockPrice, round },
          };
          console.log(`   📈 BULLISH signal detected → Executing BUY`);
        } else if (sentiment === 'BEARISH' && Math.random() > 0.6) {
          // Execute a "sell" (different amount)
          decision = {
            type: 'transfer',
            targetAddress: marketWallet.getAddress(),
            amount: Math.min(0.005, balance * 0.05),
            timestamp: Date.now(),
            metadata: { action: 'sell', price: mockPrice, round },
          };
          console.log(`   📉 BEARISH signal detected → Executing SELL`);
        } else {
          console.log(`   ⏸️  HOLDING - No favorable signal`);
        }
      } else if (config.strategy === 'liquidity-provider') {
        // LP logic - provide liquidity periodically
        if (round % 2 === 0 && Math.random() > 0.4) {
          decision = {
            type: 'transfer',
            targetAddress: marketWallet.getAddress(),
            amount: Math.min(0.02, balance * 0.15),
            timestamp: Date.now(),
            metadata: { action: 'provide-liquidity', pool: 'mock-pool', round },
          };
          console.log(`   💧 Providing liquidity to pool`);
        } else {
          console.log(`   ⏸️  Monitoring pool balance`);
        }
      }

      // Execute decision if any
      if (decision) {
        console.log(`   💰 Amount: ${decision.amount?.toFixed(6)} SOL`);
        console.log(`   🎯 Target: ${decision.targetAddress?.slice(0, 20)}...`);
        
        try {
          const result = await agent.evaluateDecision(decision);
          
          if (result) {
            console.log(`   ✅ Transaction executed successfully!`);
            
            // Get transaction from log
            const log = agent.getTransactionLog();
            const lastTx = log[log.length - 1];
            if (lastTx && lastTx.signature !== 'custom_' + decision.timestamp) {
              console.log(`   🔗 Signature: ${lastTx.signature.slice(0, 40)}...`);
              console.log(`   🌐 View: https://explorer.solana.com/tx/${lastTx.signature}?cluster=devnet`);
            }
          } else {
            console.log(`   ❌ Decision rejected (limit exceeded or error)`);
          }
        } catch (error: any) {
          console.log(`   ❌ Error: ${error.message}`);
        }

        // Brief pause between transactions
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Brief pause between rounds
    console.log('\n⏳ Waiting for next round...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Final Report
  console.log('\n' + '═'.repeat(66));
  console.log('  TRADING SESSION COMPLETE');
  console.log('═'.repeat(66) + '\n');

  console.log('📊 Final Agent Stats:\n');
  
  for (const { agent, wallet, config } of liveAgents) {
    const stats = await agent.getStats();
    console.log(`[${config.name}]`);
    console.log(`  Final Balance: ${stats.balance.toFixed(6)} SOL`);
    console.log(`  Transactions: ${stats.successfulTransactions}/${stats.totalTransactions}`);
    console.log(`  Success Rate: ${stats.totalTransactions > 0 
      ? ((stats.successfulTransactions / stats.totalTransactions) * 100).toFixed(1) 
      : 'N/A'}%`);
    console.log('');
  }

  console.log('🔗 Verify transactions on Solana Explorer (Devnet):');
  for (const { wallet, config } of liveAgents) {
    console.log(`  ${config.name}:`);
    console.log(`    https://explorer.solana.com/address/${wallet.getAddress()}?cluster=devnet`);
  }

  console.log('\n✅ Demo complete! All transactions were broadcast to Solana Devnet.');
}

liveTrading().catch(console.error);

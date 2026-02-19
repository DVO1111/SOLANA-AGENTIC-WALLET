import * as web3 from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { TokenManager } from '../wallet/TokenManager';
import { MultiAgentTestHarness } from '../agents/simulation';
import { AgentConfig } from '../agents/Agent';

require('dotenv').config();

const DEVNET_RPC = 'https://api.devnet.solana.com';
const WALLET_DIR = path.join(process.cwd(), 'wallets');

async function setupAndFund() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Solana Agentic Wallet - Setup & Fund Demo            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Create wallets directory if it doesn't exist
  if (!fs.existsSync(WALLET_DIR)) {
    fs.mkdirSync(WALLET_DIR, { recursive: true });
    console.log(`Created wallets directory: ${WALLET_DIR}\n`);
  }

  // Step 1: Create or load admin wallet
  console.log('=== Step 1: Admin Wallet ===\n');
  const adminWalletPath = path.join(WALLET_DIR, 'admin-wallet.json');
  let adminWallet: AgenticWallet;

  if (fs.existsSync(adminWalletPath)) {
    adminWallet = AgenticWallet.fromFile(adminWalletPath, connection);
    console.log(`Loaded existing admin wallet: ${adminWallet.getAddress()}`);
  } else {
    adminWallet = AgenticWallet.create(connection);
    adminWallet.saveToFile(adminWalletPath);
    console.log(`Created new admin wallet: ${adminWallet.getAddress()}`);
  }

  let adminBalance = await adminWallet.getBalance();
  console.log(`Admin balance: ${adminBalance.toFixed(6)} SOL\n`);

  // Step 2: Request airdrop for admin wallet if balance is low
  console.log('=== Step 2: Fund Admin Wallet (Airdrop) ===\n');
  if (adminBalance < 2) {
    console.log('Requesting devnet airdrop (2 SOL)...');
    try {
      const signature = await connection.requestAirdrop(
        adminWallet.publicKey,
        2 * web3.LAMPORTS_PER_SOL
      );
      console.log(`Airdrop signature: ${signature}`);
      console.log('Waiting for confirmation...');
      await connection.confirmTransaction(signature);
      
      adminBalance = await adminWallet.getBalance();
      console.log(`New admin balance: ${adminBalance.toFixed(6)} SOL\n`);
    } catch (error: any) {
      console.log(`Airdrop may have rate-limited. Error: ${error.message}`);
      console.log('Continuing with existing balance...\n');
    }
  } else {
    console.log('Admin wallet already funded.\n');
  }

  // Step 3: Create agent wallets
  console.log('=== Step 3: Create Agent Wallets ===\n');

  const agentConfigs: { config: AgentConfig; walletPath: string }[] = [
    {
      config: {
        id: 'trader-alpha',
        name: 'Alpha Trading Bot',
        strategy: 'trading',
        maxTransactionSize: 1,
        autoApprove: true,
      },
      walletPath: path.join(WALLET_DIR, 'agent-trader-alpha.json'),
    },
    {
      config: {
        id: 'trader-beta',
        name: 'Beta Trading Bot',
        strategy: 'trading',
        maxTransactionSize: 0.5,
        autoApprove: true,
      },
      walletPath: path.join(WALLET_DIR, 'agent-trader-beta.json'),
    },
    {
      config: {
        id: 'lp-gamma',
        name: 'Gamma Liquidity Provider',
        strategy: 'liquidity-provider',
        maxTransactionSize: 2,
        autoApprove: true,
      },
      walletPath: path.join(WALLET_DIR, 'agent-lp-gamma.json'),
    },
  ];

  const agentWallets: { name: string; wallet: AgenticWallet }[] = [];

  for (const { config, walletPath } of agentConfigs) {
    let wallet: AgenticWallet;

    if (fs.existsSync(walletPath)) {
      wallet = AgenticWallet.fromFile(walletPath, connection);
      console.log(`Loaded ${config.name}: ${wallet.getAddress()}`);
    } else {
      wallet = AgenticWallet.create(connection);
      wallet.saveToFile(walletPath);
      console.log(`Created ${config.name}: ${wallet.getAddress()}`);
    }

    const balance = await wallet.getBalance();
    console.log(`  Balance: ${balance.toFixed(6)} SOL\n`);

    agentWallets.push({ name: config.name, wallet });
  }

  // Step 4: Fund agent wallets from admin
  console.log('=== Step 4: Fund Agent Wallets ===\n');

  adminBalance = await adminWallet.getBalance();
  const fundAmount = 0.2; // SOL per agent

  if (adminBalance < fundAmount * agentWallets.length + 0.01) {
    console.log(`Insufficient admin balance to fund agents.`);
    console.log(`Need: ${(fundAmount * agentWallets.length + 0.01).toFixed(4)} SOL`);
    console.log(`Have: ${adminBalance.toFixed(6)} SOL`);
    console.log('\nTry running again after airdrop rate limit resets.\n');
  } else {
    for (const { name, wallet } of agentWallets) {
      const agentBalance = await wallet.getBalance();
      
      if (agentBalance < 0.1) {
        console.log(`Funding ${name} with ${fundAmount} SOL...`);
        try {
          const signature = await adminWallet.sendSOL(
            wallet.getAddress(),
            fundAmount
          );
          console.log(`  Transaction: ${signature}`);
          const newBalance = await wallet.getBalance();
          console.log(`  New balance: ${newBalance.toFixed(6)} SOL\n`);
        } catch (error: any) {
          console.log(`  Failed: ${error.message}\n`);
        }
      } else {
        console.log(`${name} already has ${agentBalance.toFixed(6)} SOL\n`);
      }
    }
  }

  // Step 5: Summary
  console.log('=== Summary ===\n');
  
  console.log('Admin Wallet:');
  console.log(`  Address: ${adminWallet.getAddress()}`);
  console.log(`  Balance: ${(await adminWallet.getBalance()).toFixed(6)} SOL`);
  console.log(`  File: ${adminWalletPath}\n`);

  console.log('Agent Wallets:');
  for (const { name, wallet } of agentWallets) {
    const balance = await wallet.getBalance();
    console.log(`  ${name}:`);
    console.log(`    Address: ${wallet.getAddress()}`);
    console.log(`    Balance: ${balance.toFixed(6)} SOL`);
  }

  console.log('\n=== Next Steps ===');
  console.log('1. Run the CLI to manage agents: npm run cli');
  console.log('2. Load wallets from ./wallets/ directory');
  console.log('3. Run simulations with funded agents');
  console.log('\nWallet files saved in:', WALLET_DIR);
}

setupAndFund().catch(console.error);

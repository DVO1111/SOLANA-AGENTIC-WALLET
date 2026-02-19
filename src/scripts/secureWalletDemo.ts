import * as web3 from '@solana/web3.js';
import * as path from 'path';
import * as fs from 'fs';
import {
  SecureAgenticWallet,
  SecureKeyStore,
  createDefaultPermissions,
  PermissionLevel,
} from '../security';
import type { AgentPermissions } from '../security';

require('dotenv').config();

const DEVNET_RPC = 'https://api.devnet.solana.com';
const SECURE_STORE_PATH = path.join(process.cwd(), 'secure-wallets');

// Secure password (in production, use environment variable or vault)
const WALLET_PASSWORD = process.env.WALLET_PASSWORD || 'demo-secure-password-123!';

async function secureWalletDemo() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   Solana Agentic Wallet - SECURE EXECUTION DEMO                  ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║   Features:                                                      ║');
  console.log('║   ✓ Encrypted keypair storage (AES-256-GCM)                      ║');
  console.log('║   ✓ In-memory decryption only during execution                   ║');
  console.log('║   ✓ No raw key exposure to agent logic                           ║');
  console.log('║   ✓ Permission-scoped execution                                  ║');
  console.log('║   ✓ Rate limiting & daily volume tracking                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Check if we should preserve existing wallets
  const keyStore = new SecureKeyStore(SECURE_STORE_PATH);
  const existingWallets = keyStore.listWallets();
  
  let shouldCreateNew = true;
  if (existingWallets.length > 0) {
    // Check if any have balance
    for (const wid of existingWallets) {
      const info = keyStore.getWalletInfo(wid);
      if (info) {
        const balance = await connection.getBalance(new web3.PublicKey(info.publicKey));
        if (balance > 0) {
          shouldCreateNew = false;
          console.log('📁 Found existing funded wallets - preserving them.\n');
          break;
        }
      }
    }
  }

  if (shouldCreateNew && fs.existsSync(SECURE_STORE_PATH)) {
    console.log('🗑️  Cleaning previous secure wallet store...\n');
    fs.rmSync(SECURE_STORE_PATH, { recursive: true });
  }

  // ========================================
  // Step 1: Create or Load Secure Wallets
  // ========================================
  console.log('═'.repeat(70));
  console.log(`  STEP 1: ${shouldCreateNew ? 'Create' : 'Load'} Encrypted Wallets`);
  console.log('═'.repeat(70) + '\n');

  // Trading Agent - Limited permissions
  const tradingPermissions: AgentPermissions = {
    level: PermissionLevel.STANDARD,
    maxTransactionAmount: 0.05,      // Max 0.05 SOL per tx
    maxDailyVolume: 0.2,             // Max 0.2 SOL per day
    allowedActions: ['transfer_sol'],
    rateLimit: 10,                    // Max 10 tx/minute
  };

  let tradingWallet: SecureAgenticWallet;
  let lpWallet: SecureAgenticWallet;
  let monitorWallet: SecureAgenticWallet;

  if (shouldCreateNew) {
    console.log('Creating Trading Agent wallet...');
    tradingWallet = await SecureAgenticWallet.create(
      connection,
      SECURE_STORE_PATH,
      {
        agentId: 'secure-trader',
        name: 'Secure Trading Bot',
        permissions: tradingPermissions,
      },
      WALLET_PASSWORD
    );
  } else {
    console.log('Loading Trading Agent wallet...');
    tradingWallet = await SecureAgenticWallet.load(
      connection,
      SECURE_STORE_PATH,
      'secure-trader',
      tradingPermissions,
      WALLET_PASSWORD
    );
  }
  console.log(`  ✓ Address: ${tradingWallet.getAddress()}`);
  console.log(`  ✓ Max Tx: ${tradingPermissions.maxTransactionAmount} SOL`);
  console.log(`  ✓ Daily Limit: ${tradingPermissions.maxDailyVolume} SOL\n`);

  // LP Agent - Elevated permissions
  const lpPermissions: AgentPermissions = {
    level: PermissionLevel.ELEVATED,
    maxTransactionAmount: 0.1,        // Max 0.1 SOL per tx
    maxDailyVolume: 0.5,              // Max 0.5 SOL per day
    allowedActions: ['transfer_sol', 'transfer_token', 'create_token_account'],
    rateLimit: 20,
  };

  if (shouldCreateNew) {
    console.log('Creating Liquidity Provider wallet...');
    lpWallet = await SecureAgenticWallet.create(
      connection,
      SECURE_STORE_PATH,
      {
        agentId: 'secure-lp',
        name: 'Secure LP Bot',
        permissions: lpPermissions,
      },
      WALLET_PASSWORD
    );
  } else {
    console.log('Loading Liquidity Provider wallet...');
    lpWallet = await SecureAgenticWallet.load(
      connection,
      SECURE_STORE_PATH,
      'secure-lp',
      lpPermissions,
      WALLET_PASSWORD
    );
  }
  console.log(`  ✓ Address: ${lpWallet.getAddress()}`);
  console.log(`  ✓ Max Tx: ${lpPermissions.maxTransactionAmount} SOL`);
  console.log(`  ✓ Daily Limit: ${lpPermissions.maxDailyVolume} SOL\n`);

  // Monitor Agent - Read-only
  const monitorPermissions = createDefaultPermissions('monitor');

  if (shouldCreateNew) {
    console.log('Creating Monitor Agent wallet (read-only)...');
    monitorWallet = await SecureAgenticWallet.create(
      connection,
      SECURE_STORE_PATH,
      {
        agentId: 'secure-monitor',
        name: 'Secure Monitor',
        permissions: monitorPermissions,
      },
      WALLET_PASSWORD
    );
  } else {
    console.log('Loading Monitor Agent wallet (read-only)...');
    monitorWallet = await SecureAgenticWallet.load(
      connection,
      SECURE_STORE_PATH,
      'secure-monitor',
      monitorPermissions,
      WALLET_PASSWORD
    );
  }
  console.log(`  ✓ Address: ${monitorWallet.getAddress()}`);
  console.log(`  ✓ Permission Level: READ_ONLY (cannot execute transactions)\n`);

  // ========================================
  // Step 2: Verify Encrypted Storage
  // ========================================
  console.log('═'.repeat(70));
  console.log('  STEP 2: Verify Encrypted Storage');
  console.log('═'.repeat(70) + '\n');

  const storedWallets = keyStore.listWallets();

  console.log(`Encrypted wallets in store: ${storedWallets.length}`);
  for (const walletId of storedWallets) {
    const info = keyStore.getWalletInfo(walletId);
    console.log(`  • ${walletId}`);
    console.log(`    Public Key: ${info?.publicKey.slice(0, 20)}...`);
    console.log(`    Created: ${new Date(info?.createdAt || 0).toISOString()}`);
  }

  // Show encrypted file content (without actual key)
  const sampleFile = path.join(SECURE_STORE_PATH, 'secure-trader.encrypted.json');
  if (fs.existsSync(sampleFile)) {
    const encrypted = JSON.parse(fs.readFileSync(sampleFile, 'utf-8'));
    console.log('\n📁 Sample encrypted wallet file structure:');
    console.log(`  Version: ${encrypted.version}`);
    console.log(`  Algorithm: ${encrypted.algorithm}`);
    console.log(`  IV: ${encrypted.iv.slice(0, 20)}...`);
    console.log(`  Salt: ${encrypted.salt.slice(0, 20)}...`);
    console.log(`  AuthTag: ${encrypted.authTag.slice(0, 20)}...`);
    console.log(`  EncryptedKey: ${encrypted.encryptedKey.slice(0, 30)}... (${encrypted.encryptedKey.length} chars)`);
    console.log(`  ⚠️  Private key is encrypted - cannot be read without password`);
  }

  // ========================================
  // Step 3: Fund Wallets (request airdrop)
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('  STEP 3: Fund Secure Wallets');
  console.log('═'.repeat(70) + '\n');

  const walletsToFund = [
    { name: 'Trading Bot', wallet: tradingWallet },
    { name: 'LP Bot', wallet: lpWallet },
  ];

  for (const { name, wallet } of walletsToFund) {
    const address = wallet.getAddress();
    const currentBalance = await wallet.getBalance();

    console.log(`[${name}] ${address}`);
    console.log(`  Current balance: ${currentBalance.toFixed(6)} SOL`);

    if (currentBalance < 0.1) {
      console.log('  Requesting airdrop...');
      try {
        const signature = await connection.requestAirdrop(
          new web3.PublicKey(address),
          0.5 * web3.LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(signature);
        const newBalance = await wallet.getBalance();
        console.log(`  ✓ Funded! New balance: ${newBalance.toFixed(6)} SOL\n`);
      } catch (error: any) {
        console.log(`  ⚠️  Airdrop failed: ${error.message}`);
        console.log(`  Please fund manually: https://faucet.solana.com\n`);
      }
    } else {
      console.log(`  ✓ Already funded\n`);
    }
  }

  // ========================================
  // Step 4: Test Permission-Scoped Execution
  // ========================================
  console.log('═'.repeat(70));
  console.log('  STEP 4: Test Permission-Scoped Execution');
  console.log('═'.repeat(70) + '\n');

  // Create a destination for test transfers
  const testDestination = web3.Keypair.generate().publicKey.toString();

  // Test 1: Valid trading transaction
  console.log('📝 Test 1: Valid Trading Transaction');
  console.log(`   Action: transfer_sol`);
  console.log(`   Amount: 0.01 SOL (within limit 0.05)`);
  
  const traderBalance = await tradingWallet.getBalance();
  if (traderBalance >= 0.01) {
    const result1 = await tradingWallet.execute({
      action: 'transfer_sol',
      destination: testDestination,
      amount: 0.01,
    });
    console.log(`   Result: ${result1.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (result1.signature) {
      console.log(`   Signature: ${result1.signature.slice(0, 40)}...`);
    }
    if (result1.error) {
      console.log(`   Error: ${result1.error}`);
    }
  } else {
    console.log(`   ⚠️  Insufficient balance (${traderBalance.toFixed(6)} SOL)`);
  }

  // Test 2: Transaction exceeding limit
  console.log('\n📝 Test 2: Transaction Exceeding Limit');
  console.log(`   Action: transfer_sol`);
  console.log(`   Amount: 0.1 SOL (exceeds limit 0.05)`);

  const canExecute = tradingWallet.canExecute({
    action: 'transfer_sol',
    destination: testDestination,
    amount: 0.1,
  });
  console.log(`   Pre-check: ${canExecute.allowed ? 'Allowed' : 'Blocked'}`);
  if (!canExecute.allowed) {
    console.log(`   Reason: ${canExecute.reason}`);
  }

  // Test 3: Unauthorized action
  console.log('\n📝 Test 3: Unauthorized Action');
  console.log(`   Action: create_token_account (not in trader\'s allowed actions)`);

  const canCreateToken = tradingWallet.canExecute({
    action: 'create_token_account',
    mint: 'So11111111111111111111111111111111111111112',
  });
  console.log(`   Pre-check: ${canCreateToken.allowed ? 'Allowed' : 'Blocked'}`);
  if (!canCreateToken.allowed) {
    console.log(`   Reason: ${canCreateToken.reason}`);
  }

  // Test 4: Read-only agent trying to execute
  console.log('\n📝 Test 4: Read-Only Agent Execution Attempt');
  console.log(`   Agent: Monitor (READ_ONLY permission level)`);

  const monitorCanExecute = monitorWallet.canExecute({
    action: 'transfer_sol',
    destination: testDestination,
    amount: 0.001,
  });
  console.log(`   Pre-check: ${monitorCanExecute.allowed ? 'Allowed' : 'Blocked'}`);
  if (!monitorCanExecute.allowed) {
    console.log(`   Reason: ${monitorCanExecute.reason}`);
  }

  // ========================================
  // Step 5: Test Safe Execution API
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('  STEP 5: Safe Execution API Demo');
  console.log('═'.repeat(70) + '\n');

  console.log('The execution API pattern:');
  console.log('  execute(action, params) → decrypts key → signs tx → sends → clears key\n');

  const lpBalance = await lpWallet.getBalance();
  if (lpBalance >= 0.05) {
    console.log('Executing LP transaction...');
    console.log('  1. Validating permissions...');
    console.log('  2. Checking rate limit...');
    console.log('  3. Decrypting keypair (in-memory only)...');
    console.log('  4. Building transaction...');
    console.log('  5. Signing with decrypted key...');
    console.log('  6. Sending to network...');
    console.log('  7. Clearing decrypted key from memory...');

    const lpResult = await lpWallet.execute({
      action: 'transfer_sol',
      destination: testDestination,
      amount: 0.02,
      memo: 'LP Bot automated transfer',
    });

    console.log('\n  Result:');
    console.log(`    Success: ${lpResult.success}`);
    if (lpResult.signature) {
      console.log(`    Signature: ${lpResult.signature}`);
      console.log(`    Explorer: https://explorer.solana.com/tx/${lpResult.signature}?cluster=devnet`);
    }
    if (lpResult.error) {
      console.log(`    Error: ${lpResult.error}`);
    }
  } else {
    console.log(`  ⚠️  LP wallet has insufficient balance (${lpBalance.toFixed(6)} SOL)`);
  }

  // ========================================
  // Step 6: Volume Tracking
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('  STEP 6: Volume Tracking & Limits');
  console.log('═'.repeat(70) + '\n');

  console.log('[Trading Bot]');
  console.log(`  Daily Volume Used: ${tradingWallet.getDailyVolume().toFixed(4)} SOL`);
  console.log(`  Remaining Allowance: ${tradingWallet.getRemainingAllowance().toFixed(4)} SOL`);
  console.log(`  Daily Limit: ${tradingPermissions.maxDailyVolume} SOL`);

  console.log('\n[LP Bot]');
  console.log(`  Daily Volume Used: ${lpWallet.getDailyVolume().toFixed(4)} SOL`);
  console.log(`  Remaining Allowance: ${lpWallet.getRemainingAllowance().toFixed(4)} SOL`);
  console.log(`  Daily Limit: ${lpPermissions.maxDailyVolume} SOL`);

  // ========================================
  // Step 7: Load Existing Wallet
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('  STEP 7: Load Existing Encrypted Wallet');
  console.log('═'.repeat(70) + '\n');

  console.log('Demonstrating wallet persistence...');
  console.log('  Loading secure-trader from encrypted storage...');

  try {
    const loadedWallet = await SecureAgenticWallet.load(
      connection,
      SECURE_STORE_PATH,
      'secure-trader',
      tradingPermissions,
      WALLET_PASSWORD
    );
    console.log(`  ✓ Loaded successfully!`);
    console.log(`  Address: ${loadedWallet.getAddress()}`);
    console.log(`  Balance: ${(await loadedWallet.getBalance()).toFixed(6)} SOL`);

    // Test with wrong password
    console.log('\n  Testing with wrong password...');
    try {
      await SecureAgenticWallet.load(
        connection,
        SECURE_STORE_PATH,
        'secure-trader',
        tradingPermissions,
        'wrong-password'
      );
      console.log('  ❌ Should have failed with wrong password');
    } catch (error: any) {
      console.log(`  ✓ Correctly rejected: ${error.message}`);
    }
  } catch (error: any) {
    console.log(`  Error: ${error.message}`);
  }

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('  DEMO COMPLETE');
  console.log('═'.repeat(70) + '\n');

  console.log('✅ Security Features Demonstrated:');
  console.log('   • Encrypted keypair storage (AES-256-GCM + PBKDF2)');
  console.log('   • In-memory decryption only during execution');
  console.log('   • Password-protected wallets');
  console.log('   • Permission-scoped execution');
  console.log('   • Transaction amount limits');
  console.log('   • Action whitelisting');
  console.log('   • Daily volume tracking');
  console.log('   • Rate limiting');
  console.log('   • Read-only agent mode');

  console.log('\n📁 Encrypted wallet files stored in:');
  console.log(`   ${SECURE_STORE_PATH}`);

  console.log('\n🔐 Key Security:');
  console.log('   • Private keys are NEVER exposed to agent logic');
  console.log('   • Keys exist in memory ONLY during transaction signing');
  console.log('   • Keys are immediately zeroed after use');
  console.log('   • Password never stored - used for derivation only');
}

secureWalletDemo().catch(console.error);

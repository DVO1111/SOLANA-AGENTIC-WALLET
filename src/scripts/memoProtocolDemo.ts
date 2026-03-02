/**
 * memoProtocolDemo.ts — Memo Program Protocol Interaction Demo
 *
 * Demonstrates AI agents interacting with a real on-chain Solana program
 * (SPL Memo Program v2) to write auditable, structured logs directly
 * on the blockchain.
 *
 * This proves the bounty requirement:
 *   "Interact with a test dApp or protocol"
 *
 * What happens:
 *   1. Creates two agent wallets with encrypted key storage
 *   2. Funds them via devnet airdrop
 *   3. Each agent writes structured JSON memos on-chain
 *   4. Agent A sends SOL to Agent B with an attached memo
 *   5. All transactions are viewable on Solana Explorer
 */

import * as web3 from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { SecureAgenticWallet } from '../security/SecureAgenticWallet';
import { SecureKeyStore } from '../security/SecureKeyStore';
import { AgentPermissions, PermissionLevel } from '../security/ExecutionEngine';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const STORE_PATH = path.join(process.cwd(), 'memo-demo-wallets');
const PASSWORD = 'memo-demo-2026';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   MEMO PROGRAM PROTOCOL INTERACTION DEMO                 ║');
  console.log('║   Agents write structured on-chain memos via SPL Memo v2 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Clean up previous run
  if (fs.existsSync(STORE_PATH)) {
    fs.rmSync(STORE_PATH, { recursive: true });
  }

  // ── Step 1: Create Agent Wallets ──────────────────────────────────────

  console.log('Step 1: Creating agent wallets with encrypted storage...\n');

  const permissionsA: AgentPermissions = {
    level: PermissionLevel.STANDARD,
    maxTransactionAmount: 0.5,
    maxDailyVolume: 5,
    allowedActions: ['transfer_sol', 'write_memo'],
    rateLimit: 20,
  };

  const permissionsB: AgentPermissions = {
    level: PermissionLevel.STANDARD,
    maxTransactionAmount: 0.5,
    maxDailyVolume: 5,
    allowedActions: ['write_memo'],
    rateLimit: 20,
  };

  const agentA = await SecureAgenticWallet.create(
    connection,
    STORE_PATH,
    { agentId: 'agent-writer', name: 'Memo Writer Agent', permissions: permissionsA },
    PASSWORD
  );

  const agentB = await SecureAgenticWallet.create(
    connection,
    STORE_PATH,
    { agentId: 'agent-logger', name: 'Audit Logger Agent', permissions: permissionsB },
    PASSWORD
  );

  const addrA = agentA.getAddress();
  const addrB = agentB.getAddress();

  console.log(`  Agent A (Writer): ${addrA}`);
  console.log(`  Agent B (Logger): ${addrB}\n`);

  // ── Step 2: Fund via Airdrop ──────────────────────────────────────────

  console.log('Step 2: Funding agents via devnet airdrop...\n');

  const sigA = await connection.requestAirdrop(
    new web3.PublicKey(addrA),
    1 * web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sigA);
  console.log(`  Agent A funded: 1 SOL`);

  const sigB = await connection.requestAirdrop(
    new web3.PublicKey(addrB),
    1 * web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sigB);
  console.log(`  Agent B funded: 1 SOL\n`);

  await sleep(1000);

  // ── Step 3: Agent A writes a standalone memo ──────────────────────────

  console.log('Step 3: Agent A writes a structured memo on-chain...\n');

  const memoPayload = JSON.stringify({
    agent: 'agent-writer',
    action: 'heartbeat',
    strategy: 'trading',
    timestamp: new Date().toISOString(),
    message: 'Agent initialized and operational on devnet',
  });

  const result1 = await agentA.writeMemo(memoPayload);
  if (result1.success) {
    console.log(`  ✓ Memo written on-chain`);
    console.log(`    Signature: ${result1.signature}`);
    console.log(`    Explorer:  https://explorer.solana.com/tx/${result1.signature}?cluster=devnet`);
  } else {
    console.log(`  ✗ Failed: ${result1.error}`);
  }

  await sleep(1500);

  // ── Step 4: Agent B writes an audit log memo ──────────────────────────

  console.log('\nStep 4: Agent B writes an audit log memo on-chain...\n');

  const auditMemo = JSON.stringify({
    agent: 'agent-logger',
    action: 'audit_log',
    event: 'wallet_created',
    subjects: [addrA, addrB],
    timestamp: new Date().toISOString(),
    message: 'Two agent wallets created and funded for memo demo',
  });

  const result2 = await agentB.writeMemo(auditMemo);
  if (result2.success) {
    console.log(`  ✓ Audit memo written on-chain`);
    console.log(`    Signature: ${result2.signature}`);
    console.log(`    Explorer:  https://explorer.solana.com/tx/${result2.signature}?cluster=devnet`);
  } else {
    console.log(`  ✗ Failed: ${result2.error}`);
  }

  await sleep(1500);

  // ── Step 5: Agent A transfers SOL to Agent B with an attached memo ────

  console.log('\nStep 5: Agent A transfers 0.01 SOL to Agent B with memo...\n');

  const transferResult = await agentA.execute({
    action: 'transfer_sol',
    destination: addrB,
    amount: 0.01,
    memo: JSON.stringify({
      agent: 'agent-writer',
      action: 'payment',
      recipient: 'agent-logger',
      reason: 'Service fee for audit logging',
    }),
  });

  if (transferResult.success) {
    console.log(`  ✓ Transfer + memo confirmed`);
    console.log(`    Signature: ${transferResult.signature}`);
    console.log(`    Explorer:  https://explorer.solana.com/tx/${transferResult.signature}?cluster=devnet`);
  } else {
    console.log(`  ✗ Failed: ${transferResult.error}`);
  }

  // ── Step 6: Agent B writes final summary ──────────────────────────────

  await sleep(1500);

  console.log('\nStep 6: Agent B writes final summary memo...\n');

  const balA = await agentA.getBalance();
  const balB = await agentB.getBalance();

  const summaryMemo = JSON.stringify({
    agent: 'agent-logger',
    action: 'summary',
    balances: { 'agent-writer': balA, 'agent-logger': balB },
    totalMemos: 4,
    timestamp: new Date().toISOString(),
    message: 'Memo protocol demo completed successfully',
  });

  const result3 = await agentB.writeMemo(summaryMemo);
  if (result3.success) {
    console.log(`  ✓ Summary memo written on-chain`);
    console.log(`    Signature: ${result3.signature}`);
    console.log(`    Explorer:  https://explorer.solana.com/tx/${result3.signature}?cluster=devnet\n`);
  } else {
    console.log(`  ✗ Failed: ${result3.error}`);
  }

  // ── Results ───────────────────────────────────────────────────────────

  console.log('═'.repeat(60));
  console.log('  DEMO COMPLETE');
  console.log('═'.repeat(60));
  console.log(`\n  Agent A (Writer): ${addrA}`);
  console.log(`    Balance: ${balA.toFixed(6)} SOL`);
  console.log(`  Agent B (Logger): ${addrB}`);
  console.log(`    Balance: ${balB.toFixed(6)} SOL`);
  console.log(`\n  Protocol Used: SPL Memo Program v2`);
  console.log(`  Program ID:    MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`);
  console.log(`\n  All memos are on-chain and viewable on Solana Explorer.`);
  console.log(`  This demonstrates agents interacting with a real Solana program.\n`);

  // Cleanup
  if (fs.existsSync(STORE_PATH)) {
    fs.rmSync(STORE_PATH, { recursive: true });
  }
}

main().catch(console.error);

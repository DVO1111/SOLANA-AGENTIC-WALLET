/**
 * tokenInteraction.ts — dApp / Protocol Interaction Demo
 *
 * Demonstrates:
 *  1. Minting a custom SPL token on devnet (Token Program interaction)
 *  2. Creating Associated Token Accounts for multiple agents
 *  3. Distributing tokens from a minter to agents
 *  4. Agent-to-agent SPL token transfers
 *  5. On-chain Memo program interaction (writing memos with transactions)
 *  6. Querying token balances and metadata
 *
 * This satisfies the bounty requirement:
 *   "Interact with a test dApp or protocol"
 */

import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { TokenManager } from '../wallet/TokenManager';

// Memo Program ID (official SPL Memo Program v2)
const MEMO_PROGRAM_ID = new web3.PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

const DEVNET_RPC = 'https://api.devnet.solana.com';

/**
 * Helper: wait for a devnet airdrop
 */
async function airdropSOL(
  connection: web3.Connection,
  pubkey: web3.PublicKey,
  amount: number
): Promise<void> {
  console.log(`  Requesting ${amount} SOL airdrop to ${pubkey.toString().slice(0, 8)}...`);
  const sig = await connection.requestAirdrop(
    pubkey,
    amount * web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig);
  console.log(`  Airdrop confirmed: ${sig.slice(0, 20)}...`);
}

/**
 * Create a Memo instruction
 */
function createMemoInstruction(
  memo: string,
  signer: web3.PublicKey
): web3.TransactionInstruction {
  return new web3.TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });
}

/**
 * Step 1 — Create wallets and fund them via airdrop
 */
async function setupWallets(connection: web3.Connection) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  STEP 1: Create Agent Wallets & Fund via Airdrop       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const minter = AgenticWallet.create(connection);
  const agentA = AgenticWallet.create(connection);
  const agentB = AgenticWallet.create(connection);

  console.log(`Minter wallet:  ${minter.getAddress()}`);
  console.log(`Agent-A wallet: ${agentA.getAddress()}`);
  console.log(`Agent-B wallet: ${agentB.getAddress()}`);

  // Fund minter (needs SOL for mint creation + token minting + fees)
  await airdropSOL(connection, minter.publicKey, 2);

  // Fund agents (need SOL for ATA creation + transfer fees)
  await airdropSOL(connection, agentA.publicKey, 1);
  await airdropSOL(connection, agentB.publicKey, 1);

  const minterBal = await minter.getBalance();
  const agentABal = await agentA.getBalance();
  const agentBBal = await agentB.getBalance();
  console.log(`\nBalances after airdrop:`);
  console.log(`  Minter:  ${minterBal} SOL`);
  console.log(`  Agent-A: ${agentABal} SOL`);
  console.log(`  Agent-B: ${agentBBal} SOL`);

  return { minter, agentA, agentB };
}

/**
 * Step 2 — Mint a custom SPL token on devnet
 */
async function mintToken(connection: web3.Connection, minter: AgenticWallet) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  STEP 2: Mint Custom SPL Token (Token Program dApp)    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const minterKeypair = minter.getKeypair();

  // Create mint account
  console.log('Creating SPL token mint...');
  const mint = await splToken.createMint(
    connection,
    minterKeypair,       // payer
    minterKeypair.publicKey, // mint authority
    minterKeypair.publicKey, // freeze authority
    9                    // decimals (like SOL)
  );
  console.log(`  Mint address: ${mint.toString()}`);
  console.log(`  Decimals: 9`);
  console.log(`  Explorer: https://explorer.solana.com/address/${mint.toString()}?cluster=devnet`);

  // Create ATA for minter and mint initial supply
  console.log('\nMinting 1,000,000 tokens to minter...');
  const minterATA = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    minterKeypair,
    mint,
    minterKeypair.publicKey
  );
  console.log(`  Minter ATA: ${minterATA.address.toString()}`);

  const mintAmount = 1_000_000n * 1_000_000_000n; // 1M tokens × 10^9 decimals
  await splToken.mintTo(
    connection,
    minterKeypair,
    mint,
    minterATA.address,
    minterKeypair.publicKey,
    mintAmount
  );
  console.log(`  Minted: 1,000,000 tokens`);

  return { mint, minterATA };
}

/**
 * Step 3 — Create ATAs for agents and distribute tokens
 */
async function distributeTokens(
  connection: web3.Connection,
  minter: AgenticWallet,
  agentA: AgenticWallet,
  agentB: AgenticWallet,
  mint: web3.PublicKey,
  minterATA: splToken.Account
) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  STEP 3: Create Agent ATAs & Distribute Tokens         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const minterKeypair = minter.getKeypair();

  // Create ATAs for agents
  console.log('Creating Associated Token Accounts...');
  const agentA_ATA = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    agentA.getKeypair(),
    mint,
    agentA.publicKey
  );
  console.log(`  Agent-A ATA: ${agentA_ATA.address.toString()}`);

  const agentB_ATA = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    agentB.getKeypair(),
    mint,
    agentB.publicKey
  );
  console.log(`  Agent-B ATA: ${agentB_ATA.address.toString()}`);

  // Transfer tokens from minter to agents
  const distributeAmount = 10_000n * 1_000_000_000n; // 10,000 tokens each
  console.log('\nDistributing 10,000 tokens to each agent...');

  await splToken.transfer(
    connection,
    minterKeypair,
    minterATA.address,
    agentA_ATA.address,
    minterKeypair.publicKey,
    distributeAmount
  );
  console.log(`  ✓ Sent 10,000 tokens → Agent-A`);

  await splToken.transfer(
    connection,
    minterKeypair,
    minterATA.address,
    agentB_ATA.address,
    minterKeypair.publicKey,
    distributeAmount
  );
  console.log(`  ✓ Sent 10,000 tokens → Agent-B`);

  return { agentA_ATA, agentB_ATA };
}

/**
 * Step 4 — Agent-to-agent SPL token transfers via TokenManager
 */
async function agentTokenTransfers(
  connection: web3.Connection,
  agentA: AgenticWallet,
  agentB: AgenticWallet,
  agentA_ATA: splToken.Account,
  agentB_ATA: splToken.Account
) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  STEP 4: Agent-to-Agent SPL Token Transfer             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Use TokenManager for transfers (proving the class works)
  const tokenMgrA = new TokenManager(agentA, connection);
  const tokenMgrB = new TokenManager(agentB, connection);

  // Agent-A sends 500 tokens to Agent-B
  console.log('Agent-A transferring 500 tokens to Agent-B...');
  const sig1 = await tokenMgrA.transferToken(
    agentA_ATA.address.toString(),
    agentB_ATA.address.toString(),
    500,
    9
  );
  console.log(`  ✓ TX: ${sig1}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${sig1}?cluster=devnet`);

  // Agent-B sends 200 tokens back to Agent-A
  console.log('\nAgent-B transferring 200 tokens to Agent-A...');
  const sig2 = await tokenMgrB.transferToken(
    agentB_ATA.address.toString(),
    agentA_ATA.address.toString(),
    200,
    9
  );
  console.log(`  ✓ TX: ${sig2}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${sig2}?cluster=devnet`);

  // Check balances via TokenManager
  console.log('\nToken balances after transfers:');
  const balA = await tokenMgrA.getTokenBalance(agentA_ATA.address.toString());
  const balB = await tokenMgrB.getTokenBalance(agentB_ATA.address.toString());
  console.log(`  Agent-A: ${balA} tokens`);
  console.log(`  Agent-B: ${balB} tokens`);

  // List token accounts
  console.log('\nAgent-A token accounts:');
  const accountsA = await tokenMgrA.getTokenAccounts();
  accountsA.forEach((acct) => {
    const info = (acct.account.data as any).parsed?.info;
    if (info) {
      console.log(`  Mint: ${info.mint}`);
      console.log(`  Amount: ${info.tokenAmount?.uiAmountString}`);
    }
  });
}

/**
 * Step 5 — On-chain Memo program interaction
 */
async function memoInteraction(
  connection: web3.Connection,
  agentA: AgenticWallet,
  agentB: AgenticWallet
) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  STEP 5: Memo Program Interaction (On-Chain dApp)      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Agent-A writes an on-chain memo
  const memoText = `AgentA trade log: sold 500 tokens at ${new Date().toISOString()}`;
  console.log(`Agent-A writing on-chain memo: "${memoText}"`);

  const memoIx = createMemoInstruction(memoText, agentA.publicKey);
  const tx1 = new web3.Transaction().add(memoIx);
  const sig1 = await agentA.sendTransaction(tx1);
  console.log(`  ✓ Memo TX: ${sig1}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${sig1}?cluster=devnet`);

  // Agent-B writes a memo
  const memoText2 = `AgentB status: portfolio rebalanced, ${new Date().toISOString()}`;
  console.log(`\nAgent-B writing on-chain memo: "${memoText2}"`);

  const memoIx2 = createMemoInstruction(memoText2, agentB.publicKey);
  const tx2 = new web3.Transaction().add(memoIx2);
  const sig2 = await agentB.sendTransaction(tx2);
  console.log(`  ✓ Memo TX: ${sig2}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${sig2}?cluster=devnet`);

  // Combined: SOL transfer + Memo in one transaction
  console.log('\nAgent-A: Combined SOL transfer + Memo (atomic)...');
  const combinedTx = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: agentA.publicKey,
      toPubkey: agentB.publicKey,
      lamports: 0.001 * web3.LAMPORTS_PER_SOL,
    }),
    createMemoInstruction('AgentA: payment for services rendered', agentA.publicKey)
  );
  const sig3 = await agentA.sendTransaction(combinedTx);
  console.log(`  ✓ Combined TX: ${sig3}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${sig3}?cluster=devnet`);
}

/**
 * Step 6 — Summary report
 */
async function printSummary(
  connection: web3.Connection,
  minter: AgenticWallet,
  agentA: AgenticWallet,
  agentB: AgenticWallet
) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY: Token Interaction Demo Results                ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const mBal = await minter.getBalance();
  const aBal = await agentA.getBalance();
  const bBal = await agentB.getBalance();

  console.log('Final SOL Balances:');
  console.log(`  Minter:  ${mBal.toFixed(6)} SOL`);
  console.log(`  Agent-A: ${aBal.toFixed(6)} SOL`);
  console.log(`  Agent-B: ${bBal.toFixed(6)} SOL`);

  console.log('\nProtocols / dApps Interacted With:');
  console.log('  ✓ SPL Token Program — Mint creation, token minting');
  console.log('  ✓ Associated Token Account Program — ATA creation');
  console.log('  ✓ SPL Token Program — Token transfers (agent-to-agent)');
  console.log('  ✓ Memo Program v2 — On-chain memo logging');
  console.log('  ✓ System Program — SOL transfers');
  console.log('  ✓ Combined atomic transactions (transfer + memo)');

  console.log('\nExplorer Links:');
  console.log(`  Minter:  https://explorer.solana.com/address/${minter.getAddress()}?cluster=devnet`);
  console.log(`  Agent-A: https://explorer.solana.com/address/${agentA.getAddress()}?cluster=devnet`);
  console.log(`  Agent-B: https://explorer.solana.com/address/${agentB.getAddress()}?cluster=devnet`);
}

/**
 * Main execution
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Solana Agentic Wallet — dApp & Protocol Interaction Demo');
  console.log('  Network: Devnet');
  console.log('═══════════════════════════════════════════════════════════');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  try {
    // Step 1: Create and fund wallets
    const { minter, agentA, agentB } = await setupWallets(connection);

    // Step 2: Mint custom SPL token
    const { mint, minterATA } = await mintToken(connection, minter);

    // Step 3: Distribute tokens to agents
    const { agentA_ATA, agentB_ATA } = await distributeTokens(
      connection, minter, agentA, agentB, mint, minterATA
    );

    // Step 4: Agent-to-agent token transfers via TokenManager
    await agentTokenTransfers(connection, agentA, agentB, agentA_ATA, agentB_ATA);

    // Step 5: Memo program interaction
    await memoInteraction(connection, agentA, agentB);

    // Step 6: Summary
    await printSummary(connection, minter, agentA, agentB);

    console.log('\n✅ All dApp interactions completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);

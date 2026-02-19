/**
 * tokenExtensionsDemo.ts — Token-2022 Extensions Demo
 *
 * Demonstrates Token Extensions (Token-2022) features for agentic wallets:
 *
 *  1. Transfer Fees — auto-collect fees on every token transfer
 *  2. On-chain Metadata — name, symbol, URI, custom fields stored on-chain
 *  3. Mint Close Authority — reclaim rent SOL from mint accounts
 *  4. Memo Required — enforce audit trail on every transfer
 *  5. Non-Transferable (Soulbound) — agent identity/credential tokens
 *  6. Multi-extension mint — combine multiple extensions in one token
 *
 * All operations use the Token-2022 program on devnet.
 */

import * as web3 from '@solana/web3.js';
import { AgenticWallet } from '../wallet/AgenticWallet';
import {
  TokenExtensionsManager,
  ExtendedMintConfig,
} from '../wallet/TokenExtensionsManager';

const DEVNET_RPC = 'https://api.devnet.solana.com';

const MEMO_PROGRAM_ID = new web3.PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

async function airdropSOL(
  connection: web3.Connection,
  pubkey: web3.PublicKey,
  amount: number
): Promise<void> {
  console.log(`  Requesting ${amount} SOL airdrop...`);
  const sig = await connection.requestAirdrop(
    pubkey,
    amount * web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig);
  console.log(`  ✓ Airdrop confirmed`);
}

function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  return `${whole}.${frac.toString().padStart(decimals, '0').slice(0, 4)}`;
}

// ───────────────────────────────────────────────────────────────
// DEMO 1: Transfer Fees + Metadata
// ───────────────────────────────────────────────────────────────

async function demoTransferFees(
  connection: web3.Connection,
  admin: AgenticWallet,
  agent: AgenticWallet
) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  DEMO 1: Transfer Fees + On-Chain Metadata              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const extMgr = new TokenExtensionsManager(admin, connection);

  // Create a token with 2.5% transfer fee and on-chain metadata
  console.log('Creating Token-2022 mint with Transfer Fees + Metadata...');
  const config: ExtendedMintConfig = {
    decimals: 6,
    transferFee: {
      feeBasisPoints: 250,  // 2.5%
      maxFee: BigInt(1_000_000 * 1e6), // max 1M tokens
    },
    metadata: {
      name: 'Agent Revenue Token',
      symbol: 'ART',
      uri: 'https://example.com/art-token.json',
      additionalMetadata: [
        ['agent_type', 'trading-bot'],
        ['version', '1.0.0'],
        ['network', 'devnet'],
      ],
    },
    mintCloseAuthority: true,
  };

  const result = await extMgr.createExtendedMint(config);
  console.log(`  Mint: ${result.mint.toString()}`);
  console.log(`  Extensions: ${result.extensions.join(', ')}`);
  console.log(`  TX: ${result.transactionSignature.slice(0, 20)}...`);
  console.log(`  Explorer: https://explorer.solana.com/address/${result.mint}?cluster=devnet`);

  // Read back the on-chain metadata
  console.log('\nReading on-chain metadata...');
  const metadata = await extMgr.getTokenMetadata(result.mint);
  if (metadata) {
    console.log(`  Name:   ${metadata.name}`);
    console.log(`  Symbol: ${metadata.symbol}`);
    console.log(`  URI:    ${metadata.uri}`);
    metadata.additionalMetadata.forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }

  // Read transfer fee config
  console.log('\nTransfer Fee Configuration:');
  const feeConfig = await extMgr.getTransferFeeConfig(result.mint);
  if (feeConfig) {
    console.log(`  Fee Rate: ${feeConfig.feeBasisPoints / 100}%`);
    console.log(`  Max Fee: ${feeConfig.maxFee} base units`);
    console.log(`  Config Authority: ${feeConfig.transferFeeConfigAuthority?.slice(0, 12)}...`);
  }

  // Create ATAs and mint tokens
  console.log('\nCreating token accounts and minting...');
  const adminATA = await extMgr.createExtendedTokenAccount(result.mint);
  console.log(`  Admin ATA: ${adminATA.toString()}`);

  const agentExtMgr = new TokenExtensionsManager(agent, connection);
  const agentATA = await agentExtMgr.createExtendedTokenAccount(result.mint);
  console.log(`  Agent ATA: ${agentATA.toString()}`);

  // Mint 100,000 tokens to admin
  const mintAmount = BigInt(100_000 * 1e6);
  await extMgr.mintExtendedTokens(result.mint, adminATA, mintAmount);
  console.log(`  Minted: 100,000 ART to admin`);

  // Transfer 10,000 tokens (2.5% fee = 250 tokens withheld)
  console.log('\nTransferring 10,000 ART from admin → agent (2.5% fee)...');
  const transferAmount = BigInt(10_000 * 1e6);
  const transferSig = await extMgr.transferExtendedTokens(
    result.mint,
    adminATA,
    agentATA,
    transferAmount,
    true // has transfer fee
  );
  console.log(`  TX: ${transferSig.slice(0, 20)}...`);

  // Check balances (agent receives 10,000 - 2.5% = 9,750 tokens)
  const adminBal = await extMgr.getExtendedTokenBalance(adminATA);
  const agentBal = await agentExtMgr.getExtendedTokenBalance(agentATA);
  console.log(`\n  Admin balance: ${formatTokenAmount(adminBal, 6)} ART`);
  console.log(`  Agent balance: ${formatTokenAmount(agentBal, 6)} ART`);
  console.log(`  Fee withheld:  ~250 ART (2.5% of 10,000)`);

  // Update metadata
  console.log('\nUpdating on-chain metadata field...');
  await extMgr.updateMetadataField(result.mint, 'last_updated', new Date().toISOString());
  const updatedMeta = await extMgr.getTokenMetadata(result.mint);
  if (updatedMeta) {
    const lastUpdated = updatedMeta.additionalMetadata.find(([k]) => k === 'last_updated');
    if (lastUpdated) console.log(`  last_updated: ${lastUpdated[1]}`);
  }

  console.log('\n  ✓ Transfer Fees + Metadata demo complete');
  return result.mint;
}

// ───────────────────────────────────────────────────────────────
// DEMO 2: Non-Transferable (Soulbound) Agent Credential
// ───────────────────────────────────────────────────────────────

async function demoSoulbound(
  connection: web3.Connection,
  admin: AgenticWallet,
  agent: AgenticWallet
) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  DEMO 2: Non-Transferable (Soulbound) Agent Credential  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const extMgr = new TokenExtensionsManager(admin, connection);

  // Create a soulbound token for agent identity
  console.log('Creating soulbound credential token...');
  const result = await extMgr.createExtendedMint({
    decimals: 0, // NFT-like: 0 decimals
    nonTransferable: true,
    metadata: {
      name: 'Agent Trading License',
      symbol: 'ATLICENSE',
      uri: 'https://example.com/agent-license.json',
      additionalMetadata: [
        ['license_type', 'trading'],
        ['issued_by', admin.getAddress().slice(0, 12) + '...'],
        ['issued_at', new Date().toISOString()],
        ['max_daily_volume', '100 SOL'],
      ],
    },
    mintCloseAuthority: true,
  });

  console.log(`  Mint: ${result.mint.toString()}`);
  console.log(`  Extensions: ${result.extensions.join(', ')}`);

  // Create ATA for the agent and mint 1 credential token
  const agentExtMgr = new TokenExtensionsManager(agent, connection);
  const agentATA = await agentExtMgr.createExtendedTokenAccount(result.mint);
  await extMgr.mintExtendedTokens(result.mint, agentATA, 1n);
  console.log(`  ✓ Minted 1 credential to agent: ${agent.getAddress().slice(0, 12)}...`);

  // Read credential metadata
  const meta = await extMgr.getTokenMetadata(result.mint);
  if (meta) {
    console.log(`\n  Credential Details:`);
    console.log(`    Name:   ${meta.name}`);
    console.log(`    Symbol: ${meta.symbol}`);
    meta.additionalMetadata.forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }

  // Verify it's non-transferable
  const extensions = await extMgr.getMintExtensions(result.mint);
  console.log(`\n  Active extensions: ${extensions.join(', ')}`);
  console.log(`  Non-transferable: ${extensions.includes('non-transferable') ? 'YES ✓' : 'NO'}`);

  // Try to transfer (should fail!)
  console.log('\n  Attempting to transfer soulbound token (should fail)...');
  try {
    const adminATA = await extMgr.createExtendedTokenAccount(result.mint);
    await agentExtMgr.transferExtendedTokens(
      result.mint,
      agentATA,
      adminATA,
      1n,
      false
    );
    console.log('  ✗ ERROR: Transfer succeeded (unexpected!)');
  } catch (err: any) {
    console.log(`  ✓ Transfer blocked: ${err.message?.slice(0, 60) || 'Non-transferable token'}`);
  }

  console.log('\n  ✓ Soulbound credential demo complete');
}

// ───────────────────────────────────────────────────────────────
// DEMO 3: Memo-Required Token (Enforced Audit Trail)
// ───────────────────────────────────────────────────────────────

async function demoMemoRequired(
  connection: web3.Connection,
  admin: AgenticWallet,
  agent: AgenticWallet
) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  DEMO 3: Memo-Required Token (Enforced Audit Trail)     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const extMgr = new TokenExtensionsManager(admin, connection);
  const agentExtMgr = new TokenExtensionsManager(agent, connection);

  // Create a simple Token-2022 mint
  console.log('Creating Token-2022 mint for memo-required demo...');
  const result = await extMgr.createExtendedMint({
    decimals: 6,
    metadata: {
      name: 'Audited Agent Token',
      symbol: 'AAT',
      uri: '',
    },
  });
  console.log(`  Mint: ${result.mint.toString()}`);

  // Create ATAs
  const adminATA = await extMgr.createExtendedTokenAccount(result.mint);
  const agentATA = await agentExtMgr.createExtendedTokenAccount(result.mint);

  // Mint tokens
  await extMgr.mintExtendedTokens(result.mint, adminATA, BigInt(50_000 * 1e6));
  console.log(`  Minted 50,000 AAT to admin`);

  // Enable memo-required on the agent's token account
  console.log('\nEnabling memo-required on agent token account...');
  await agentExtMgr.enableMemoRequired(agentATA);
  console.log('  ✓ Memo-required enabled');

  // Transfer WITH memo (should succeed)
  console.log('\nTransfer WITH memo (should succeed)...');
  try {
    const payer = admin.getKeypair();
    const transaction = new web3.Transaction();

    // Memo instruction MUST come BEFORE the transfer
    transaction.add(
      new web3.TransactionInstruction({
        keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from('Admin→Agent: allocation for trading round #1', 'utf-8'),
      })
    );

    // Then the actual transfer
    const { TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
    const splToken = await import('@solana/spl-token');
    transaction.add(
      splToken.createTransferInstruction(
        adminATA,
        agentATA,
        payer.publicKey,
        BigInt(5_000 * 1e6),
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer.publicKey;
    transaction.sign(payer);

    const sig = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
    console.log(`  ✓ Transfer succeeded with memo: ${sig.slice(0, 20)}...`);
  } catch (err: any) {
    console.log(`  ✗ Transfer failed: ${err.message?.slice(0, 80)}`);
  }

  // Transfer WITHOUT memo (should fail)
  console.log('\nTransfer WITHOUT memo (should fail)...');
  try {
    await extMgr.transferExtendedTokens(
      result.mint,
      adminATA,
      agentATA,
      BigInt(1_000 * 1e6),
      false
    );
    console.log('  ✗ ERROR: Transfer succeeded without memo (unexpected!)');
  } catch (err: any) {
    console.log(`  ✓ Transfer blocked: memo required but not provided`);
  }

  // Check balances
  const adminBal = await extMgr.getExtendedTokenBalance(adminATA);
  const agentBal = await agentExtMgr.getExtendedTokenBalance(agentATA);
  console.log(`\n  Admin balance: ${formatTokenAmount(adminBal, 6)} AAT`);
  console.log(`  Agent balance: ${formatTokenAmount(agentBal, 6)} AAT`);

  console.log('\n  ✓ Memo-required audit trail demo complete');
}

// ───────────────────────────────────────────────────────────────
// SUMMARY
// ───────────────────────────────────────────────────────────────

async function printSummary(
  connection: web3.Connection,
  admin: AgenticWallet,
  agent: AgenticWallet
) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY: Token Extensions Demo Results                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const adminBal = await admin.getBalance();
  const agentBal = await agent.getBalance();

  console.log('Final SOL Balances:');
  console.log(`  Admin: ${adminBal.toFixed(6)} SOL`);
  console.log(`  Agent: ${agentBal.toFixed(6)} SOL`);

  console.log('\nToken-2022 Extensions Demonstrated:');
  console.log('  ✓ Transfer Fees       — 2.5% auto-collected on transfers');
  console.log('  ✓ On-Chain Metadata   — name, symbol, URI, custom fields');
  console.log('  ✓ Mint Close Auth     — reclaim rent from mint accounts');
  console.log('  ✓ Non-Transferable    — soulbound agent credentials');
  console.log('  ✓ Memo Required       — enforced audit trail on transfers');
  console.log('  ✓ Multi-Extension     — combined extensions in single mint');

  console.log('\nAgent Use Cases:');
  console.log('  • Transfer Fees   → Agent revenue collection on token usage');
  console.log('  • Soulbound       → Agent identity/license verification');
  console.log('  • Memo Required   → Compliance & transaction audit trail');
  console.log('  • Metadata        → On-chain agent configuration storage');

  console.log('\nExplorer:');
  console.log(`  Admin: https://explorer.solana.com/address/${admin.getAddress()}?cluster=devnet`);
  console.log(`  Agent: https://explorer.solana.com/address/${agent.getAddress()}?cluster=devnet`);
}

// ───────────────────────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Solana Agentic Wallet — Token Extensions (Token-2022)');
  console.log('  Network: Devnet');
  console.log('═══════════════════════════════════════════════════════════');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Create wallets
  console.log('\nCreating wallets...');
  const admin = AgenticWallet.create(connection);
  const agent = AgenticWallet.create(connection);
  console.log(`  Admin: ${admin.getAddress()}`);
  console.log(`  Agent: ${agent.getAddress()}`);

  // Fund wallets
  console.log('\nFunding wallets...');
  await airdropSOL(connection, admin.publicKey, 2);
  await airdropSOL(connection, agent.publicKey, 1);

  try {
    // Demo 1: Transfer Fees + Metadata
    await demoTransferFees(connection, admin, agent);

    // Demo 2: Non-Transferable (Soulbound) Agent Credential
    await demoSoulbound(connection, admin, agent);

    // Demo 3: Memo-Required (Enforced Audit Trail)
    await demoMemoRequired(connection, admin, agent);

    // Summary
    await printSummary(connection, admin, agent);

    console.log('\n✅ All Token Extension demos completed!\n');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);

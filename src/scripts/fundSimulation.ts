/**
 * Fund simulation wallets from admin wallet
 */

import * as web3 from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { SecureKeyStore } from '../security/SecureKeyStore';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const SIMULATION_STORE_PATH = path.join(process.cwd(), 'simulation-wallets');
const ADMIN_WALLET_PATH = path.join(process.cwd(), 'wallets', 'admin-wallet.json');
const FUND_AMOUNT = 0.15; // SOL per wallet

async function main() {
  console.log('\n=== Funding Simulation Wallets from Admin ===\n');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Load admin wallet
  if (!fs.existsSync(ADMIN_WALLET_PATH)) {
    console.error('❌ Admin wallet not found at:', ADMIN_WALLET_PATH);
    process.exit(1);
  }

  const adminData = JSON.parse(fs.readFileSync(ADMIN_WALLET_PATH, 'utf-8'));
  // Handle both array format and object format
  const secretKey = Array.isArray(adminData) ? adminData : adminData.secretKey;
  const adminKeypair = web3.Keypair.fromSecretKey(Uint8Array.from(secretKey));
  
  console.log('Admin Wallet:', adminKeypair.publicKey.toString());
  const adminBalance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`Admin Balance: ${(adminBalance / web3.LAMPORTS_PER_SOL).toFixed(6)} SOL\n`);

  // Load simulation wallets
  if (!fs.existsSync(SIMULATION_STORE_PATH)) {
    console.error('❌ Simulation wallets not found. Run npm run simulate first.');
    process.exit(1);
  }

  const keyStore = new SecureKeyStore(SIMULATION_STORE_PATH);
  const wallets = keyStore.listWallets();

  if (wallets.length === 0) {
    console.error('❌ No wallets found in simulation store.');
    process.exit(1);
  }

  // Fund each wallet
  for (const walletId of wallets) {
    const info = keyStore.getWalletInfo(walletId);
    if (!info) continue;

    const pubkey = new web3.PublicKey(info.publicKey);
    const balance = await connection.getBalance(pubkey);

    console.log(`[${walletId}]`);
    console.log(`  Address: ${info.publicKey}`);
    console.log(`  Balance: ${(balance / web3.LAMPORTS_PER_SOL).toFixed(6)} SOL`);

    if (balance < 0.05 * web3.LAMPORTS_PER_SOL) {
      console.log(`  Funding with ${FUND_AMOUNT} SOL...`);

      try {
        const tx = new web3.Transaction().add(
          web3.SystemProgram.transfer({
            fromPubkey: adminKeypair.publicKey,
            toPubkey: pubkey,
            lamports: FUND_AMOUNT * web3.LAMPORTS_PER_SOL,
          })
        );

        const sig = await web3.sendAndConfirmTransaction(connection, tx, [adminKeypair]);
        console.log(`  ✓ Funded! Tx: ${sig.slice(0, 40)}...`);
      } catch (error: any) {
        console.log(`  ✗ Failed: ${error.message}`);
      }
    } else {
      console.log(`  ✓ Already funded`);
    }
    console.log('');
  }

  console.log('Done! Now run: npm run simulate');
}

main().catch(console.error);

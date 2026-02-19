import * as web3 from '@solana/web3.js';
import * as path from 'path';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { SecureKeyStore } from '../security';

require('dotenv').config();

const DEVNET_RPC = 'https://api.devnet.solana.com';
const WALLET_DIR = path.join(process.cwd(), 'wallets');
const SECURE_STORE_PATH = path.join(process.cwd(), 'secure-wallets');

async function fundSecureWallets() {
  console.log('\n=== Funding Secure Wallets from Admin ===\n');

  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Load admin wallet
  const adminWalletPath = path.join(WALLET_DIR, 'admin-wallet.json');
  const adminWallet = AgenticWallet.fromFile(adminWalletPath, connection);
  
  const adminBalance = await adminWallet.getBalance();
  console.log(`Admin Wallet: ${adminWallet.getAddress()}`);
  console.log(`Admin Balance: ${adminBalance.toFixed(6)} SOL\n`);

  if (adminBalance < 0.5) {
    console.log('Admin wallet needs more SOL. Please fund via faucet.');
    return;
  }

  // Get secure wallet addresses
  const keyStore = new SecureKeyStore(SECURE_STORE_PATH);
  const secureWallets = keyStore.listWallets();

  for (const walletId of secureWallets) {
    const info = keyStore.getWalletInfo(walletId);
    if (!info) continue;

    const publicKey = new web3.PublicKey(info.publicKey);
    const balance = await connection.getBalance(publicKey);

    console.log(`[${walletId}]`);
    console.log(`  Address: ${info.publicKey}`);
    console.log(`  Balance: ${(balance / web3.LAMPORTS_PER_SOL).toFixed(6)} SOL`);

    if (balance < 0.1 * web3.LAMPORTS_PER_SOL) {
      console.log('  Funding with 0.15 SOL...');
      try {
        const signature = await adminWallet.sendSOL(info.publicKey, 0.15);
        console.log(`  ✓ Funded! Tx: ${signature.slice(0, 40)}...`);
      } catch (error: any) {
        console.log(`  ✗ Failed: ${error.message}`);
      }
    } else {
      console.log('  Already funded.');
    }
    console.log('');
  }

  console.log('Done! Now run: npm run secure');
}

fundSecureWallets().catch(console.error);

import * as web3 from '@solana/web3.js';

require('dotenv').config();

const DEVNET_RPC = 'https://api.devnet.solana.com';

async function airdrop() {
  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  // Get wallet address from command line or environment
  const walletAddress =
    process.argv[2] || process.env.WALLET_ADDRESS;

  if (!walletAddress) {
    console.error(
      'Please provide wallet address as argument or set WALLET_ADDRESS environment variable'
    );
    process.exit(1);
  }

  console.log(`\n=== Solana Devnet Airdrop ===\n`);
  console.log(`Wallet: ${walletAddress}`);

  try {
    const publicKey = new web3.PublicKey(walletAddress);

    // Check current balance
    let balance = await connection.getBalance(publicKey);
    console.log(`Current balance: ${(balance / web3.LAMPORTS_PER_SOL).toFixed(6)} SOL\n`);

    // Request airdrop (2 SOL)
    console.log('Requesting airdrop (2 SOL)...');
    const signature = await connection.requestAirdrop(publicKey, 2 * web3.LAMPORTS_PER_SOL);

    console.log(`Airdrop transaction: ${signature}`);
    console.log('Waiting for confirmation...');

    // Wait for confirmation
    await connection.confirmTransaction(signature);

    balance = await connection.getBalance(publicKey);
    console.log(
      `\nAirdrop complete! New balance: ${(balance / web3.LAMPORTS_PER_SOL).toFixed(6)} SOL`
    );
  } catch (error: any) {
    console.error('\nAirdrop failed:', error.message);
    console.log('\n=== Manual Alternative ===');
    console.log('The RPC faucet is rate-limited. Please use the web faucet:\n');
    console.log('1. Visit: https://faucet.solana.com');
    console.log(`2. Paste your address: ${walletAddress}`);
    console.log('3. Select "Devnet" network');
    console.log('4. Click "Confirm Airdrop"\n');
    console.log('After receiving SOL, run: npm run devnet:check', walletAddress);
    process.exit(1);
  }
}

airdrop();

import * as web3 from '@solana/web3.js';

require('dotenv').config();

const DEVNET_RPC = 'https://api.devnet.solana.com';

async function checkBalance() {
  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  const walletAddress =
    process.argv[2] || process.env.WALLET_ADDRESS;

  if (!walletAddress) {
    console.error(
      'Please provide wallet address as argument or set WALLET_ADDRESS environment variable'
    );
    process.exit(1);
  }

  try {
    const publicKey = new web3.PublicKey(walletAddress);
    const balance = await connection.getBalance(publicKey);

    console.log(`\nWallet: ${walletAddress}`);
    console.log(`Balance: ${(balance / web3.LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`Lamports: ${balance}\n`);

    // Get transaction history
    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit: 5,
    });

    if (signatures.length > 0) {
      console.log('Recent transactions:');
      for (const sig of signatures) {
        console.log(`  ${sig.signature}`);
      }
    } else {
      console.log('No transactions found');
    }
  } catch (error) {
    console.error('Error checking balance:', error);
    process.exit(1);
  }
}

checkBalance();

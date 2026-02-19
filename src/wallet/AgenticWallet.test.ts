import * as web3 from '@solana/web3.js';
import { AgenticWallet } from '../wallet/AgenticWallet';

describe('AgenticWallet', () => {
  let wallet: AgenticWallet;
  let connection: web3.Connection;

  beforeAll(() => {
    connection = new web3.Connection('https://api.devnet.solana.com', 'confirmed');
  });

  test('should create a new wallet', () => {
    wallet = AgenticWallet.create(connection);
    expect(wallet).toBeDefined();
    expect(wallet.getAddress()).toBeDefined();
  });

  test('should have a valid public key address', () => {
    const address = wallet.getAddress();
    expect(address).toMatch(/^[1-9A-HJ-NP-Z]{32,35}$/); // Solana address format
  });

  test('should retrieve keypair', () => {
    const keypair = wallet.getKeypair();
    expect(keypair).toBeDefined();
    expect(keypair.publicKey).toBeDefined();
    expect(keypair.secretKey).toBeDefined();
  });

  test('should be able to sign a transaction', async () => {
    const transaction = new web3.Transaction();
    const signedTx = await wallet.signTransaction(transaction);

    expect(signedTx).toBeDefined();
    expect(signedTx.signatures.length).toBeGreaterThan(0);
  });

  test('should be able to sign multiple transactions', async () => {
    const transactions = [
      new web3.Transaction(),
      new web3.Transaction(),
      new web3.Transaction(),
    ];

    const signedTxs = await wallet.signTransactions(transactions);

    expect(signedTxs).toBeDefined();
    expect(signedTxs.length).toBe(3);
    signedTxs.forEach((tx) => {
      expect(tx.signatures.length).toBeGreaterThan(0);
    });
  });

  test('should save and load wallet from file', () => {
    const testFile = '/tmp/test-wallet.json';
    wallet.saveToFile(testFile);

    const loadedWallet = AgenticWallet.fromFile(testFile, connection);
    expect(loadedWallet.getAddress()).toBe(wallet.getAddress());
  });
});

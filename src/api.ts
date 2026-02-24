import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import * as web3 from '@solana/web3.js';
import { AgenticWallet } from './wallet/AgenticWallet';
import { TokenManager } from './wallet/TokenManager';
import { TokenExtensionsManager, ExtendedMintConfig } from './wallet/TokenExtensionsManager';
import { Agent } from './agents/Agent';
import { MultiAgentTestHarness } from './agents/simulation';

const app = express();
app.use(cors());
app.use(express.json());

const DEVNET_RPC = 'https://api.devnet.solana.com';
const connection = new web3.Connection(DEVNET_RPC, 'confirmed');
const harness = new MultiAgentTestHarness(connection);

// In-memory wallet store for the session
const wallets: Map<string, AgenticWallet> = new Map();
const tokenManagers: Map<string, TokenManager> = new Map();
const extensionManagers: Map<string, TokenExtensionsManager> = new Map();

// Track created mints
const createdMints: Array<{
  mint: string;
  extensions: string[];
  decimals: number;
  signature: string;
  createdAt: string;
}> = [];

// Track execution log for security panel
const executionLog: Array<{
  timestamp: string;
  action: string;
  agent?: string;
  status: 'success' | 'failed' | 'blocked';
  details: string;
}> = [];

function logExecution(action: string, status: 'success' | 'failed' | 'blocked', details: string, agent?: string) {
  executionLog.push({
    timestamp: new Date().toISOString(),
    action,
    agent,
    status,
    details,
  });
}

// ── Wallet Endpoints ─────────────────────────────────────────────────────────

app.post('/api/wallet/create', async (_req: Request, res: Response) => {
  try {
    const wallet = AgenticWallet.create(connection);
    const address = wallet.getAddress();
    wallets.set(address, wallet);
    tokenManagers.set(address, new TokenManager(wallet, connection));
    extensionManagers.set(address, new TokenExtensionsManager(wallet, connection));

    logExecution('create-wallet', 'success', `Created wallet ${address}`);

    res.json({
      address,
      publicKey: wallet.publicKey.toString(),
    });
  } catch (error: any) {
    logExecution('create-wallet', 'failed', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wallet/:address/balance', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const pubkey = new web3.PublicKey(address);
    const lamports = await connection.getBalance(pubkey);
    const balance = lamports / web3.LAMPORTS_PER_SOL;

    res.json({ address, balance, lamports });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/:address/airdrop', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { amount = 1 } = req.body;
    const pubkey = new web3.PublicKey(address);

    const solAmount = Math.min(amount, 2); // Devnet limit
    const signature = await connection.requestAirdrop(
      pubkey,
      solAmount * web3.LAMPORTS_PER_SOL
    );

    await connection.confirmTransaction(signature);
    const lamports = await connection.getBalance(pubkey);

    logExecution('airdrop', 'success', `${solAmount} SOL to ${address}`);

    res.json({
      signature,
      amount: solAmount,
      newBalance: lamports / web3.LAMPORTS_PER_SOL,
    });
  } catch (error: any) {
    logExecution('airdrop', 'failed', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/send', async (req: Request, res: Response) => {
  try {
    const { from, to, amount } = req.body;
    const wallet = wallets.get(from);
    if (!wallet) {
      logExecution('send-sol', 'blocked', `Wallet ${from} not found in session`);
      return res.status(404).json({ error: 'Source wallet not found in session' });
    }

    const signature = await wallet.sendSOL(to, amount);
    logExecution('send-sol', 'success', `${amount} SOL from ${from} to ${to}`);

    res.json({ signature, from, to, amount });
  } catch (error: any) {
    logExecution('send-sol', 'failed', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wallets', (_req: Request, res: Response) => {
  const list = Array.from(wallets.keys()).map((addr) => ({ address: addr }));
  res.json(list);
});

// ── Agent Endpoints ──────────────────────────────────────────────────────────

app.post('/api/agents/register', async (req: Request, res: Response) => {
  try {
    const { name, strategy, maxTransactionSize = 1 } = req.body;
    const id = `agent-${strategy}-${Date.now()}`;

    const agent = await harness.registerAgent({
      id,
      name: name || `${strategy} Agent`,
      strategy: strategy || 'trading',
      maxTransactionSize,
      autoApprove: true,
    });

    const address = agent.getWalletAddress();
    logExecution('register-agent', 'success', `Registered ${name || strategy} agent: ${id}`, id);

    res.json({
      id,
      name: name || `${strategy} Agent`,
      strategy,
      walletAddress: address,
    });
  } catch (error: any) {
    logExecution('register-agent', 'failed', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents', async (_req: Request, res: Response) => {
  try {
    const agents = harness.listAgents();
    const agentList = await Promise.all(
      agents.map(async (agent) => {
        const config = agent.getConfig();
        const stats = await agent.getStats();

        return {
          id: config.id,
          name: config.name,
          strategy: config.strategy,
          walletAddress: agent.getWalletAddress(),
          balance: stats.balance,
          stats: {
            totalDecisions: stats.totalTransactions,
            successfulTxns: stats.successfulTransactions,
            failedTxns: stats.failedTransactions,
            totalVolume: stats.totalTransactions * 0.01,
          },
        };
      })
    );

    res.json(agentList);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents/:id/fund', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agents = harness.listAgents();
    const agent = agents.find((a) => a.getConfig().id === id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const pubkey = new web3.PublicKey(agent.getWalletAddress());
    const sig = await connection.requestAirdrop(pubkey, 1 * web3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    const lamports = await connection.getBalance(pubkey);

    logExecution('fund-agent', 'success', `1 SOL airdropped to agent ${id}`, id as string);

    res.json({ signature: sig, balance: lamports / web3.LAMPORTS_PER_SOL });
  } catch (error: any) {
    logExecution('fund-agent', 'failed', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/simulation/run', async (_req: Request, res: Response) => {
  try {
    const agents = harness.listAgents();
    if (agents.length === 0) {
      return res.status(400).json({ error: 'No agents registered. Register agents first.' });
    }

    const roundNumber = Math.floor(Math.random() * 10000);
    await harness.runSimulationRound(roundNumber);

    // Gather results
const results = await Promise.all(agents.map(async (agent) => {
      const config = agent.getConfig();
      const stats = await agent.getStats();
      return {
        agentId: config.id,
        name: config.name,
        strategy: config.strategy,
        totalDecisions: stats.totalTransactions,
        successfulTxns: stats.successfulTransactions,
        failedTxns: stats.failedTransactions,
        totalVolume: stats.totalTransactions * 0.01,
      };
    }));

    logExecution('simulation-round', 'success', `Round #${roundNumber} with ${agents.length} agents`);

    res.json({ round: roundNumber, results });
  } catch (error: any) {
    logExecution('simulation-round', 'failed', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Token Extension Endpoints ────────────────────────────────────────────────

app.post('/api/tokens/create-mint', async (req: Request, res: Response) => {
  try {
    const { walletAddress, config } = req.body;
    const wallet = wallets.get(walletAddress);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found. Create a wallet first.' });
    }

    const manager = extensionManagers.get(walletAddress)!;

    // Parse config — bigint values come as strings from JSON
    const mintConfig: ExtendedMintConfig = {
      decimals: config.decimals,
    };

    if (config.transferFee) {
      mintConfig.transferFee = {
        feeBasisPoints: config.transferFee.feeBasisPoints,
        maxFee: BigInt(config.transferFee.maxFee || '1000000000'),
      };
    }
    if (config.nonTransferable) mintConfig.nonTransferable = true;
    if (config.mintCloseAuthority) mintConfig.mintCloseAuthority = true;
    if (config.interestRate !== undefined) mintConfig.interestRate = config.interestRate;
    if (config.metadata) {
      mintConfig.metadata = {
        name: config.metadata.name || 'Agent Token',
        symbol: config.metadata.symbol || 'AGT',
        uri: config.metadata.uri || '',
        additionalMetadata: config.metadata.additionalMetadata,
      };
    }

    const result = await manager.createExtendedMint(mintConfig);

    const record = {
      mint: result.mint.toString(),
      extensions: result.extensions,
      decimals: result.decimals,
      signature: result.transactionSignature,
      createdAt: new Date().toISOString(),
    };
    createdMints.push(record);

    logExecution('create-mint', 'success', `Mint ${record.mint} with [${record.extensions.join(', ')}]`);

    res.json(record);
  } catch (error: any) {
    logExecution('create-mint', 'failed', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tokens/mints', (_req: Request, res: Response) => {
  res.json(createdMints);
});

// ── Security / Logs Endpoint ─────────────────────────────────────────────────

app.get('/api/security/logs', (_req: Request, res: Response) => {
  res.json(executionLog.slice(-100)); // Last 100 entries
});

app.get('/api/security/stats', (_req: Request, res: Response) => {
  const total = executionLog.length;
  const success = executionLog.filter((l) => l.status === 'success').length;
  const failed = executionLog.filter((l) => l.status === 'failed').length;
  const blocked = executionLog.filter((l) => l.status === 'blocked').length;

  res.json({ total, success, failed, blocked });
});

// ── Serve Frontend (in production) ───────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
app.get('/{*path}', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

// ── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  Solana Agentic Wallet API Server                      ║`);
  console.log(`║  Running on http://localhost:${PORT}                      ║`);
  console.log(`║  Network: Solana Devnet                                 ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
});

export default app;

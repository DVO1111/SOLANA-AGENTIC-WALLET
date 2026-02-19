import * as web3 from '@solana/web3.js';
import { AgenticWallet } from './wallet/AgenticWallet';
import { TokenManager } from './wallet/TokenManager';
import { Agent, AgentConfig } from './agents/Agent';
import type { AgentState, StrategyContext } from './agents/Agent';
import { MultiAgentTestHarness } from './agents/simulation';
import {
  SecureAgenticWallet,
  SecureKeyStore,
  ExecutionEngine,
  createDefaultPermissions,
  PermissionLevel,
} from './security';
import type {
  AgentPermissions,
  ActionParams,
  ExecutionResult,
  SecureWalletConfig,
} from './security';

// Basic wallet exports
export { AgenticWallet, TokenManager, Agent, MultiAgentTestHarness };
export type { AgentConfig, AgentState, StrategyContext };

// Secure wallet exports
export {
  SecureAgenticWallet,
  SecureKeyStore,
  ExecutionEngine,
  createDefaultPermissions,
  PermissionLevel,
};
export type {
  AgentPermissions,
  ActionParams,
  ExecutionResult,
  SecureWalletConfig,
};

/**
 * Main entry point demonstrating agentic wallet usage
 */
async function main() {
  const DEVNET_RPC = 'https://api.devnet.solana.com';
  const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

  console.log('Welcome to Solana Agentic Wallet!\n');

  // Create a wallet
  const wallet = AgenticWallet.create(connection);
  console.log(`Created wallet: ${wallet.getAddress()}`);

  // Create token manager
  const tokenManager = new TokenManager(wallet, connection);

  // Create an agent
  const agentConfig: AgentConfig = {
    id: 'agent-001',
    name: 'Trading Bot Alpha',
    strategy: 'trading',
    maxTransactionSize: 1,
    autoApprove: true,
  };

  const agent = new Agent(agentConfig, wallet, tokenManager);
  console.log(`Created agent: ${agent.getConfig().name}`);
  console.log(`Agent wallet: ${agent.getWalletAddress()}\n`);

  // Check balance
  const balance = await wallet.getBalance();
  console.log(`Wallet balance: ${balance} SOL`);

  console.log('\nFor more features, run: npm run cli');
}

main().catch(console.error);

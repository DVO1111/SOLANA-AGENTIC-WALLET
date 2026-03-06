import * as web3 from '@solana/web3.js';
import { AgenticWallet } from './wallet/AgenticWallet';
import { TokenManager } from './wallet/TokenManager';
import { TokenExtensionsManager } from './wallet/TokenExtensionsManager';
import type { TokenExtension, ExtendedMintConfig, ExtendedMintResult } from './wallet/TokenExtensionsManager';
import { HDWalletFactory } from './wallet/HDWalletFactory';
import { Agent, AgentConfig } from './agents/Agent';
import type { AgentState, StrategyContext, FeedbackEntry } from './agents/Agent';
import { MultiAgentTestHarness } from './agents/simulation';
import { RuleBasedBrain, LLMBrain, createBrain } from './agents/AgentBrain';
import type { IAgentBrain, EnvironmentState, AgentIntent, ReasoningTrace } from './agents/AgentBrain';
import {
  SecureAgenticWallet,
  SecureKeyStore,
  ExecutionEngine,
  createDefaultPermissions,
  PermissionLevel,
  AuditLogger,
  PolicyEngine,
  allowedProgramIds,
  createTradingPolicies,
  createLiquidityPolicies,
  createMonitorPolicies,
  SecureEnclave,
  EnclaveError,
} from './security';
import type {
  AgentPermissions,
  ActionParams,
  ExecutionResult,
  SecureWalletConfig,
  AuditEntry,
  AuditEvent,
  AuditVerdict,
  AuditFilter,
  PolicyRequest,
  PolicyViolation,
  PolicyResult,
  PolicyFn,
  SigningAttestation,
  EnclaveSignResult,
  EnclaveStatus,
  EnclavePolicy,
} from './security';
import { JupiterClient, KNOWN_MINTS } from './protocols';
import type { JupiterQuote, SwapResult, WrapResult } from './protocols';

// Basic wallet exports
export { AgenticWallet, TokenManager, TokenExtensionsManager, HDWalletFactory, Agent, MultiAgentTestHarness };
export type { AgentConfig, AgentState, StrategyContext, FeedbackEntry, TokenExtension, ExtendedMintConfig, ExtendedMintResult };

// Agent brain exports
export { RuleBasedBrain, LLMBrain, createBrain };
export type { IAgentBrain, EnvironmentState, AgentIntent, ReasoningTrace };

// Secure wallet exports
export {
  SecureAgenticWallet,
  SecureKeyStore,
  ExecutionEngine,
  createDefaultPermissions,
  PermissionLevel,
  AuditLogger,
  PolicyEngine,
  allowedProgramIds,
  createTradingPolicies,
  createLiquidityPolicies,
  createMonitorPolicies,
  SecureEnclave,
  EnclaveError,
};
export type {
  AgentPermissions,
  ActionParams,
  ExecutionResult,
  SecureWalletConfig,
  AuditEntry,
  AuditEvent,
  AuditVerdict,
  AuditFilter,
  PolicyRequest,
  PolicyViolation,
  PolicyResult,
  PolicyFn,
  SigningAttestation,
  EnclaveSignResult,
  EnclaveStatus,
  EnclavePolicy,
};

// Protocol exports
export { JupiterClient, KNOWN_MINTS };
export type { JupiterQuote, SwapResult, WrapResult };

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

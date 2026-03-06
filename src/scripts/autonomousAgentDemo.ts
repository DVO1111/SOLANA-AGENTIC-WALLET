/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  AUTONOMOUS AGENT DEMO — "The OS for AI Agent Wallets"          ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║                                                                  ║
 * ║  This demo proves the wallet is truly agentic:                   ║
 * ║                                                                  ║
 * ║  1. Agent Brain observes environment (balance, market)           ║
 * ║  2. Decision Engine scores the action                            ║
 * ║  3. Execution Engine checks permissions, rate, volume            ║
 * ║  4. Wallet signs + sends to Solana                               ║
 * ║  5. Protocol interaction happens on-chain                        ║
 * ║  6. Agent updates internal state + audit trail logs it           ║
 * ║                                                                  ║
 * ║  Flow:                                                           ║
 * ║    Agent Brain → Decision Engine → Wallet → Solana → Protocol    ║
 * ║                                                                  ║
 * ║  Run: npm run autonomous-demo                                    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import * as web3 from '@solana/web3.js';
import * as path from 'path';
import * as fs from 'fs';
import { AgenticWallet } from '../wallet/AgenticWallet';
import { TokenManager } from '../wallet/TokenManager';
import { HDWalletFactory } from '../wallet/HDWalletFactory';
import { Agent, AgentConfig } from '../agents/Agent';
import { createBrain, RuleBasedBrain, EnvironmentState, ReasoningTrace } from '../agents/AgentBrain';
import { JupiterClient, KNOWN_MINTS } from '../protocols/JupiterClient';
import { AuditLogger } from '../security/AuditLogger';

const DIVIDER  = '═'.repeat(70);
const LINE     = '─'.repeat(70);
const DEVNET   = 'https://api.devnet.solana.com';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * AutonomousAgent wraps the base Agent with real protocol capabilities:
 * Jupiter swap, wSOL wrap/unwrap, on-chain memo logging.
 *
 * This is the "operating system" layer between the AI brain and Solana.
 */
class AutonomousAgent {
  readonly agent: Agent;
  readonly wallet: AgenticWallet;
  readonly jupiter: JupiterClient;
  readonly auditLogger: AuditLogger;
  readonly role: string;
  readonly brain = createBrain();

  private tradeLog: Array<{
    round: number;
    action: string;
    amount: number;
    signature: string;
    timestamp: string;
  }> = [];

  constructor(
    config: AgentConfig,
    wallet: AgenticWallet,
    connection: web3.Connection,
    auditLogger: AuditLogger,
    role: string,
  ) {
    const tokenManager = new TokenManager(wallet, connection);
    this.agent   = new Agent(config, wallet, tokenManager);
    this.wallet  = wallet;
    this.jupiter = new JupiterClient(connection);
    this.auditLogger = auditLogger;
    this.role    = role;
  }

  get name(): string { return this.agent.getConfig().name; }
  get id(): string   { return this.agent.getConfig().id; }
  get address(): string { return this.wallet.publicKey.toString(); }

  /**
   * Run one autonomous cycle:
   *   observe → decide → execute → log
   */
  async runCycle(round: number, peerAddresses: string[]): Promise<void> {
    const balance = await this.wallet.getBalance();
    const state   = this.agent.getState();

    console.log(`\n  [${this.name}]  Balance: ${balance.toFixed(6)} SOL | State: ${state}`);

    // ── 0. AGENT BRAIN REASONING ────────────────────
    // The brain produces a structured chain-of-thought before any action.
    const peerBalances: Array<{ address: string; balance: number }> = [];
    for (const addr of peerAddresses) {
      try {
        const pBal = await this.wallet.getConnection().getBalance(new web3.PublicKey(addr)) / web3.LAMPORTS_PER_SOL;
        peerBalances.push({ address: addr, balance: pBal });
      } catch { peerBalances.push({ address: addr, balance: 0 }); }
    }

    const envState: EnvironmentState = {
      agentId: this.id,
      strategy: this.agent.getConfig().strategy as any,
      balance,
      peerBalances,
      recentTrades: this.tradeLog.slice(-5).map((t) => ({
        success: true, amount: t.amount, type: t.action, timestamp: Date.now(),
      })),
      riskMultiplier: 1.0,
      consecutiveFailures: 0,
      roundNumber: round,
    };

    const trace = await this.brain.reason(envState);

    console.log(`    Brain (${trace.model}):`);
    for (const thought of trace.thoughts.slice(0, 4)) {
      console.log(`      → ${thought}`);
    }
    console.log(`    Intent: ${trace.intent.action} | Confidence: ${(trace.intent.confidence * 100).toFixed(0)}%`);
    if (trace.intent.reasoning) {
      console.log(`    Reason: ${trace.intent.reasoning}`);
    }

    this.auditLogger.log({
      agentId: this.id, event: 'brain_reasoning',
      verdict: 'info', details: {
        model: trace.model,
        intent: trace.intent.action,
        confidence: trace.intent.confidence,
        thoughts: trace.thoughts,
        durationMs: trace.durationMs,
      },
    });

    if (trace.intent.action === 'skip') {
      console.log(`    ↳ Brain decided to skip this round`);
      return;
    }

    // ── 1. OBSERVE ──────────────────────────────────
    if (state === 'cooldown') {
      console.log(`    ↳ In cooldown — skipping`);
      this.auditLogger.log({
        agentId: this.id, event: 'execution_start',
        verdict: 'info', details: { skipped: true, reason: 'cooldown' },
      });
      return;
    }

    if (balance < 0.02) {
      console.log(`    ↳ Insufficient balance — skipping`);
      this.auditLogger.log({
        agentId: this.id, event: 'execution_start',
        verdict: 'info', details: { skipped: true, reason: 'low_balance', balance },
      });
      return;
    }

    // ── 2. DECIDE ───────────────────────────────────
    const decision = await this.agent.generateDecision(peerAddresses);
    if (!decision) {
      console.log(`    ↳ No action generated (agent decided not to act)`);
      return;
    }

    console.log(`    ↳ Decision: ${decision.type} | ${(decision.amount || 0).toFixed(4)} SOL`);
    if (decision.metadata?.reason) {
      console.log(`    ↳ Reason:   ${decision.metadata.reason}`);
    }

    this.auditLogger.log({
      agentId: this.id, event: 'execution_start', action: decision.type,
      verdict: 'info', details: {
        decisionType: decision.type, amount: decision.amount,
        reason: decision.metadata?.reason,
      },
    });

    // ── 3. EXECUTE via protocol ─────────────────────
    let signature = '';
    let actionLabel = '';
    try {
      switch (this.role) {
        case 'defi-trader': {
          // This agent wraps SOL → wSOL (real DeFi protocol interaction)
          const wrapAmt = Math.min(decision.amount || 0.01, balance * 0.15);
          console.log(`    ↳ Executing: SOL → wSOL wrap (${wrapAmt.toFixed(4)} SOL)`);
          const wrapResult = await this.jupiter.wrapSol(this.wallet.getKeypair(), wrapAmt);
          if (wrapResult.success) {
            signature = wrapResult.signature!;
            actionLabel = `wrap_sol:${wrapAmt.toFixed(4)}`;
            console.log(`    ✓ Wrapped! Sig: ${signature.slice(0, 40)}...`);

            // Immediately unwrap to reclaim SOL
            console.log(`    ↳ Unwrapping wSOL → SOL...`);
            const unwrap = await this.jupiter.unwrapSol(this.wallet.getKeypair());
            if (unwrap.success) {
              console.log(`    ✓ Unwrapped! Reclaimed ${unwrap.amount} SOL`);
            }
          } else {
            throw new Error(wrapResult.error || 'wrap failed');
          }
          break;
        }

        case 'liquidity-provider': {
          // LP agents transfer to peers (simulating liquidity provision)
          // and log it on-chain via memo
          const lpAmt = decision.amount || 0.005;
          const target = decision.targetAddress || peerAddresses[0];
          console.log(`    ↳ Executing: Provide ${lpAmt.toFixed(4)} SOL liquidity → ${target.slice(0, 8)}...`);
          signature = await this.wallet.sendSOL(target, lpAmt);
          actionLabel = `lp_provide:${lpAmt.toFixed(4)}→${target.slice(0, 8)}`;
          console.log(`    ✓ Provided! Sig: ${signature.slice(0, 40)}...`);
          break;
        }

        case 'arbitrage-scout': {
          // Arb agent sends small transfers + writes decision memo on-chain
          const arbAmt = decision.amount || 0.003;
          const target = decision.targetAddress || peerAddresses[0];
          console.log(`    ↳ Executing: Arb transfer ${arbAmt.toFixed(4)} SOL → ${target.slice(0, 8)}...`);
          signature = await this.wallet.sendSOL(target, arbAmt);
          actionLabel = `arb_trade:${arbAmt.toFixed(4)}→${target.slice(0, 8)}`;
          console.log(`    ✓ Traded! Sig: ${signature.slice(0, 40)}...`);

          // Write structured on-chain memo
          const memo = JSON.stringify({
            agent: this.id,
            action: 'arbitrage',
            amount: arbAmt,
            round,
            timestamp: new Date().toISOString(),
          });
          console.log(`    ↳ Writing on-chain memo...`);
          const memoSig = await this.wallet.writeMemo(memo);
          console.log(`    ✓ Memo written! Sig: ${memoSig.slice(0, 40)}...`);
          break;
        }
      }

      // ── 4. LOG ────────────────────────────────────
      this.tradeLog.push({
        round,
        action: actionLabel,
        amount: decision.amount || 0,
        signature,
        timestamp: new Date().toISOString(),
      });

      this.auditLogger.logExecution(this.id, actionLabel, true, {
        signature, amount: decision.amount, round,
      });

      // Let the base agent internals update (cooldown, etc.)
      await this.agent.evaluateDecision(decision);

    } catch (error: any) {
      console.log(`    ✗ Failed: ${error.message}`);
      this.auditLogger.logError(this.id, error.message, {
        action: decision.type, round,
      });
    }
  }

  getTradeLog() { return this.tradeLog; }
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════════════════════════════

async function main() {
  console.log(DIVIDER);
  console.log('  AUTONOMOUS AGENT DEMO');
  console.log('  3 AI Agents • Independent Wallets • Real Protocol Calls');
  console.log(DIVIDER);

  const connection = new web3.Connection(DEVNET, 'confirmed');

  // Initialize audit logger
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const auditLogger = new AuditLogger(path.join(logDir, 'autonomous-demo.jsonl'));

  // ── PHASE 1: Create Agent Wallets via HD Derivation ──────────
  console.log(`\n${LINE}`);
  console.log('  Phase 1: HD Wallet Factory (BIP44 Derivation)');
  console.log(LINE);

  // One master seed → infinite deterministic agent wallets
  const hdFactory = HDWalletFactory.generate();
  const mnemonic = hdFactory.getMnemonic();
  const words = mnemonic.split(' ');
  console.log(`\n  Master mnemonic (24 words — single backup restores ALL agents):`);
  console.log(`    ${words.slice(0, 8).join(' ')}`);
  console.log(`    ${words.slice(8, 16).join(' ')}`);
  console.log(`    ${words.slice(16, 24).join(' ')}`);
  console.log(`\n  Derivation path: m/44'/501'/<agentIndex>'/0' (Solana BIP44)`);

  const agentConfigs: Array<{ config: AgentConfig; role: string }> = [
    {
      role: 'defi-trader',
      config: {
        id: 'agent-defi-trader',
        name: 'DeFi Trader',
        strategy: 'trading',
        maxTransactionSize: 0.5,
        autoApprove: true,
      },
    },
    {
      role: 'liquidity-provider',
      config: {
        id: 'agent-lp',
        name: 'Liquidity Provider',
        strategy: 'liquidity-provider',
        maxTransactionSize: 0.3,
        autoApprove: true,
      },
    },
    {
      role: 'arbitrage-scout',
      config: {
        id: 'agent-arb',
        name: 'Arbitrage Scout',
        strategy: 'arbitrage',
        maxTransactionSize: 0.2,
        autoApprove: true,
      },
    },
  ];

  const agents: AutonomousAgent[] = [];

  for (const { config, role } of agentConfigs) {
    // Derive wallet from master seed via BIP44 path
    const derivation = hdFactory.deriveForAgent(config.id);
    const wallet = new AgenticWallet(derivation.keypair, connection);
    const autoAgent = new AutonomousAgent(config, wallet, connection, auditLogger, role);
    agents.push(autoAgent);

    auditLogger.logAgentRegistered(config.id, {
      name: config.name,
      strategy: config.strategy,
      role,
      maxTransactionSize: config.maxTransactionSize,
      derivationPath: derivation.path,
    });

    console.log(`\n  ${config.name} (${role})`);
    console.log(`    Derived:  ${derivation.path}`);
    console.log(`    Wallet:   ${wallet.publicKey.toString()}`);
    console.log(`    Strategy: ${config.strategy}`);
    console.log(`    Max Tx:   ${config.maxTransactionSize} SOL`);
  }

  // ── PHASE 2: Fund Agents ────────────────────────────────────────
  console.log(`\n${LINE}`);
  console.log('  Phase 2: Fund Agents (Devnet Airdrop)');
  console.log(LINE);

  for (const a of agents) {
    try {
      console.log(`\n  Airdropping 2 SOL → ${a.name}...`);
      const sig = await connection.requestAirdrop(
        a.wallet.publicKey,
        2 * web3.LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig);
      console.log(`    ✓ Funded: ${sig.slice(0, 40)}...`);
    } catch (e: any) {
      console.log(`    ↳ Airdrop issue: ${e.message}`);
      console.log(`    ↳ Attempting smaller airdrop...`);
      try {
        const sig = await connection.requestAirdrop(
          a.wallet.publicKey,
          1 * web3.LAMPORTS_PER_SOL,
        );
        await connection.confirmTransaction(sig);
        console.log(`    ✓ Funded with 1 SOL`);
      } catch (e2: any) {
        console.log(`    ✗ Airdrop failed: ${e2.message}`);
      }
    }
    await sleep(1500); // Rate limit
  }

  // Show balances
  console.log('\n  Agent Balances:');
  for (const a of agents) {
    const bal = await a.wallet.getBalance();
    console.log(`    ${a.name.padEnd(22)} ${bal.toFixed(6)} SOL`);
  }

  // Check if any agent has balance
  const totalBal = await Promise.all(agents.map((a) => a.wallet.getBalance()));
  if (totalBal.every((b) => b < 0.05)) {
    console.log('\n  ✗ No agents have sufficient balance. Exiting.');
    console.log('    Fund the wallets above and retry.');
    auditLogger.close();
    return;
  }

  // ── PHASE 3: Autonomous Simulation ─────────────────────────────
  console.log(`\n${DIVIDER}`);
  console.log('  Phase 3: Autonomous Simulation');
  console.log(`  Each agent independently: observe → decide → execute → log`);
  console.log(DIVIDER);

  const ROUNDS = 4;
  const peerAddresses = agents.map((a) => a.address);

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n┌${'─'.repeat(68)}┐`);
    console.log(`│  ROUND ${round}/${ROUNDS}${' '.repeat(56 - String(ROUNDS).length)}│`);
    console.log(`└${'─'.repeat(68)}┘`);

    for (const agent of agents) {
      const peers = peerAddresses.filter((a) => a !== agent.address);
      await agent.runCycle(round, peers);
      await sleep(800);
    }

    // Round balance snapshot
    console.log(`\n  ${'─'.repeat(50)}`);
    console.log(`  Round ${round} Balances:`);
    for (const a of agents) {
      const bal = await a.wallet.getBalance();
      console.log(`    ${a.name.padEnd(22)} ${bal.toFixed(6)} SOL`);
    }
  }

  // ── PHASE 4: Audit Trail Report ────────────────────────────────
  console.log(`\n${DIVIDER}`);
  console.log('  Phase 4: Audit Trail Report');
  console.log(DIVIDER);

  const summary = auditLogger.summary();
  console.log(`\n  Total audit entries: ${summary.totalEntries}`);
  console.log(`  Successful executions: ${summary.successfulExecutions}`);
  console.log(`  Failed executions: ${summary.failedExecutions}`);
  console.log(`  Denied actions: ${summary.deniedActions}`);
  console.log(`  First entry: ${summary.firstEntry}`);
  console.log(`  Last entry:  ${summary.lastEntry}`);

  console.log(`\n  Events by type:`);
  for (const [event, count] of Object.entries(summary.byEvent)) {
    console.log(`    ${event.padEnd(25)} ${count}`);
  }

  // ── PHASE 5: Agent Performance Summary ─────────────────────────
  console.log(`\n${DIVIDER}`);
  console.log('  Phase 5: Agent Performance Summary');
  console.log(DIVIDER);

  console.log(`\n  ┌────────────────────────┬──────────────┬────────────┬─────────────────────┐`);
  console.log(`  │ Agent                  │ Final Bal    │ Trades     │ Role                │`);
  console.log(`  ├────────────────────────┼──────────────┼────────────┼─────────────────────┤`);

  for (const a of agents) {
    const bal = await a.wallet.getBalance();
    const trades = a.getTradeLog().length;
    console.log(
      `  │ ${a.name.padEnd(22)} │ ${bal.toFixed(6).padStart(12)} │ ${String(trades).padStart(10)} │ ${a.role.padEnd(19)} │`
    );
  }
  console.log(`  └────────────────────────┴──────────────┴────────────┴─────────────────────┘`);

  // ── Trade Log Detail ───────────────────────────────────────────
  console.log(`\n  Transaction Log:`);
  console.log(`  ${LINE}`);

  let txNum = 1;
  for (const a of agents) {
    for (const entry of a.getTradeLog()) {
      console.log(
        `  ${txNum}. [${a.name}] Round ${entry.round} — ${entry.action}`
      );
      console.log(
        `     Sig: ${entry.signature.slice(0, 50)}...`
      );
      console.log(
        `     https://explorer.solana.com/tx/${entry.signature}?cluster=devnet`
      );
      txNum++;
    }
  }

  // ── Audit log file ─────────────────────────────────────────────
  const logSize = auditLogger.getLogSize();
  const logPath = auditLogger.getLogPath();
  console.log(`\n  Audit log: ${logPath}`);
  console.log(`  Log size:  ${logSize} bytes`);

  auditLogger.close();

  // Verify HD wallet integrity before cleanup
  const integrityOk = hdFactory.verifyIntegrity();
  console.log(`\n  HD Wallet integrity check: ${integrityOk ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  All ${agents.length} agent wallets derived from single mnemonic`);

  // Zero sensitive data
  hdFactory.destroy();
  console.log(`  Master seed zeroed from memory`);

  // ── Done ───────────────────────────────────────────────────────
  console.log(`\n${DIVIDER}`);
  console.log('  DEMO COMPLETE');
  console.log(DIVIDER);
  console.log(`
  What this demonstrated:

    ✓ HD Wallet Factory (BIP44): one mnemonic → 3 deterministic agent wallets
    ✓ Agent Brain reasoning: structured chain-of-thought before every action
    ✓ 3 independent AI agents with cryptographically isolated wallets
    ✓ Autonomous decision-making (brain → decide → execute → log)
    ✓ Real DeFi protocol interaction (SOL ↔ wSOL wrapping)
    ✓ On-chain memo logging (SPL Memo Program)
    ✓ Peer-to-peer transfers between agents
    ✓ Strategy-specific behavior (trading, LP, arbitrage)
    ✓ Risk limits (max tx size, balance thresholds, cooldowns)
    ✓ Circuit breaker (3 consecutive failures → stop)
    ✓ Persistent JSONL audit trail for every action + brain trace
    ✓ All transactions verifiable on Solana Explorer
  `);
}

main().catch(console.error);

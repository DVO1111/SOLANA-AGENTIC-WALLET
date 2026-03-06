# Solana Agentic Wallet

> **Autonomous AI agents that create wallets, enforce spending policies, interact with DeFi protocols, learn from outcomes, and leave a full audit trail -- all on Solana devnet.**

---

## The Agent -> Wallet -> Protocol -> Learn Loop

```
+--------------------------------------------------------------+
|  0. DERIVE     HD Wallet Factory (BIP44) → one mnemonic      |
|                → deterministic wallet per agent               |
+--------------------------------------------------------------+
|  1. OBSERVE    Agent reads balance, market signals, history  |
+--------------------------------------------------------------+
|  2. REASON     AgentBrain chain-of-thought (rule or LLM)     |
+--------------------------------------------------------------+
|  3. DECIDE     Scoring engine (0->1) picks action + size     |
+--------------------------------------------------------------+
|  4. POLICY     PolicyEngine checks spending rules before tx  |
+--------------------------------------------------------------+
|  5. EXECUTE    SecureEnclave signs within enclave boundary    |
+--------------------------------------------------------------+
|  6. LEARN      adaptRisk() adjusts future risk from results  |
+--------------------------------------------------------------+
       ^                                           |
       +-------------- next round ----------------+
```

This is **not** a script that sends one transfer. It is a full autonomous agent system with:
- **HD Wallet Factory** -- BIP44 derivation: one 24-word mnemonic → infinite deterministic agent wallets
- **AgentBrain** -- structured chain-of-thought reasoning (rule engine + LLM via Claude API)
- **SecureEnclave** -- TEE/HSM simulation with signing attestation records
- **3 distinct AI agents** (trader, LP, arbitrageur) running concurrently
- **Composable PolicyEngine** -- modular spending rules enforced before every tx
- **Real protocol interaction** -- Jupiter DEX quotes, wSOL wrap/unwrap, SPL Memo on-chain
- **Feedback loop** -- agents visibly adapt risk multiplier between rounds
- **Encrypted key store** -- AES-256-GCM, keys never exposed to agent logic
- **Append-only audit trail** -- every permission check, rate limit, and execution logged to JSONL

---

## Live Devnet Proof

Every transaction below was executed on Solana devnet and is independently verifiable on Solana Explorer. Click any link.

| # | Action | Signature | Explorer |
|---|--------|-----------|----------|
| 1 | SOL Transfer (admin → trader) | `2BDT5zbf...9JCs` | [View on Explorer](https://explorer.solana.com/tx/2BDT5zbf7AuJb25rW9p45XjUx1JxkdaaRMRD64jW8U5oR6XnT7y4WNYpVFuYh2sL9ts8ViqRAVSVDM4jbiQr9JCs?cluster=devnet) |
| 2 | On-Chain Memo (SPL Memo v2) | `iT5H5Xp3...sTUx` | [View on Explorer](https://explorer.solana.com/tx/iT5H5Xp3aSZ2sm4NcxcXXQCfF5NVk6W59c5acUtFf42mJ9QggDh9ugh4RGdngNBtAdijnfRsYW6ypjo2scPsTUx?cluster=devnet) |
| 3 | SOL Transfer (trader → admin) | `4AfmoPCC...s8D` | [View on Explorer](https://explorer.solana.com/tx/4AfmoPCCHYvfD8zcw8uTkws6M7sxPr31qNx2TFK4oCRt8doiopsLXArDHb75hhKPgPZxjCChF8RtePxdhAdRus8D?cluster=devnet) |
| 4 | wSOL Wrap (DeFi protocol) | `k2q5BSJe...ngvm` | [View on Explorer](https://explorer.solana.com/tx/k2q5BSJeVMtM5mwk7yrTWrBVVFN3eULH4TsLfLNAmzfY4chf2dcrD1Vuh8woiRnMqMsZTKoFbFM1PprJb3angvm?cluster=devnet) |
| 5 | wSOL Unwrap (reclaim SOL) | `XdQQ2m3t...jPP` | [View on Explorer](https://explorer.solana.com/tx/XdQQ2m3tCkEiC2Ueku5kKHL5APhk7JrEq89jWkdFgamUUBiGe8X6wZHj3cMuNbnsHqHakzQizqNoALNfthZNjPP?cluster=devnet) |

Agent wallets used:
- **Admin**: `GqTjGuwipoKyJjR81w8WpqGhbMKLwWJwU7mVobZ1GXDS`
- **Trader Alpha**: `8sk5XPHUvf3SGx2Mm336NhaiQnL66ken1pp1t5yVc4bw`

---

## Hero Demo -- 30-Second Proof

```bash
npm install && npm run build
npm run autonomous-demo          # 3 agents, real protocol calls, full output
```

What you will see:
1. HD Wallet Factory derives 3 agent wallets from a single 24-word mnemonic (BIP44)
2. AgentBrain reasons via chain-of-thought before every action
3. PolicyEngine loads per-agent spending rules
4. Each agent wraps SOL -> wSOL (Jupiter), transfers to peers, writes on-chain memos
5. Agents call adaptRisk() -- risk multiplier adjusts based on win/loss history
6. Full audit summary prints at the end (including brain traces)

---

## Architecture at a Glance

```
+-------------------------------------------------------------+
|            HD Wallet Factory (HDWalletFactory.ts)            |
|  BIP44 derivation: m/44'/501'/<index>'/0' per agent         |
|  24-word mnemonic → deterministic wallets                   |
+--------------------------+----------------------------------+
                           | Keypair
+--------------------------v----------------------------------+
|          AgentBrain (AgentBrain.ts)                          |
|  RuleBasedBrain (default) | LLMBrain (Claude API)           |
|  Chain-of-thought → AgentIntent                             |
+--------------------------+----------------------------------+
                           | Intent
+--------------------------v----------------------------------+
|                   AI Agent (Agent.ts)                       |
|  State machine - Scoring engine - Feedback loop             |
+--------------------------+----------------------------------+
                           | Decision
+--------------------------v----------------------------------+
|               PolicyEngine (PolicyEngine.ts)                |
|  maxPerTx - dailyCap - actionWhitelist - cooldown - ...     |
+--------------------------+----------------------------------+
                           | Allowed?
+--------------------------v----------------------------------+
|            ExecutionEngine (ExecutionEngine.ts)              |
|  Permission scope - Rate limit - Volume cap - AuditLogger   |
+--------------------------+----------------------------------+
                           | Sign + Broadcast
+--------------------------v----------------------------------+
|   SecureEnclave (SecureEnclave.ts)                           |
|  TEE/HSM simulation - Signing attestation - Policy checks   |
|   Agentic Wallet (AgenticWallet.ts / SecureKeyStore.ts)     |
|  Keypair encrypted at rest - Autonomous signing             |
+--------------------------+----------------------------------+
                           |
+--------------------------v----------------------------------+
|          Solana Devnet + Protocol Layer                      |
|  SOL transfers - SPL tokens - Token-2022 - Jupiter - Memo   |
+-------------------------------------------------------------+
```

---

## Key Security Features

| Feature | Implementation |
|---------|----------------|
| **HD Wallet (BIP44)** | One mnemonic → deterministic wallets per agent |
| Key Isolation | Agent logic **cannot** read private keys |
| Encrypted Storage | AES-256-GCM + PBKDF2 (100k iterations) |
| **SecureEnclave** | TEE/HSM simulation with HMAC-SHA256 attestation |
| PolicyEngine | Composable, inspectable per-agent spending rules |
| Permission Scoping | Whitelisted actions, destinations, amounts |
| Transaction Limits | Per-tx cap + daily volume cap |
| Rate Limiting | Sliding-window per minute |
| Destination Control | Optional recipient whitelist |
| Memory Hygiene | Secret keys + mnemonic zeroed after use |
| Audit Trail | Append-only JSONL log of every check, brain trace, and execution |

---

## PolicyEngine -- Composable Spending Rules

The standalone PolicyEngine sits between agent decisions and on-chain execution. Every transaction must pass **all** active policies:

```typescript
import {
  PolicyEngine,
  maxPerTransaction,
  dailySpendingCap,
  actionWhitelist,
  allowedProgramIds,
  cooldownBetweenTx,
} from './security/PolicyEngine';

const policy = new PolicyEngine();
policy.addPolicy(maxPerTransaction(0.5));           // Max 0.5 SOL per tx
policy.addPolicy(dailySpendingCap(5));              // Max 5 SOL/day
policy.addPolicy(cooldownBetweenTx(5000));          // 5s between txs
policy.addPolicy(actionWhitelist(['transfer_sol', 'swap']));
policy.addPolicy(allowedProgramIds([                // Only these on-chain programs
  '11111111111111111111111111111111',                // System Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',    // Token Program
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',    // Memo v2
]));

const result = policy.evaluate({
  agentId: 'trader-alpha',
  action: 'swap',
  amount: 0.3,
  timestamp: Date.now(),
  programIds: ['11111111111111111111111111111111'],   // System Program
});

console.log(result.allowed);     // true
console.log(result.violations);  // []
```

**10 built-in policy factories**: maxPerTransaction, dailySpendingCap, dailyTransactionLimit, cooldownBetweenTx, actionWhitelist, allowedRecipients, **allowedProgramIds**, minimumBalanceReserve, maxPercentOfBalance, tradingWindow

**3 preset bundles**: createTradingPolicies(), createLiquidityPolicies(), createMonitorPolicies()

---

## HD Wallet Factory -- BIP44 Deterministic Derivation

One master seed generates all agent wallets. Same mnemonic + index = same wallet, every time.

```typescript
import { HDWalletFactory } from './wallet/HDWalletFactory';

// Generate master seed (24-word mnemonic)
const factory = HDWalletFactory.generate();
console.log(factory.getMnemonic()); // "abandon ability ..."

// Derive wallets for each agent — BIP44 path m/44'/501'/<index>'/0'
const trader = factory.deriveForAgent('trader-alpha');   // index 0
const lp     = factory.deriveForAgent('lp-beta');        // index 1
const arb    = factory.deriveForAgent('arb-gamma');      // index 2

// Encrypted persistence (AES-256-GCM + PBKDF2)
factory.saveTo('./hd-wallet.encrypted.json', 'strong-password');

// Restore from backup
const restored = HDWalletFactory.loadFrom('./hd-wallet.encrypted.json', 'strong-password');

// Verify all derived keys match
factory.verifyIntegrity(); // true

// Zero sensitive data when done
factory.destroy();
```

---

## AgentBrain -- LLM-Driven Reasoning

Structured chain-of-thought reasoning between on-chain state and wallet actions. Two implementations: rule-based (default, no API key) and LLM (Claude API).

```typescript
import { createBrain, RuleBasedBrain, EnvironmentState } from './agents/AgentBrain';

// Auto-selects: LLM if AGENT_LLM_API_KEY env var is set, otherwise rule engine
const brain = createBrain();

const env: EnvironmentState = {
  agentId: 'trader-alpha',
  strategy: 'trading',
  balance: 1.5,
  peerBalances: [{ address: 'Abc...', balance: 0.8 }],
  recentTrades: [{ success: true, amount: 0.1, type: 'transfer', timestamp: Date.now() }],
  riskMultiplier: 1.0,
  consecutiveFailures: 0,
  roundNumber: 3,
};

const trace = await brain.reason(env);

console.log(trace.model);       // 'rule-engine-v1' or 'claude-haiku'
console.log(trace.thoughts);    // Step-by-step reasoning chain
console.log(trace.intent);      // { action: 'swap', amount: 0.18, confidence: 0.75, reasoning: '...' }
console.log(trace.durationMs);  // Time to reason
```

---

## SecureEnclave -- TEE/HSM Simulation

Keys never leave the enclave boundary. Every signing produces a cryptographic attestation record.

```typescript
import { SecureEnclave } from './security/SecureEnclave';
import { SecureKeyStore } from './security/SecureKeyStore';

const keyStore = new SecureKeyStore('./keystore');
const enclave = new SecureEnclave(keyStore, 'enclave-prod-01', {
  maxInstructions: 5,
  maxValuePerSign: 1.0,  // SOL
});

// Sign within enclave — key is decrypted momentarily, then zeroed
const result = await enclave.signTransaction(agentId, password, transaction);

console.log(result.attestation.id);         // Unique attestation ID
console.log(result.attestation.enclaveId);  // 'enclave-prod-01'
console.log(result.attestation.signature);  // HMAC-SHA256 proof

// Verify attestation authenticity
const valid = enclave.verifyAttestation(result.attestation); // true

// Production upgrade path
const status = enclave.getStatus();
console.log(status.productionPath);
// → "Replace SecureKeyStore with AWS CloudHSM / Intel SGX. Interface stays identical."
```

---

## Agent Feedback Loop -- Visible Learning

Agents do not just execute -- they **learn**. After each round, adaptRisk() adjusts the agent's risk multiplier based on recent outcomes:

```typescript
// After executing a decision:
agent.recordOutcome(success);   // Track win/loss in sliding window

// End of round -- agent adapts:
const feedback = agent.adaptRisk();
// -> [Trader Alpha] ADAPT round 3: risk 1.0->1.1 (Win rate 80% > 70% -> risk up)

// Risk multiplier scales all future trade sizes
// High wins -> bigger trades, losses -> smaller trades
```

The full feedback history is available via agent.getFeedbackLog() -- an array of timestamped entries showing exactly how the agent adapted over time.

---

## Protocol Interactions (Real On-Chain)

| Protocol | What It Does | Action Type |
|----------|-------------|-------------|
| **SOL Transfers** | Send SOL between agent wallets | transfer_sol |
| **SPL Token Ops** | Create accounts, transfer tokens | transfer_token |
| **Token-2022** | Transfer fees, soulbound, metadata, interest | Extensions |
| **Jupiter DEX** | Swap quotes + SOL to wSOL wrap/unwrap | swap |
| **SPL Memo v2** | On-chain memos (audit anchors) | write_memo |

All protocol calls happen through the ExecutionEngine -> PolicyEngine -> AuditLogger pipeline.

---

## Multi-Agent Simulation

Three independent agents with different strategies run concurrently:

| Agent | Strategy | Risk Profile |
|-------|----------|-------------|
| Trader Alpha | Trading | Aggressive, 5-15% of balance per trade |
| LP Beta | Liquidity Provider | Conservative, stakes + harvests |
| Arb Gamma | Arbitrage | Fast, small 3% trades |

Each agent has:
- Its own encrypted wallet
- Its own PolicyEngine configuration
- Independent state machine (idle -> evaluating -> executing -> cooldown)
- Circuit breaker (3 consecutive failures -> halt)
- Exponential backoff cooldown
- Visible feedback/learning loop

---

## Project Structure

```
solana-agentic-wallet/
+-- src/
|   +-- wallet/
|   |   +-- AgenticWallet.ts          # Core wallet: create, sign, send
|   |   +-- HDWalletFactory.ts        # BIP44 HD derivation from mnemonic
|   |   +-- TokenManager.ts           # SPL token operations
|   |   +-- TokenExtensionsManager.ts # Token-2022 extensions
|   +-- security/
|   |   +-- PolicyEngine.ts           # Composable spending-rule engine
|   |   +-- ExecutionEngine.ts        # Permission-scoped tx execution
|   |   +-- SecureKeyStore.ts         # AES-256-GCM encrypted storage
|   |   +-- SecureEnclave.ts          # TEE/HSM simulation + attestation
|   |   +-- SecureAgenticWallet.ts    # Unified secure wallet API
|   |   +-- AuditLogger.ts           # Append-only JSONL audit trail
|   +-- agents/
|   |   +-- Agent.ts                  # AI agent: state machine + feedback loop
|   |   +-- AgentBrain.ts            # Chain-of-thought reasoning (rule + LLM)
|   |   +-- simulation.ts            # Multi-agent test harness
|   +-- protocols/
|   |   +-- JupiterClient.ts         # Jupiter v6 API + wSOL wrapping
|   +-- scripts/
|   |   +-- autonomousAgentDemo.ts    # Hero demo: 3 agents, full loop
|   |   +-- multiAgentSimulation.ts   # Multi-agent simulation
|   |   +-- swapDemo.ts              # Jupiter swap demo
|   |   +-- memoDemo.ts              # Memo program demo
|   |   +-- ...
|   +-- cli.ts                        # Interactive CLI
|   +-- index.ts                      # All exports
+-- ARCHITECTURE.md                   # System architecture + ASCII diagrams
+-- SECURITY.md                       # Security model deep dive
+-- SKILLS.md                         # Agent operator manual (527 lines)
+-- DEEP_DIVE.md                      # Technical documentation
+-- README.md
```

---

## Installation

```bash
# Prerequisites: Node.js 16+, npm
git clone https://github.com/DVO1111/SOLANA-AGENTIC-WALLET.git
cd SOLANA-AGENTIC-WALLET
npm install
npm run build
```

## Commands

```bash
# Autonomous Demo -- 3 AI agents, real protocol calls, audit trail
npm run autonomous-demo

# Jupiter Swap Demo -- wSOL wrapping + DEX quote integration
npm run swap-demo

# Memo Program Demo -- agents write on-chain memos
npm run memo-demo

# Multi-Agent Simulation -- 3 agents with scoring engine
npm run simulate

# Security Demo -- encrypted wallets, permission enforcement
npm run secure

# Live Trading Demo -- real devnet transactions
npm run live

# Interactive CLI
npm run cli

# Devnet Utilities
npm run devnet:check <wallet-address>
npm run devnet:airdrop <wallet-address>
```

---

## Secure Wallet Usage

```typescript
import { SecureAgenticWallet } from './security/SecureAgenticWallet';
import { PermissionLevel } from './security/ExecutionEngine';
import { createTradingPolicies } from './security/PolicyEngine';
import * as web3 from '@solana/web3.js';

const connection = new web3.Connection('https://api.devnet.solana.com');

// Create wallet with encrypted storage + policy engine
const wallet = await SecureAgenticWallet.create(connection, './secure-wallets', {
  agentId: 'my-agent',
  name: 'Trading Bot',
  permissions: {
    level: PermissionLevel.STANDARD,
    maxTransactionAmount: 0.1,
    maxDailyVolume: 1.0,
    allowedActions: ['transfer_sol', 'swap'],
    rateLimit: 10,
  },
}, 'secure-password');

// Every execute() passes through PolicyEngine -> permissions -> rate limit -> sign
const result = await wallet.execute({
  action: 'transfer_sol',
  destination: 'RecipientAddress...',
  amount: 0.05,
});
```

---

## Features Checklist

### Core Wallet
- [x] **HD Wallet Factory** -- BIP44 derivation (m/44'/501'/index'/0')
- [x] 24-word mnemonic backup → restore all agent wallets
- [x] Create wallets programmatically (Keypair.generate())
- [x] Autonomous transaction signing
- [x] Hold SOL and SPL tokens
- [x] Encrypted key storage (AES-256-GCM)

### Agent Intelligence
- [x] **AgentBrain** -- structured chain-of-thought reasoning
- [x] Rule-based engine (default, no API key)
- [x] LLM reasoning (Claude API, opt-in via AGENT_LLM_API_KEY)
- [x] State machine (idle -> evaluating -> executing -> cooldown)
- [x] Decision scoring engine (0->1, 6 rules)
- [x] Strategy patterns (trading, LP, arbitrage)
- [x] Circuit breaker (3 failures -> halt)
- [x] **Feedback loop** -- adaptRisk() adjusts between rounds
- [x] Performance window with sliding win-rate tracking

### Security and Policy
- [x] **SecureEnclave** -- TEE/HSM simulation with attestation
- [x] Enclave-level signing policy (max ixs, allowed programs, max value)
- [x] HMAC-SHA256 attestation records for every signing event
- [x] **PolicyEngine** -- 9 composable policy factories
- [x] Permission-scoped execution
- [x] Rate limiting (sliding window)
- [x] Daily volume caps
- [x] Destination whitelisting
- [x] Memory hygiene (keys + mnemonic zeroed after use)

### Protocol Interaction
- [x] SOL transfers
- [x] SPL token operations
- [x] Token-2022 extensions (fees, soulbound, metadata, interest)
- [x] **Jupiter DEX** -- swap quotes + wSOL wrap/unwrap
- [x] **SPL Memo v2** -- on-chain memos
- [x] **Audit trail** -- append-only JSONL

### Multi-Agent
- [x] 3 concurrent agents with different strategies
- [x] Independent wallets per agent
- [x] Parallel execution
- [x] Multi-agent test harness

### Observability
- [x] AuditLogger (JSONL) -- every check and execution
- [x] Transaction logging with success/failure
- [x] CLI dashboard
- [x] Web dashboard (React + Express)

### Documentation
- [x] README (you are reading it)
- [x] ARCHITECTURE.md -- ASCII diagrams, component map
- [x] SECURITY.md -- threat model, encryption details
- [x] SKILLS.md -- operator manual (527 lines)
- [x] DEEP_DIVE.md -- technical deep dive

---

## Testing

```bash
npm test                    # 77 tests across 5 suites
npx tsc --noEmit           # Full type-check
```

| Suite | Tests | Coverage |
|-------|-------|---------|
| HDWalletFactory | 11 | BIP44 derivation, encrypted persistence, integrity |
| PolicyEngine | 24 | All 9 policy factories, presets, composition |
| AgenticWallet | 16 | Wallet creation, signing, balance |
| Agent | 14 | Scoring engine, state machine, strategies |
| TokenExtensions | 12 | SPL operations, Token-2022 |

---

## Future Enhancements

- [ ] Hardware wallet integration (Ledger / YubiHSM)
- [ ] Multi-signature approval flows
- [ ] Lending protocol support (Solend / Marginfi)
- [ ] NFT operations (Metaplex)
- [ ] Governance voting (Realms)
- [ ] Reinforcement learning agent brain
- [ ] Docker containerization + CI/CD

---

## Resources

- [Solana Documentation](https://docs.solana.com)
- [Web3.js Library](https://solana-labs.github.io/solana-web3.js/)
- [SPL Token Program](https://spl.solana.com/token)
- [Jupiter API](https://station.jup.ag/docs)

## License

MIT

---

**Built for the Solana Agentic Wallet bounty -- autonomous agents managing real on-chain assets.**

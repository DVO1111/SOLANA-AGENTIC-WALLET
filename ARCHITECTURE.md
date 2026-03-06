# ARCHITECTURE.md

> System architecture for the Solana Agentic Wallet — an operating system for AI agents to control wallets on Solana.

---

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI AGENT BRAIN                           │
│  Observes environment, evaluates strategy, generates decisions  │
│                                                                 │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Trading  │  │ Liquidity │  │ Arbitrage  │  │  Custom    │  │
│  │ Strategy │  │ Strategy  │  │ Strategy   │  │  Strategy  │  │
│  └────┬─────┘  └─────┬─────┘  └─────┬──────┘  └─────┬──────┘  │
│       └──────────────┼──────────────┼────────────────┘         │
│                      ▼                                          │
│              ┌──────────────┐                                   │
│              │   Decision   │  Scored 0→1 by rule engine        │
│              │   Engine     │  Circuit breaker, cooldown         │
│              └──────┬───────┘                                   │
└─────────────────────┼───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTION ENGINE                              │
│  Permission check → Rate limit → Volume limit → Build tx       │
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐              │
│  │ Permissions │ │ Rate Limiter│ │Volume Tracker│              │
│  │ Validator   │ │ (per agent) │ │ (daily caps) │              │
│  └─────────────┘ └─────────────┘ └──────────────┘              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Audit Logger (JSONL) — every check + result persisted   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WALLET LAYER                                  │
│  AES-256-GCM encrypted keystore → in-memory decrypt → sign     │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ SecureKey    │  │ Agentic      │  │ Token        │          │
│  │ Store        │  │ Wallet       │  │ Manager      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROTOCOL LAYER                                │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐           │
│  │ Jupiter     │  │ SPL Memo    │  │ Token-2022   │           │
│  │ (Swap/wSOL) │  │ Program     │  │ Extensions   │           │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘           │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          └────────────────┼────────────────┘
                           ▼
              ┌────────────────────────┐
              │     SOLANA DEVNET      │
              │   (or mainnet-beta)    │
              └────────────────────────┘
```

---

## Directory Structure

```
src/
├── agents/                    # AI Agent Brain
│   ├── Agent.ts               # State machine + decision scoring engine
│   ├── Agent.test.ts          # 26 unit tests
│   └── simulation.ts          # MultiAgentTestHarness
│
├── wallet/                    # Wallet Layer
│   ├── AgenticWallet.ts       # Basic autonomous wallet (sign, send, memo)
│   ├── AgenticWallet.test.ts  # 6 unit tests
│   ├── TokenManager.ts        # SPL token operations
│   ├── TokenExtensionsManager.ts  # Token-2022 (transfer fees, soulbound, etc.)
│   └── TokenExtensionsManager.test.ts  # 10 unit tests
│
├── security/                  # Execution Engine + Key Management
│   ├── ExecutionEngine.ts     # Permission-scoped execution, rate limits, volume caps
│   ├── SecureAgenticWallet.ts # Production API: execute(action, params) → result
│   ├── SecureKeyStore.ts      # AES-256-GCM encrypted key storage
│   ├── AuditLogger.ts         # JSONL persistent audit trail
│   └── index.ts
│
├── protocols/                 # Protocol Integrations
│   ├── JupiterClient.ts       # Jupiter v6 swap API + SOL↔wSOL wrapping
│   └── index.ts
│
├── scripts/                   # Demo Scripts
│   ├── autonomousAgentDemo.ts # ★ Hero demo: 3 agents, real protocol calls
│   ├── jupiterSwapDemo.ts     # Jupiter / wSOL integration demo
│   ├── memoProtocolDemo.ts    # On-chain memo protocol demo
│   ├── multiAgentSimulation.ts# 3-agent encrypted wallet simulation
│   ├── liveTrading.ts         # Live devnet trading
│   ├── secureWalletDemo.ts    # Secure wallet features
│   └── ...
│
├── api.ts                     # Express REST API server
├── cli.ts                     # Interactive CLI
└── index.ts                   # Library entry point
```

---

## Component Responsibilities

| Component | Responsibility | Never Does |
|-----------|---------------|------------|
| **Agent** | Observes state, generates decisions, scores actions | Never touches keys |
| **Decision Engine** | Scores decisions 0→1, applies strategy rules | Never signs transactions |
| **Execution Engine** | Validates permissions, rate limits, volume caps | Never makes decisions |
| **SecureKeyStore** | Encrypts/decrypts keys (AES-256-GCM) | Never exposes raw keys |
| **AgenticWallet** | Holds keypair, signs + sends transactions | Never decides what to sign |
| **JupiterClient** | Builds swap transactions, wraps/unwraps wSOL | Never stores keys |
| **AuditLogger** | Persists every check and execution result | Never blocks execution |

---

## Security Architecture

### Key Management

```
┌─────────────────────────────────────────────┐
│            SecureKeyStore                    │
│                                             │
│  ┌───────────────────────────┐              │
│  │  Encrypted JSON file       │              │
│  │  AES-256-GCM              │              │
│  │  Random 16-byte IV/salt    │              │
│  │  PBKDF2 key derivation     │              │
│  └────────────┬──────────────┘              │
│               │ retrieveKey(id, password)    │
│               ▼                              │
│  ┌───────────────────────────┐              │
│  │  In-memory secretKey       │ ← lives only │
│  │  (Uint8Array)              │   during tx   │
│  └────────────┬──────────────┘              │
│               │ cleanup()                    │
│               ▼                              │
│  ┌───────────────────────────┐              │
│  │  secretKey.fill(0)         │ ← zeroed     │
│  └───────────────────────────┘              │
└─────────────────────────────────────────────┘
```

### Permission Model

Each agent is registered with:

| Setting | Purpose | Example |
|---------|---------|---------|
| `allowedActions` | Whitelist of action types | `['transfer_sol', 'swap', 'write_memo']` |
| `maxTransactionAmount` | Per-tx SOL limit | `0.5 SOL` |
| `maxDailyVolume` | Daily aggregate limit | `5 SOL` |
| `rateLimit` | Transactions per minute | `30 tx/min` |
| `requiresApproval` | Amount threshold for manual approval | `1 SOL` |
| `allowedDestinations` | Optional address whitelist | `['addr1', 'addr2']` |

### Preset Permission Levels

| Level | Max Tx | Daily Vol | Actions |
|-------|--------|-----------|---------|
| Trading | 0.5 SOL | 5 SOL | transfer, token, memo, swap |
| Liquidity | 2 SOL | 20 SOL | + create_token_account |
| Monitor | 0 | 0 | read-only |
| Admin | 10 SOL | 100 SOL | all actions |

---

## Agent Decision Flow (Detail)

```
Agent.generateDecision()
    │
    ├── Check circuit breaker (3+ consecutive failures → stop)
    ├── Check cooldown timer
    ├── Select strategy function (trading / LP / arbitrage)
    │       │
    │       ├── trading:   5–15% of balance, prefer transfers + swaps
    │       ├── LP:        8% of balance, alternate stake/harvest
    │       └── arbitrage: 3% of balance, small fast trades
    │
    └── Return Decision { type, target, amount, metadata }

Agent.evaluateDecision(decision)
    │
    ├── Build StrategyContext (balance, success rate, trade count)
    ├── Score decision (0.0 → 1.0)
    │       │
    │       ├── Balance ratio check (never spend > 90%)
    │       ├── Cooldown penalty (too soon → -0.3)
    │       ├── Consecutive failure penalty (-0.15 each)
    │       ├── Success rate bonus/penalty
    │       └── Strategy-specific bonuses
    │
    ├── Compare score vs APPROVAL_THRESHOLD (0.4)
    │       │
    │       ├── score ≥ 0.4 → executeDecision()
    │       └── score < 0.4 → REJECTED
    │
    └── After execution:
            ├── Update transaction log
            ├── Reset or increment consecutiveFailures
            └── Set cooldown (15s success, 30s×2^n failure)
```

---

## Audit Trail

Every action flows through the `AuditLogger`:

```
permission_check  → allowed/denied
rate_limit_check  → allowed/denied
volume_check      → allowed/denied
execution_start   → info
execution_success → success (+ signature, amount, timing)
execution_failure → failed (+ error message)
```

Stored as JSONL (one JSON object per line):

```json
{"timestamp":"2026-03-06T10:30:00Z","epochMs":1741254600000,"agentId":"agent-defi","event":"permission_check","action":"swap","verdict":"allowed","details":{}}
{"timestamp":"2026-03-06T10:30:01Z","epochMs":1741254601000,"agentId":"agent-defi","event":"execution_success","action":"wrap_sol:0.1000","verdict":"success","details":{"signature":"5abc...","amount":0.1,"timeMs":1200}}
```

---

## Multi-Agent Scaling

```
┌──────────────────────────────────────────────────────────────┐
│                    Agent Orchestrator                          │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Agent 1  │  │ Agent 2  │  │ Agent 3  │  │ Agent N  │     │
│  │ Trader   │  │ LP       │  │ Arb      │  │ Custom   │     │
│  │          │  │          │  │          │  │          │     │
│  │ Wallet 1 │  │ Wallet 2 │  │ Wallet 3 │  │ Wallet N │     │
│  │ (own key)│  │ (own key)│  │ (own key)│  │ (own key)│     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│       │              │             │             │             │
│       └──────────────┴─────────────┴─────────────┘             │
│                          │                                      │
│                    Solana RPC                                   │
└──────────────────────────────────────────────────────────────┘

Each agent:
  ✓ Own keypair (isolated)
  ✓ Own permissions (scoped)
  ✓ Own strategy (independent)
  ✓ Own audit trail (per-agent queryable)
  ✓ Failure isolation (one crash ≠ others crash)
```

---

## Protocol Integrations

| Protocol | What | Where |
|----------|------|-------|
| **Jupiter v6** | DEX aggregator swap API, SOL↔wSOL wrapping | `src/protocols/JupiterClient.ts` |
| **SPL Memo Program** | On-chain structured logging | `write_memo` action in ExecutionEngine |
| **SPL Token** | Token transfers, ATA creation | `src/wallet/TokenManager.ts` |
| **Token-2022** | Transfer fees, soulbound, metadata, interest-bearing, etc. | `src/wallet/TokenExtensionsManager.ts` |

---

## Testing

| Suite | Tests | What |
|-------|-------|------|
| `Agent.test.ts` | 26 | Decision scoring, strategy generation, state machine, circuit breaker |
| `AgenticWallet.test.ts` | 6 | Wallet creation, file I/O, signing, address generation |
| `TokenExtensionsManager.test.ts` | 10 | Token-2022 mint creation, extension configs |
| **Total** | **42** | All passing |

---

## Running

```bash
# Hero demo: 3 autonomous agents with real protocol calls
npm run autonomous-demo

# Jupiter swap: wSOL wrapping + DEX quote
npm run swap-demo

# Multi-agent simulation: 3 encrypted wallet agents
npm run simulate

# Memo protocol interaction
npm run memo-demo

# Unit tests
npm test
```

# SKILLS.md - Agent Capability Manifest

> **Machine-readable capability manifest for AI agents operating Solana Agentic Wallets.**
> 
> Section 0 is the structured manifest (JSON schemas) for programmatic consumption.
> Sections 1–9 provide detailed usage documentation.

---

## 0. Capability Manifest (Machine-Readable)

```json
{
  "manifestVersion": "2.0.0",
  "walletType": "solana-agentic-wallet",
  "network": "devnet",
  "baseUnit": "SOL",
  "capabilities": [
    {
      "action": "transfer_sol",
      "description": "Send SOL to a Solana address",
      "requiredParams": {
        "destination": { "type": "string", "format": "base58-pubkey", "description": "Recipient Solana address" },
        "amount": { "type": "number", "unit": "SOL", "min": 0.000001, "description": "Amount in SOL" }
      },
      "optionalParams": {
        "memo": { "type": "string", "maxLength": 566, "description": "Optional on-chain memo" }
      },
      "returns": {
        "success": { "type": "boolean" },
        "signature": { "type": "string", "format": "base58-signature", "nullable": true },
        "error": { "type": "string", "nullable": true }
      },
      "estimatedFee": 0.000005,
      "programIds": ["11111111111111111111111111111111"]
    },
    {
      "action": "transfer_token",
      "description": "Send SPL token to a Solana address",
      "requiredParams": {
        "destination": { "type": "string", "format": "base58-pubkey" },
        "amount": { "type": "number", "description": "Human-readable token amount" },
        "tokenMint": { "type": "string", "format": "base58-pubkey", "description": "Token mint address" },
        "decimals": { "type": "integer", "min": 0, "max": 18, "description": "Token decimal places" }
      },
      "optionalParams": {
        "memo": { "type": "string", "maxLength": 566 }
      },
      "returns": {
        "success": { "type": "boolean" },
        "signature": { "type": "string", "nullable": true },
        "error": { "type": "string", "nullable": true }
      },
      "estimatedFee": 0.000005,
      "programIds": ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]
    },
    {
      "action": "write_memo",
      "description": "Write data to the SPL Memo Program (on-chain log)",
      "requiredParams": {
        "memo": { "type": "string", "maxLength": 566, "description": "Memo content (plain text or JSON)" }
      },
      "optionalParams": {},
      "returns": {
        "success": { "type": "boolean" },
        "signature": { "type": "string", "nullable": true }
      },
      "estimatedFee": 0.000005,
      "programIds": ["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"]
    },
    {
      "action": "swap",
      "description": "DeFi swap via Jupiter (SOL <-> wSOL, or token swap)",
      "requiredParams": {
        "instructions": { "type": "TransactionInstruction[]", "description": "Pre-built via JupiterClient" }
      },
      "optionalParams": {
        "slippageBps": { "type": "integer", "default": 50, "description": "Slippage tolerance in basis points" }
      },
      "returns": {
        "success": { "type": "boolean" },
        "signature": { "type": "string", "nullable": true },
        "amount": { "type": "number", "nullable": true }
      },
      "estimatedFee": 0.000005,
      "programIds": ["So11111111111111111111111111111111111111112"]
    },
    {
      "action": "create_token_account",
      "description": "Create Associated Token Account for a mint",
      "requiredParams": {
        "tokenMint": { "type": "string", "format": "base58-pubkey" }
      },
      "optionalParams": {
        "owner": { "type": "string", "format": "base58-pubkey", "description": "Account owner (defaults to self)" }
      },
      "returns": {
        "success": { "type": "boolean" },
        "signature": { "type": "string", "nullable": true }
      },
      "estimatedFee": 0.002035,
      "programIds": ["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"]
    },
    {
      "action": "close_account",
      "description": "Close a token account and reclaim rent",
      "requiredParams": {
        "tokenAccount": { "type": "string", "format": "base58-pubkey" }
      },
      "optionalParams": {},
      "returns": {
        "success": { "type": "boolean" },
        "reclaimedRent": { "type": "number", "unit": "SOL" }
      },
      "estimatedFee": 0.000005,
      "programIds": ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]
    }
  ],
  "errorCodes": {
    "ERR_PERMISSION_DENIED": "Action is not in the agent's allowedActions list",
    "ERR_AMOUNT_EXCEEDED": "Amount exceeds maxTransactionAmount for this agent",
    "ERR_DAILY_LIMIT": "Daily spending volume exhausted",
    "ERR_RATE_LIMITED": "Too many transactions per minute",
    "ERR_DESTINATION_BLOCKED": "Recipient address is not whitelisted",
    "ERR_READ_ONLY": "Agent has READ_ONLY permission level",
    "ERR_INSUFFICIENT_BALANCE": "Wallet balance too low (including fee reserve)",
    "ERR_PROGRAM_BLOCKED": "Transaction includes instruction to a non-whitelisted program",
    "ERR_POLICY_VIOLATION": "PolicyEngine rejected the transaction (check violations array)",
    "ERR_CIRCUIT_BREAKER": "Agent halted after 3+ consecutive failures",
    "ERR_COOLDOWN": "Agent is in cooldown period between transactions"
  },
  "permissionLevels": [
    { "level": 0, "name": "READ_ONLY", "canExecute": false },
    { "level": 1, "name": "LIMITED", "canExecute": true, "typicalUse": "Testing / junior agents" },
    { "level": 2, "name": "STANDARD", "canExecute": true, "typicalUse": "Trading bots" },
    { "level": 3, "name": "ELEVATED", "canExecute": true, "typicalUse": "LP agents, complex ops" },
    { "level": 4, "name": "ADMIN", "canExecute": true, "typicalUse": "Full control" }
  ],
  "policyFactories": [
    "maxPerTransaction(solLimit)",
    "dailySpendingCap(solLimit)",
    "dailyTransactionLimit(count)",
    "cooldownBetweenTx(ms)",
    "actionWhitelist(actions[])",
    "allowedRecipients(addresses[])",
    "allowedProgramIds(programIds[])",
    "minimumBalanceReserve(sol, getBalance)",
    "maxPercentOfBalance(percent, getBalance)",
    "tradingWindow(startHourUTC, endHourUTC)"
  ],
  "presetBundles": {
    "createTradingPolicies()": "0.5 SOL/tx, 5 SOL/day, 100 tx/day, 5s cooldown, program whitelist",
    "createLiquidityPolicies()": "2 SOL/tx, 20 SOL/day, 50 tx/day, 10s cooldown, program whitelist",
    "createMonitorPolicies()": "0 spending, memo-only"
  }
}
```

---

## Quick Start

```typescript
// 1. Load your wallet
const wallet = await SecureAgenticWallet.load(
  connection,
  './secure-wallets',
  'my-agent-id',
  permissions,
  'password'
);

// 2. Execute an action
const result = await wallet.execute({
  action: 'transfer_sol',
  destination: 'RecipientAddress...',
  amount: 0.01,
});

// 3. Check result
if (result.success) {
  console.log('Transaction:', result.signature);
}
```

---

## 1. Available Actions

### Action Types

| Action | Description | Required Params | Optional Params |
|--------|-------------|-----------------|-----------------|
| `transfer_sol` | Send SOL to address | `destination`, `amount` | `memo` |
| `transfer_token` | Send SPL token | `destination`, `amount`, `tokenMint`, `decimals` | `memo` |
| `write_memo` | Write on-chain memo via Memo Program | `memo` | — |
| `swap` | DeFi swap (Jupiter / wSOL) | `instructions` (pre-built via JupiterClient) | `memo` |
| `create_token_account` | Create ATA | `tokenMint` | `owner` |
| `close_account` | Close token account | `tokenAccount` | — |
| `custom` | Program instruction | `instruction` | — |

### Action Examples

#### Transfer SOL
```typescript
await wallet.execute({
  action: 'transfer_sol',
  destination: 'RecipientPubkey...',
  amount: 0.05,  // SOL
  memo: 'Payment for service',
});
```

#### Transfer SPL Token
```typescript
await wallet.execute({
  action: 'transfer_token',
  destination: 'RecipientPubkey...',
  amount: 100,      // Token amount (human readable)
  tokenMint: 'TokenMintAddress...',
  decimals: 6,      // Token decimals (e.g., USDC = 6)
});
```

#### Create Token Account
```typescript
await wallet.execute({
  action: 'create_token_account',
  tokenMint: 'TokenMintAddress...',
});
```

#### Write On-Chain Memo (Protocol Interaction)
```typescript
// Write a structured memo to the SPL Memo Program
await wallet.execute({
  action: 'write_memo',
  memo: JSON.stringify({
    agent: 'my-agent',
    event: 'heartbeat',
    timestamp: new Date().toISOString(),
  }),
});

// Or use the convenience method
await wallet.writeMemo('Agent operational');
```

#### DeFi Swap (Jupiter / wSOL)
```typescript
import { JupiterClient, KNOWN_MINTS } from './protocols';

const jupiter = new JupiterClient(connection);

// SOL → wSOL wrapping (always works on devnet)
const wrapResult = await jupiter.wrapSol(keypair, 0.5);

// wSOL → SOL unwrapping
const unwrapResult = await jupiter.unwrapSol(keypair);

// Jupiter aggregator swap (mainnet)
const swapResult = await jupiter.executeSwap(
  keypair,
  KNOWN_MINTS.SOL,
  KNOWN_MINTS.USDC_MAINNET,
  100_000_000, // 0.1 SOL in lamports
  50           // 0.5% slippage
);

// Get a quote without executing
const quote = await jupiter.getReadableQuote(
  KNOWN_MINTS.SOL,
  KNOWN_MINTS.USDC_MAINNET,
  100_000_000
);
```

---

## 2. Execution API Format

### Request Format

```typescript
interface ActionParams {
  action: 'transfer_sol' | 'transfer_token' | 'create_token_account' | 'close_account' | 'write_memo' | 'swap' | 'custom';
  destination?: string;      // Recipient address
  amount?: number;           // Amount (in SOL or tokens)
  tokenMint?: string;        // SPL token mint address
  decimals?: number;         // Token decimals
  inputMint?: string;        // Swap input mint
  outputMint?: string;       // Swap output mint
  slippageBps?: number;      // Swap slippage tolerance
  memo?: string;             // Optional memo
  instruction?: TransactionInstruction;  // For custom actions
}
```

### Response Format

```typescript
interface ExecutionResult {
  success: boolean;
  signature?: string;        // Transaction signature (if successful)
  error?: string;            // Error message (if failed)
  blockedReason?: string;    // Why action was blocked (if permissions denied)
}
```

### Execution Flow

```
wallet.execute(params)
        │
        ▼
┌─────────────────────────┐
│  1. Validate Params     │ ← Type check, required fields
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│  2. Check Permissions   │ ← Action allowed? Amount ok?
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│  3. Check Rate Limit    │ ← Within tx/minute limit?
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│  4. Build Transaction   │ ← Construct Solana tx
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│  5. Sign & Send         │ ← Decrypt key, sign, broadcast
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│  6. Return Result       │ ← Success + signature OR error
└─────────────────────────┘
```

### Convenience Methods

```typescript
// Direct SOL transfer
await wallet.transferSOL(destination, amount);

// Direct token transfer  
await wallet.transferToken(destination, amount, tokenMint, decimals);

// Get balance (no signing required)
const balance = await wallet.getBalance();

// Get address (safe - no key exposure)
const address = wallet.getAddress();

// Check if action would be allowed
const check = wallet.canExecute({ action: 'transfer_sol', amount: 0.5 });
if (!check.allowed) {
  console.log('Blocked:', check.reason);
}
```

---

## 3. Security Rules

### Permission Levels

| Level | Value | Can Execute | Typical Use |
|-------|-------|-------------|-------------|
| `READ_ONLY` | 0 | ❌ No | Monitoring, analytics |
| `LIMITED` | 1 | ✅ Small only | Junior agents, testing |
| `STANDARD` | 2 | ✅ Normal | Trading bots |
| `ELEVATED` | 3 | ✅ Higher | LP agents, complex ops |
| `ADMIN` | 4 | ✅ All | Full control |

### Permission Configuration

```typescript
const permissions: AgentPermissions = {
  level: PermissionLevel.STANDARD,
  maxTransactionAmount: 0.05,    // Max 0.05 SOL per tx
  maxDailyVolume: 0.5,           // Max 0.5 SOL per day
  allowedActions: ['transfer_sol', 'transfer_token'],
  rateLimit: 10,                 // Max 10 tx/minute
  allowedDestinations: ['addr1', 'addr2'],  // Optional whitelist
};
```

### What Gets Blocked

| Condition | Error Message |
|-----------|---------------|
| Action not in allowedActions | `"Action not allowed: {action}"` |
| Amount > maxTransactionAmount | `"Amount X exceeds max Y SOL"` |
| Daily volume exceeded | `"Amount X exceeds remaining allowance Y SOL"` |
| Too many transactions | `"Rate limit exceeded"` |
| Destination not whitelisted | `"Destination not whitelisted"` |
| READ_ONLY level | `"Agent is read-only"` |

### Pre-Flight Check

```typescript
// Check before executing to avoid failures
const check = wallet.canExecute({
  action: 'transfer_sol',
  destination: 'SomeAddress...',
  amount: 0.1,
});

if (check.allowed) {
  await wallet.execute({ ... });
} else {
  console.log('Would be blocked:', check.reason);
  // Adjust amount or action
}
```

---

## 4. Cost Model

### Transaction Costs (Solana Devnet)

| Operation | Base Fee | Rent (if applicable) |
|-----------|----------|----------------------|
| SOL Transfer | ~0.000005 SOL | — |
| Token Transfer | ~0.000005 SOL | — |
| Create Token Account | ~0.000005 SOL | ~0.00203 SOL (rent) |
| Close Account | ~0.000005 SOL | Reclaims rent |

### Planning Transactions

```typescript
// Account for fees when planning
const balance = await wallet.getBalance();
const fee = 0.000005;              // Base transaction fee
const amount = balance - fee - 0.001;  // Leave buffer

if (amount > 0) {
  await wallet.transferSOL(destination, amount);
}
```

### Daily Volume Budget

```typescript
// Check remaining budget
const stats = wallet.getVolumeStats();
console.log('Used today:', stats.dailyVolume);
console.log('Remaining:', stats.remaining);
console.log('Max daily:', stats.maxDaily);

// Plan transactions within budget
if (plannedAmount <= stats.remaining) {
  await wallet.execute({ ... });
}
```

---

## 5. Supported Protocols

### Native Solana

| Program | Supported | Actions |
|---------|-----------|---------|
| System Program | ✅ | Transfer SOL |
| Token Program | ✅ | Transfer, Create ATA |
| Token-2022 | ✅ | Via custom instruction |
| Memo | ✅ | Via memo param |

### DEX Integration (Extensible)

```typescript
// Example: Custom DEX swap instruction
await wallet.execute({
  action: 'custom',
  instruction: new web3.TransactionInstruction({
    keys: [
      { pubkey: userAccount, isSigner: false, isWritable: true },
      { pubkey: poolAccount, isSigner: false, isWritable: true },
      // ... other required accounts
    ],
    programId: DEX_PROGRAM_ID,
    data: Buffer.from([/* swap instruction data */]),
  }),
});
```

### Supported Networks

| Network | Status | RPC |
|---------|--------|-----|
| Devnet | ✅ Active | `https://api.devnet.solana.com` |
| Testnet | ⚠️ Possible | Configure RPC |
| Mainnet | ❌ Blocked | Security sandbox |

---

## 6. Error Handling

### Common Errors

```typescript
try {
  const result = await wallet.execute({ ... });
  
  if (!result.success) {
    // Transaction failed on-chain
    console.log('Failed:', result.error);
  }
} catch (error) {
  // Execution prevented before submission
  if (error.message.includes('not allowed')) {
    // Permission denied
  } else if (error.message.includes('Rate limit')) {
    // Too many transactions
  } else if (error.message.includes('exceeds')) {
    // Amount limit exceeded  
  } else if (error.message.includes('Insufficient')) {
    // Not enough balance
  }
}
```

### Retry Strategy

```typescript
async function executeWithRetry(
  wallet: SecureAgenticWallet,
  params: ActionParams,
  maxRetries = 3
): Promise<ExecutionResult> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await wallet.execute(params);
      if (result.success) return result;
      
      // Reduce amount on failure
      if (params.amount && result.error?.includes('insufficient')) {
        params.amount *= 0.9;
      }
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1));  // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## 7. Best Practices for Agents

### DO ✅

```typescript
// ✅ Check permissions before executing
const check = wallet.canExecute(params);
if (!check.allowed) return;

// ✅ Handle failures gracefully
try {
  await wallet.execute(params);
} catch (e) {
  logger.error(e);
  await reduceActivityLevel();
}

// ✅ Monitor your budget
const stats = wallet.getVolumeStats();
if (stats.remaining < 0.01) {
  await pauseTrading();
}

// ✅ Use appropriate amounts
const safeAmount = Math.min(desiredAmount, permissions.maxTransactionAmount);
```

### DON'T ❌

```typescript
// ❌ Don't try to access private keys (won't work)
wallet.getPrivateKey();  // Method doesn't exist

// ❌ Don't ignore errors
await wallet.execute(params);  // Could silently fail

// ❌ Don't exceed limits
await wallet.execute({ amount: 1000 });  // Will be blocked

// ❌ Don't spam transactions
while (true) { await wallet.execute(...); }  // Rate limited
```

---

## 8. Integration Patterns

### Trading Bot Pattern

```typescript
class TradingAgent {
  private wallet: SecureAgenticWallet;

  async onSignal(signal: TradeSignal): Promise<void> {
    // Check budget
    const { remaining } = this.wallet.getVolumeStats();
    if (remaining < signal.amount) {
      console.log('Daily budget exhausted');
      return;
    }

    // Validate before executing
    const check = this.wallet.canExecute({
      action: 'transfer_sol',
      amount: signal.amount,
      destination: signal.target,
    });

    if (!check.allowed) {
      console.log('Blocked:', check.reason);
      return;
    }

    // Execute
    const result = await this.wallet.transferSOL(
      signal.target,
      signal.amount
    );

    if (result.success) {
      console.log('Trade executed:', result.signature);
    }
  }
}
```

### Multi-Agent Coordination

```typescript
// Each agent gets independent wallet
const agents = [
  await SecureAgenticWallet.load(conn, path, 'trader-1', traderPerms, pass),
  await SecureAgenticWallet.load(conn, path, 'trader-2', traderPerms, pass),
  await SecureAgenticWallet.load(conn, path, 'lp-1', lpPerms, pass),
];

// Agents operate independently
await Promise.all(agents.map(agent => agent.runStrategy()));
```

---

## Summary

| What | How |
|------|-----|
| Execute action | `wallet.execute({ action, destination, amount })` |
| Transfer SOL | `wallet.transferSOL(to, amount)` |
| Transfer Token | `wallet.transferToken(to, amount, mint, decimals)` |
| Write memo | `wallet.writeMemo(text)` |
| DeFi swap | `jupiter.wrapSol(keypair, amount)` / `jupiter.executeSwap(...)` |
| Check balance | `wallet.getBalance()` |
| Get address | `wallet.getAddress()` |
| Pre-check | `wallet.canExecute(params)` |
| Get budget | `wallet.getVolumeStats()` |
| Audit trail | `auditLogger.query({ agentId })` |

---

## 9. Persistent Audit Trail

Every permission check, rate-limit check, and execution flows through the `AuditLogger`.

### Setup

```typescript
import { AuditLogger } from './security/AuditLogger';

const logger = new AuditLogger('./logs/audit.jsonl');

// Attach to an ExecutionEngine
engine.setAuditLogger(logger);
```

### Query Logs

```typescript
// All entries for an agent
const entries = logger.query({ agentId: 'trader-1' });

// Denied actions in the last hour
const denied = logger.query({
  verdict: 'denied',
  since: Date.now() - 3600_000,
});

// Summary statistics
const stats = logger.summary('trader-1');
console.log(`Denied: ${stats.deniedActions}`);
console.log(`Successful: ${stats.successfulExecutions}`);
```

### Log Format (JSONL)

Each line in `audit.jsonl` is a self-contained JSON object:

```json
{"timestamp":"2025-01-15T10:30:00.000Z","epochMs":1736937000000,"agentId":"trader-1","event":"permission_check","action":"transfer_sol","verdict":"allowed","details":{}}
{"timestamp":"2025-01-15T10:30:00.100Z","epochMs":1736937000100,"agentId":"trader-1","event":"execution_success","action":"transfer_sol","verdict":"success","details":{"signature":"5abc...","amount":0.05,"timeMs":1200}}
```

**Your wallet. Your autonomy. Your limits.**

---

*For security details, see [SECURITY.md](SECURITY.md)*

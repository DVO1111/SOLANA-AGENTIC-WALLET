# Security Architecture Deep Dive

## Executive Summary

The Solana Agentic Wallet implements a **defense-in-depth security model** that enables AI agents to operate autonomously while preventing unauthorized access to funds. This document details the four pillars of our security architecture:

1. **Key Isolation** - Private keys never exposed to agent logic
2. **Execution Permissions** - Whitelisted actions only
3. **Transaction Policy Engine** - Multi-layered constraints
4. **Sandboxed Environment** - Controlled execution context

---

## 1. Key Isolation

### 1.1 Core Principle

> **Agents cannot read, access, or infer private keys.**

The private key exists only within the secure keystore and is decrypted **momentarily** during transaction signing, then immediately zeroed from memory.

### 1.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT LOGIC                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • Decision making                                       │   │
│  │  • Market analysis                                       │   │
│  │  • Strategy execution                                    │   │
│  │                                                          │   │
│  │  ❌ NO ACCESS TO: Keypair, Private Key, Secret Key       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              │ execute(action, params)          │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   EXECUTION ENGINE                       │   │
│  │  • Validates permissions                                 │   │
│  │  • Checks rate limits                                    │   │
│  │  • Enforces transaction policies                         │   │
│  │  • Builds transaction                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              │ sign(transaction, agentId)       │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   SECURE KEYSTORE                        │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │  Encrypted Storage (AES-256-GCM)                │    │   │
│  │  │  • IV (Initialization Vector)                   │    │   │
│  │  │  • Salt (PBKDF2)                                │    │   │
│  │  │  • AuthTag                                      │    │   │
│  │  │  • EncryptedKey ←── Private key NEVER in plain  │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │  Momentary Decryption:                                   │   │
│  │  1. Derive key from password (PBKDF2, 100k iterations)   │   │
│  │  2. Decrypt private key → sign transaction               │   │
│  │  3. Zero memory immediately                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│                    Signed Transaction → Network                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Implementation Details

#### Encrypted Key Storage Format

```typescript
interface EncryptedWallet {
  version: 1;
  publicKey: string;              // Safe to expose
  algorithm: 'aes-256-gcm';       // Industry standard
  iv: string;                     // Unique per encryption
  salt: string;                   // For PBKDF2 derivation
  authTag: string;                // Integrity verification
  encryptedKey: string;           // The encrypted private key
  createdAt: number;
  lastAccessed?: number;
}
```

#### Key Derivation (PBKDF2)

```typescript
// Password → Encryption Key
const key = crypto.pbkdf2Sync(
  password,
  salt,           // 32 bytes random
  100000,         // 100,000 iterations (brute-force resistant)
  32,             // 256-bit key
  'sha256'
);
```

#### Memory Hygiene

```typescript
// After signing, immediately clear sensitive data
function cleanup(secretKey: Uint8Array): void {
  for (let i = 0; i < secretKey.length; i++) {
    secretKey[i] = 0;  // Zero out memory
  }
}

// Usage in signing flow
const { secretKey, cleanup } = await keyStore.retrieveKey(agentId, password);
try {
  transaction.sign([Keypair.fromSecretKey(secretKey)]);
} finally {
  cleanup();  // ALWAYS runs, even on error
}
```

### 1.4 What Agents CAN Access

| Data | Accessible | Notes |
|------|------------|-------|
| Public Key | ✅ Yes | For receiving funds, display |
| Wallet Address | ✅ Yes | Base58 encoded public key |
| Balance | ✅ Yes | Via RPC query |
| Transaction History | ✅ Yes | Via signature lookup |
| Private Key | ❌ **NO** | Never exposed |
| Secret Key Bytes | ❌ **NO** | Never exposed |
| Encrypted Key Blob | ❌ **NO** | Not directly accessible |

### 1.5 Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| Agent code reads key | API never returns private key |
| Memory dump attack | Keys zeroed immediately after use |
| File system access | Keys encrypted at rest |
| Brute force password | PBKDF2 with 100k iterations |
| Replay attack | Unique IV per encryption |
| Tampering | AES-GCM authentication tag |

---

## 2. Execution Permissions

### 2.1 Core Principle

> **Wallets only allow predefined, whitelisted actions.**

Each agent is configured with explicit permissions that define what operations they can perform.

### 2.2 Permission Levels

```typescript
enum PermissionLevel {
  READ_ONLY = 0,    // Can only read balances/state
  LIMITED = 1,      // Small transactions only
  STANDARD = 2,     // Normal operations
  ELEVATED = 3,     // Higher limits, more actions
  ADMIN = 4,        // Full access (use sparingly)
}
```

### 2.3 Action Whitelist

```typescript
type ActionType =
  | 'transfer_sol'          // Send native SOL
  | 'transfer_token'        // Send SPL tokens
  | 'create_token_account'  // Create ATA
  | 'close_account'         // Close token account
  | 'custom';               // Program-specific calls

// Agent permissions define allowed actions
const tradingPermissions: AgentPermissions = {
  level: PermissionLevel.STANDARD,
  allowedActions: ['transfer_sol', 'transfer_token'],  // Only these!
  // ... other constraints
};
```

### 2.4 Permission Enforcement Flow

```
Agent Request: execute('create_token_account', {...})
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PERMISSION CHECK 1: Is action in allowedActions?               │
│                                                                 │
│  Agent's allowedActions: ['transfer_sol', 'transfer_token']     │
│  Requested action: 'create_token_account'                       │
│                                                                 │
│  Result: ❌ BLOCKED                                             │
│  Reason: "Action not allowed: create_token_account"             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.5 Permission Matrix by Agent Type

| Agent Type | transfer_sol | transfer_token | create_token_account | close_account | custom |
|------------|--------------|----------------|----------------------|---------------|--------|
| Trading | ✅ | ✅ | ❌ | ❌ | ❌ |
| Liquidity | ✅ | ✅ | ✅ | ❌ | ❌ |
| Monitor | ❌ | ❌ | ❌ | ❌ | ❌ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |

### 2.6 Destination Whitelisting

```typescript
const permissions: AgentPermissions = {
  // ...
  allowedDestinations: [
    'Dex1111111111111111111111111111111111111111',  // DEX program
    'Pool222222222222222222222222222222222222222',  // Liquidity pool
  ],
};

// Execution engine checks
if (permissions.allowedDestinations) {
  if (!permissions.allowedDestinations.includes(destination)) {
    throw new Error('Destination not whitelisted');
  }
}
```

---

## 3. Transaction Policy Engine

### 3.1 Core Principle

> **Every transaction passes through multi-layered policy checks before execution.**

### 3.2 Policy Layers

```
Transaction Request
        │
        ▼
┌──────────────────────────┐
│ Layer 1: ACTION CHECK    │  Is this action type allowed?
└──────────────────────────┘
        │ ✅
        ▼
┌──────────────────────────┐
│ Layer 2: AMOUNT CHECK    │  Does amount exceed max per tx?
└──────────────────────────┘
        │ ✅
        ▼
┌──────────────────────────┐
│ Layer 3: VOLUME CHECK    │  Does this exceed daily limit?
└──────────────────────────┘
        │ ✅
        ▼
┌──────────────────────────┐
│ Layer 4: RATE CHECK      │  Too many transactions/minute?
└──────────────────────────┘
        │ ✅
        ▼
┌──────────────────────────┐
│ Layer 5: DESTINATION     │  Is recipient whitelisted?
└──────────────────────────┘
        │ ✅
        ▼
┌──────────────────────────┐
│ Layer 6: BALANCE CHECK   │  Sufficient funds?
└──────────────────────────┘
        │ ✅
        ▼
    EXECUTE TRANSACTION
```

### 3.3 Policy Configuration

```typescript
interface AgentPermissions {
  level: PermissionLevel;
  
  // Transaction limits
  maxTransactionAmount: number;    // Max SOL per single tx
  maxDailyVolume: number;          // Max SOL per 24 hours
  
  // Rate limiting
  rateLimit: number;               // Max transactions per minute
  
  // Action control
  allowedActions: ActionType[];    // Whitelisted action types
  allowedDestinations?: string[];  // Whitelisted recipients (optional)
  
  // Approval thresholds
  requiresApproval?: number;       // Amount requiring manual approval
}
```

### 3.4 Example Policies

#### Trading Bot (Conservative)
```typescript
{
  level: PermissionLevel.STANDARD,
  maxTransactionAmount: 0.05,    // Max 0.05 SOL per trade
  maxDailyVolume: 0.5,           // Max 0.5 SOL daily
  rateLimit: 10,                 // Max 10 tx/minute
  allowedActions: ['transfer_sol'],
  requiresApproval: 0.1,         // Amounts > 0.1 need approval
}
```

#### Liquidity Provider (Moderate)
```typescript
{
  level: PermissionLevel.ELEVATED,
  maxTransactionAmount: 0.1,     // Max 0.1 SOL per operation
  maxDailyVolume: 1.0,           // Max 1 SOL daily
  rateLimit: 20,                 // Max 20 tx/minute
  allowedActions: ['transfer_sol', 'transfer_token', 'create_token_account'],
  allowedDestinations: ['Pool1...', 'Pool2...'],  // Only approved pools
}
```

#### Monitor Agent (Read-Only)
```typescript
{
  level: PermissionLevel.READ_ONLY,
  maxTransactionAmount: 0,       // Cannot transact
  maxDailyVolume: 0,
  rateLimit: 100,                // Can query frequently
  allowedActions: [],            // No actions allowed
}
```

### 3.5 Policy Enforcement Code

```typescript
async validatePermissions(
  agentId: string,
  action: ActionType,
  amount: number = 0,
  destination?: string
): Promise<{ valid: boolean; reason?: string }> {
  const perms = this.agents.get(agentId)!.permissions;

  // Check 1: Permission level
  if (perms.level === PermissionLevel.READ_ONLY) {
    return { valid: false, reason: 'Agent is read-only' };
  }

  // Check 2: Action whitelist
  if (!perms.allowedActions.includes(action)) {
    return { valid: false, reason: `Action not allowed: ${action}` };
  }

  // Check 3: Transaction amount
  if (amount > perms.maxTransactionAmount) {
    return { 
      valid: false, 
      reason: `Amount ${amount} exceeds max ${perms.maxTransactionAmount} SOL` 
    };
  }

  // Check 4: Daily volume
  const remaining = this.getRemainingDailyAllowance(agentId);
  if (amount > remaining) {
    return { 
      valid: false, 
      reason: `Amount ${amount} exceeds daily allowance ${remaining.toFixed(4)} SOL` 
    };
  }

  // Check 5: Rate limiting
  if (!this.checkRateLimit(agentId)) {
    return { valid: false, reason: 'Rate limit exceeded' };
  }

  // Check 6: Destination whitelist
  if (destination && perms.allowedDestinations) {
    if (!perms.allowedDestinations.includes(destination)) {
      return { valid: false, reason: 'Destination not whitelisted' };
    }
  }

  return { valid: true };
}
```

### 3.6 Volume Tracking

```typescript
// Track daily usage per agent
const dailyUsage = new Map<string, { volume: number; resetTime: number }>();

function trackUsage(agentId: string, amount: number): void {
  const usage = dailyUsage.get(agentId);
  const now = Date.now();
  
  if (!usage || now > usage.resetTime) {
    // New day - reset counter
    dailyUsage.set(agentId, {
      volume: amount,
      resetTime: now + 24 * 60 * 60 * 1000,  // 24 hours
    });
  } else {
    // Add to existing volume
    usage.volume += amount;
  }
}

function getRemainingAllowance(agentId: string): number {
  const perms = agents.get(agentId).permissions;
  const usage = dailyUsage.get(agentId);
  
  if (!usage || Date.now() > usage.resetTime) {
    return perms.maxDailyVolume;  // Full allowance
  }
  
  return Math.max(0, perms.maxDailyVolume - usage.volume);
}
```

### 3.7 Rate Limiting Implementation

```typescript
// Sliding window rate limiter
const txHistory = new Map<string, number[]>();

function checkRateLimit(agentId: string): boolean {
  const perms = agents.get(agentId).permissions;
  const now = Date.now();
  const windowMs = 60 * 1000;  // 1 minute window
  
  // Get transaction timestamps in window
  let timestamps = txHistory.get(agentId) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);
  
  if (timestamps.length >= perms.rateLimit) {
    return false;  // Rate limit exceeded
  }
  
  // Record this transaction
  timestamps.push(now);
  txHistory.set(agentId, timestamps);
  return true;
}
```

---

## 4. Sandboxed Environment

### 4.1 Core Principle

> **All agent operations run in a controlled, monitored, and limited environment.**

### 4.2 Environment Constraints

```
┌─────────────────────────────────────────────────────────────────┐
│                     SANDBOXED ENVIRONMENT                       │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Network: DEVNET ONLY                                   │    │
│  │ • RPC: https://api.devnet.solana.com                   │    │
│  │ • Mainnet connections blocked                          │    │
│  │ • Test tokens only (no real value)                     │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Funds: CAPPED                                          │    │
│  │ • Max funding per agent: 0.5 SOL                       │    │
│  │ • Admin wallet cap: 5 SOL                              │    │
│  │ • Auto-pause at low balance                            │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Monitoring: FULL VISIBILITY                            │    │
│  │ • All transactions logged                              │    │
│  │ • Performance metrics tracked                          │    │
│  │ • Anomaly detection                                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Execution: ISOLATED                                    │    │
│  │ • Each agent has own wallet                            │    │
│  │ • Agent failure doesn't affect others                  │    │
│  │ • No cross-agent key access                            │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Network Isolation

```typescript
// Configuration enforces devnet
const ALLOWED_ENDPOINTS = [
  'https://api.devnet.solana.com',
  'https://devnet.helius-rpc.com',
  // Mainnet URLs NOT included
];

class NetworkGuard {
  static validateEndpoint(url: string): void {
    if (!ALLOWED_ENDPOINTS.some(allowed => url.startsWith(allowed))) {
      throw new Error('Unauthorized RPC endpoint. Devnet only.');
    }
  }
}

// Connection creation is guarded
const connection = new web3.Connection(
  NetworkGuard.validateEndpoint(rpcUrl),
  'confirmed'
);
```

### 4.4 Funding Caps

```typescript
const FUNDING_CAPS = {
  agentMaxFund: 0.5,     // SOL
  adminMaxFund: 5.0,     // SOL
  singleFundingTx: 0.2,  // Max per funding transaction
};

async function fundAgent(agentAddress: string, amount: number): Promise<void> {
  // Enforce caps
  if (amount > FUNDING_CAPS.singleFundingTx) {
    throw new Error(`Funding amount ${amount} exceeds cap ${FUNDING_CAPS.singleFundingTx}`);
  }
  
  const currentBalance = await connection.getBalance(new PublicKey(agentAddress));
  const afterFunding = currentBalance / LAMPORTS_PER_SOL + amount;
  
  if (afterFunding > FUNDING_CAPS.agentMaxFund) {
    throw new Error(`Agent would exceed max balance of ${FUNDING_CAPS.agentMaxFund} SOL`);
  }
  
  // Proceed with funding
}
```

### 4.5 Monitoring & Logging

```typescript
interface ExecutionLog {
  timestamp: number;
  agentId: string;
  action: ActionType;
  amount?: number;
  destination?: string;
  signature?: string;
  status: 'success' | 'failed' | 'blocked';
  reason?: string;
  duration: number;
}

class ExecutionMonitor {
  private logs: ExecutionLog[] = [];
  
  logExecution(entry: ExecutionLog): void {
    this.logs.push(entry);
    
    // Real-time output
    console.log(`[${entry.agentId}] ${entry.action} ${entry.status}`);
    
    // Anomaly detection
    this.checkAnomalies(entry);
  }
  
  checkAnomalies(entry: ExecutionLog): void {
    // Rapid fire transactions
    const recentTxCount = this.logs.filter(
      l => l.agentId === entry.agentId && 
           l.timestamp > Date.now() - 60000
    ).length;
    
    if (recentTxCount > 20) {
      console.warn(`⚠️ ANOMALY: ${entry.agentId} high tx frequency`);
    }
    
    // High failure rate
    const recentFailures = this.logs.filter(
      l => l.agentId === entry.agentId && 
           l.timestamp > Date.now() - 300000 &&
           l.status === 'failed'
    ).length;
    
    if (recentFailures > 5) {
      console.warn(`⚠️ ANOMALY: ${entry.agentId} high failure rate`);
    }
  }
  
  getReport(agentId?: string): object {
    const filtered = agentId 
      ? this.logs.filter(l => l.agentId === agentId)
      : this.logs;
      
    return {
      totalTransactions: filtered.length,
      successful: filtered.filter(l => l.status === 'success').length,
      failed: filtered.filter(l => l.status === 'failed').length,
      blocked: filtered.filter(l => l.status === 'blocked').length,
      totalVolume: filtered.reduce((sum, l) => sum + (l.amount || 0), 0),
      averageDuration: filtered.reduce((sum, l) => sum + l.duration, 0) / filtered.length,
    };
  }
}
```

### 4.6 Agent Isolation

```typescript
// Each agent is completely isolated
class SecureAgenticWallet {
  private readonly keyStore: SecureKeyStore;      // Own key storage
  private readonly executionEngine: ExecutionEngine;  // Own engine
  private readonly password: string;              // Own password
  
  // Agent 1 cannot access Agent 2's:
  // - Keypair
  // - Password
  // - Execution engine state
  // - Transaction history
}

// Multi-agent registry enforces isolation
class AgentRegistry {
  private agents = new Map<string, SecureAgenticWallet>();
  
  getAgent(agentId: string): SecureAgenticWallet {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return agent;  // Returns only their own wallet
  }
  
  // No method to enumerate other agents' wallets
  // No method to access another agent's credentials
}
```

---

## 5. Security Summary

### 5.1 Defense in Depth

| Layer | Protection | Implementation |
|-------|------------|----------------|
| Storage | Encrypted at rest | AES-256-GCM + PBKDF2 |
| Memory | Zeroed after use | Explicit cleanup functions |
| Access | Key never exposed | API design prevents access |
| Actions | Whitelist only | Permission configuration |
| Amounts | Per-tx and daily caps | Policy engine validation |
| Rate | Sliding window limiter | Per-minute tx count |
| Network | Devnet only | Endpoint whitelist |
| Funds | Balance caps | Funding limits |
| Monitoring | Full logging | Anomaly detection |
| Isolation | Per-agent separation | Independent wallets |

### 5.2 Attack Scenario Analysis

| Attack | Prevented By | Outcome |
|--------|--------------|---------|
| Agent reads private key | API never returns it | ❌ Blocked |
| Agent drains wallet | Per-tx and daily limits | ❌ Blocked |
| Agent spams network | Rate limiting | ❌ Blocked |
| Agent sends to attacker | Destination whitelist | ❌ Blocked |
| Memory dump for keys | Immediate zeroing | ❌ Mitigated |
| Brute force password | PBKDF2 100k iterations | ❌ Infeasible |
| Cross-agent access | Isolation architecture | ❌ Blocked |
| Mainnet drain | Network endpoint guard | ❌ Blocked |

### 5.3 Compliance Checkpoints

- ✅ No raw key exposure to application layer
- ✅ Encryption at rest (AES-256-GCM)
- ✅ Memory hygiene (zeroing)
- ✅ Principle of least privilege
- ✅ Action whitelisting
- ✅ Transaction limits
- ✅ Rate limiting
- ✅ Full audit logging
- ✅ Network isolation (devnet)
- ✅ Agent isolation

---

## 6. Files & Code References

| Component | File | Purpose |
|-----------|------|---------|
| Encrypted Key Storage | `src/security/SecureKeyStore.ts` | AES-256-GCM encryption |
| Execution Engine | `src/security/ExecutionEngine.ts` | Policy enforcement |
| Secure Wallet | `src/security/SecureAgenticWallet.ts` | Unified interface |
| Secure Demo | `src/scripts/secureWalletDemo.ts` | Feature demonstration |
| Multi-Agent Sim | `src/scripts/multiAgentSimulation.ts` | 3-agent test harness |

---

*This security architecture ensures AI agents can operate autonomously while maintaining strong protection against both intentional attacks and accidental misuse.*

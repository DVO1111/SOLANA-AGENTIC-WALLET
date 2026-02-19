# Quick Start Guide

Get your agentic wallet up and running in 5 minutes!

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## 1. Create Your First Wallet

```bash
npm run dev
```

This will create a wallet and output its address.

## 2. Fund Your Wallet on Devnet

```bash
# Copy your wallet address from step 1
npm run devnet:airdrop YOUR_WALLET_ADDRESS

# Verify funding
npm run devnet:check YOUR_WALLET_ADDRESS
```

## 3. Run the Interactive CLI

```bash
npm run cli
```

**CLI Options:**
1. Create new admin wallet
2. Register a trading agent
3. Register a liquidity provider agent
4. View all agents
5. Run simulation round
6. Fund agents with SOL
7. Print simulation report
8. Exit

## 4. Create a Trading Agent Programmatically

```typescript
import { Agent } from './agents/Agent';
import { AgenticWallet } from './wallet/AgenticWallet';
import { TokenManager } from './wallet/TokenManager';
import * as web3 from '@solana/web3.js';

const connection = new web3.Connection('https://api.devnet.solana.com');

// Create agent wallet
const wallet = AgenticWallet.create(connection);
const tokenManager = new TokenManager(wallet, connection);

// Create trading agent
const agent = new Agent({
  id: 'trader-1',
  name: 'My Trading Bot',
  strategy: 'trading',
  maxTransactionSize: 1,
  autoApprove: true,
}, wallet, tokenManager);

// Make a transfer decision
const decision = {
  type: 'transfer',
  targetAddress: 'GrKvW1twiXuwmDYvvMmMHrH8VWf5Q7S3C4q9gxJc9Ky',
  amount: 0.1,
  timestamp: Date.now(),
};

// Agent evaluates and executes
const executed = await agent.evaluateDecision(decision);
console.log(`Transaction executed: ${executed}`);
```

## 5. Run Multi-Agent Simulation

```bash
npm run agent-simulation
```

This runs:
- Creates 3 agents with different strategies
- Funds them with SOL
- Runs 5 simulation rounds
- Prints performance report

## 6. Build for Production

```bash
npm run build
npm run lint
npm test
```

## Project Structure

```
src/
├── wallet/
│   ├── AgenticWallet.ts      # Core wallet class
│   └── TokenManager.ts       # SPL token operations
├── agents/
│   ├── Agent.ts              # Individual agent
│   └── simulation.ts         # Multi-agent harness
├── scripts/
│   ├── airdrop.ts           # Request devnet SOL
│   └── checkBalance.ts      # Check wallet balance
├── cli.ts                    # Interactive CLI
└── index.ts                  # Entry point
```

## Common Commands

```bash
# Development
npm run dev              # Run main script
npm run cli              # Interactive interface
npm run build            # Compile TypeScript
npm run lint             # Check code style
npm run test             # Run tests

# Devnet utilities
npm run devnet:airdrop   # Request SOL
npm run devnet:check     # Check balance

# Agent simulation
npm run agent-simulation # Multi-agent test
```

## Key Concepts

### Agent Strategies

- **Trading**: Execute trades based on market conditions
- **Liquidity Provider**: Manage pool liquidity automatically
- **Arbitrage**: Exploit price differences across markets
- **Custom**: Your own logic

### Decision Types

- `transfer`: Send SOL or tokens
- `swap`: Exchange tokens on DEX
- `stake`: Stake SOL with validators
- `harvest`: Claim protocol rewards
- `custom`: Custom instructions

### Constraints

All agents operate within limits:
- `maxTransactionSize`: Max SOL per transaction
- `autoApprove`: Automatically execute approved decisions
- Strategy-specific configurations

## Environment Variables

Create a `.env` file:

```
SOLANA_RPC_DEVNET=https://api.devnet.solana.com
WALLET_ADDRESS=<your-wallet-address>
AGENT_MAX_TRANSACTION_SIZE=1
```

## Troubleshooting

### "Insufficient funds" error
```bash
npm run devnet:airdrop YOUR_ADDRESS
```

### "Connection timeout" error
- Check your internet connection
- Try alternative RPC endpoint in `.env`

### Build errors
```bash
npm run lint    # Check for syntax errors
npm run build   # Recompile
```

## Next Steps

1. **Integrate your AI model**: Connect your decision engine
2. **Deploy agents**: Run multiple agents simultaneously
3. **Monitor performance**: Track metrics and optimize
4. **Scale up**: Move from devnet to mainnet

## Resources

- [README.md](./README.md) - Full documentation
- [SKILLS.md](./SKILLS.md) - Agent capabilities reference
- [DEEP_DIVE.md](./DEEP_DIVE.md) - Technical deep dive
- [Solana Docs](https://docs.solana.com)

## Support

- Check existing issues: `github search solana-agentic-wallet`
- Create new issue with details
- Review test files for usage examples

---

**Ready to build autonomous AI agents? Let's go! 🚀**

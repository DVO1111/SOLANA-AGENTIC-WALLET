import * as web3 from '@solana/web3.js';
import * as readline from 'readline';
import { AgenticWallet } from './wallet/AgenticWallet';
import { TokenManager } from './wallet/TokenManager';
import { MultiAgentTestHarness } from './agents/simulation';

require('dotenv').config();

const DEVNET_RPC = 'https://api.devnet.solana.com';

class AgenticWalletCLI {
  private connection: web3.Connection;
  private harness: MultiAgentTestHarness;
  private adminWallet: AgenticWallet | null = null;
  private rl: readline.Interface;

  constructor() {
    this.connection = new web3.Connection(DEVNET_RPC, 'confirmed');
    this.harness = new MultiAgentTestHarness(this.connection);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start(): Promise<void> {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   Solana Agentic Wallet - Multi-Agent CLI      ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    this.showMenu();
  }

  private showMenu(): void {
    console.log('Options:');
    console.log('1. Create new admin wallet');
    console.log('2. Load admin wallet from file');
    console.log('3. Register trading agent');
    console.log('4. Register liquidity provider agent');
    console.log('5. View all agents');
    console.log('6. Run simulation round');
    console.log('7. Fund agents with SOL');
    console.log('8. Print simulation report');
    console.log('9. Exit');
    console.log('');

    this.rl.question('Select option (1-9): ', (answer) => {
      this.handleMenuSelection(answer.trim());
    });
  }

  private async handleMenuSelection(option: string): Promise<void> {
    switch (option) {
      case '1':
        await this.createAdminWallet();
        break;
      case '2':
        await this.loadAdminWallet();
        break;
      case '3':
        await this.registerTradingAgent();
        break;
      case '4':
        await this.registerLiquidityAgent();
        break;
      case '5':
        this.viewAgents();
        break;
      case '6':
        await this.runRound();
        break;
      case '7':
        await this.fundAgents();
        break;
      case '8':
        await this.printReport();
        break;
      case '9':
        this.rl.close();
        console.log('Goodbye!');
        return;
      default:
        console.log('Invalid option');
    }

    this.showMenu();
  }

  private async createAdminWallet(): Promise<void> {
    console.log('\nCreating new admin wallet...');
    this.adminWallet = AgenticWallet.create(this.connection);
    console.log(`Admin wallet created: ${this.adminWallet.getAddress()}`);

    this.rl.question(
      'Save wallet to file? (y/n): ',
      (answer) => {
        if (answer.toLowerCase() === 'y') {
          this.rl.question('Enter file path: ', (filePath) => {
            this.adminWallet!.saveToFile(filePath);
          });
        }
      }
    );
  }

  private async loadAdminWallet(): Promise<void> {
    this.rl.question('Enter wallet file path: ', (filePath) => {
      try {
        this.adminWallet = AgenticWallet.fromFile(filePath, this.connection);
        console.log(
          `\nWallet loaded: ${this.adminWallet.getAddress()}`
        );
        const balance = this.adminWallet.getBalance();
        console.log(`Balance: ${balance} SOL`);
      } catch (error) {
        console.error('Failed to load wallet:', error);
      }
    });
  }

  private async registerTradingAgent(): Promise<void> {
    const agentId = `agent-trading-${Date.now()}`;
    const agent = await this.harness.registerAgent({
      id: agentId,
      name: `Trading Agent ${Date.now()}`,
      strategy: 'trading',
      maxTransactionSize: 1,
      autoApprove: true,
    });

    console.log(`\nTrading agent registered!`);
    console.log(`Agent ID: ${agentId}`);
    console.log(`Wallet: ${agent.getWalletAddress()}`);
  }

  private async registerLiquidityAgent(): Promise<void> {
    const agentId = `agent-lp-${Date.now()}`;
    const agent = await this.harness.registerAgent({
      id: agentId,
      name: `Liquidity Provider ${Date.now()}`,
      strategy: 'liquidity-provider',
      maxTransactionSize: 5,
      autoApprove: true,
    });

    console.log(`\nLiquidity provider agent registered!`);
    console.log(`Agent ID: ${agentId}`);
    console.log(`Wallet: ${agent.getWalletAddress()}`);
  }

  private viewAgents(): void {
    const agents = this.harness.listAgents();

    if (agents.length === 0) {
      console.log('\nNo agents registered.');
      return;
    }

    console.log(`\nTotal Agents: ${agents.length}\n`);
    for (const agent of agents) {
      const config = agent.getConfig();
      console.log(`• ${config.name} (${config.id})`);
      console.log(`  Strategy: ${config.strategy}`);
      console.log(`  Wallet: ${agent.getWalletAddress()}`);
    }
  }

  private async runRound(): Promise<void> {
    const agents = this.harness.listAgents();
    if (agents.length === 0) {
      console.log('\nNo agents to simulate. Register agents first.');
      return;
    }

    const roundNumber = Math.floor(Math.random() * 1000);
    await this.harness.runSimulationRound(roundNumber);
  }

  private async fundAgents(): Promise<void> {
    if (!this.adminWallet) {
      console.log(
        '\nNo admin wallet loaded. Create or load a wallet first.'
      );
      return;
    }

    console.log('\nFunding agents...');
    await this.harness.fundAgentsFromFaucet(this.adminWallet);
  }

  private async printReport(): Promise<void> {
    await this.harness.printReport();
  }
}

async function main() {
  const cli = new AgenticWalletCLI();
  await cli.start();
}

main().catch(console.error);

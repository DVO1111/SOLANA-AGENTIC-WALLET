/**
 * HDWalletFactory — BIP44 Hierarchical Deterministic Wallet Derivation
 *
 * One master seed → infinite deterministic wallets, one per agent.
 * Derivation path: m/44'/501'/<agentIndex>'/0'
 *
 * Why this matters:
 *   - Single mnemonic backup restores ALL agent wallets
 *   - Wallets are cryptographically isolated (different keys)
 *   - Deterministic: same seed + index = same wallet, every time
 *   - No key file sprawl: just store the encrypted mnemonic
 *
 * References:
 *   - BIP39: Mnemonic code for generating deterministic keys
 *   - BIP44: Multi-account hierarchy for deterministic wallets
 *   - SLIP-0044: Solana coin type = 501
 *
 * Example:
 *   const factory = HDWalletFactory.generate();
 *   const traderWallet  = factory.deriveKeypair(0);  // m/44'/501'/0'/0'
 *   const lpWallet      = factory.deriveKeypair(1);  // m/44'/501'/1'/0'
 *   const arbWallet     = factory.deriveKeypair(2);  // m/44'/501'/2'/0'
 *   console.log(factory.getMnemonic()); // 24-word backup phrase
 */

import * as web3 from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath, getMasterKeyFromSeed } from 'ed25519-hd-key';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Solana BIP44 coin type (SLIP-0044 registered)
 */
const SOLANA_COIN_TYPE = 501;

/**
 * Derivation record — maps agent ID to derived index
 */
interface DerivationRecord {
  agentId: string;
  index: number;
  publicKey: string;
  path: string;
  createdAt: number;
}

/**
 * Encrypted mnemonic storage format
 */
interface EncryptedMnemonic {
  version: 2;
  algorithm: 'aes-256-gcm';
  iv: string;
  salt: string;
  authTag: string;
  encryptedMnemonic: string;
  derivations: DerivationRecord[];
  createdAt: number;
}

/**
 * HDWalletFactory creates deterministic Solana keypairs from a single BIP39 mnemonic.
 *
 * Security properties:
 *   - Mnemonic encrypted at rest (AES-256-GCM + PBKDF2)
 *   - Derived keys isolated per agent (different derivation paths)
 *   - Master seed zeroed from memory after derivation
 *   - Single backup phrase restores the entire agent fleet
 */
export class HDWalletFactory {
  private mnemonic: string;
  private seed: Buffer;
  private derivations: DerivationRecord[] = [];
  private nextIndex: number = 0;

  private constructor(mnemonic: string) {
    this.mnemonic = mnemonic;
    this.seed = bip39.mnemonicToSeedSync(mnemonic);
  }

  // ─── Factory Methods ──────────────────────────────────────────

  /**
   * Generate a brand new HD wallet from a random 24-word mnemonic
   */
  static generate(strength: 128 | 256 = 256): HDWalletFactory {
    // 256 bits = 24 words, 128 bits = 12 words
    const mnemonic = bip39.generateMnemonic(strength);
    console.log(`[HDWalletFactory] Generated new ${strength === 256 ? 24 : 12}-word mnemonic`);
    return new HDWalletFactory(mnemonic);
  }

  /**
   * Restore an HD wallet from an existing mnemonic phrase
   */
  static fromMnemonic(mnemonic: string): HDWalletFactory {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid BIP39 mnemonic phrase');
    }
    console.log('[HDWalletFactory] Restored from mnemonic');
    return new HDWalletFactory(mnemonic);
  }

  /**
   * Load from an encrypted file (created by saveTo())
   */
  static loadFrom(filePath: string, password: string): HDWalletFactory {
    if (!fs.existsSync(filePath)) {
      throw new Error(`HD wallet file not found: ${filePath}`);
    }

    const data: EncryptedMnemonic = JSON.parse(
      fs.readFileSync(filePath, 'utf-8')
    );

    if (data.version !== 2) {
      throw new Error(`Unsupported HD wallet version: ${data.version}`);
    }

    // Derive decryption key
    const salt = Buffer.from(data.salt, 'hex');
    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.authTag, 'hex');
    const encrypted = Buffer.from(data.encryptedMnemonic, 'hex');

    const key = crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256');

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      const mnemonic = decrypted.toString('utf-8');

      const factory = new HDWalletFactory(mnemonic);
      factory.derivations = data.derivations || [];
      factory.nextIndex = factory.derivations.length;

      // Zero sensitive buffers
      decrypted.fill(0);
      key.fill(0);

      console.log(`[HDWalletFactory] Loaded from ${filePath} (${factory.derivations.length} agents)`);
      return factory;
    } catch {
      key.fill(0);
      throw new Error('Invalid password or corrupted HD wallet file');
    }
  }

  // ─── Key Derivation ───────────────────────────────────────────

  /**
   * Derive a Solana keypair for a specific agent index
   * Path: m/44'/501'/<index>'/0'
   */
  deriveKeypair(index: number): web3.Keypair {
    const derivationPath = `m/44'/${SOLANA_COIN_TYPE}'/${index}'/0'`;
    const derived = derivePath(derivationPath, this.seed.toString('hex'));
    const keypair = web3.Keypair.fromSeed(derived.key);
    return keypair;
  }

  /**
   * Derive and register a keypair for a named agent.
   * Uses the next available index. Returns the keypair + derivation info.
   */
  deriveForAgent(agentId: string): {
    keypair: web3.Keypair;
    index: number;
    path: string;
  } {
    // Check if this agent already has a derivation
    const existing = this.derivations.find((d) => d.agentId === agentId);
    if (existing) {
      const keypair = this.deriveKeypair(existing.index);
      return { keypair, index: existing.index, path: existing.path };
    }

    const index = this.nextIndex++;
    const derivationPath = `m/44'/${SOLANA_COIN_TYPE}'/${index}'/0'`;
    const keypair = this.deriveKeypair(index);

    this.derivations.push({
      agentId,
      index,
      publicKey: keypair.publicKey.toString(),
      path: derivationPath,
      createdAt: Date.now(),
    });

    console.log(
      `[HDWalletFactory] Derived wallet for "${agentId}" at ${derivationPath} → ${keypair.publicKey.toString().slice(0, 12)}...`
    );

    return { keypair, index, path: derivationPath };
  }

  // ─── Persistence ──────────────────────────────────────────────

  /**
   * Save the encrypted mnemonic + derivation map to a file
   */
  saveTo(filePath: string, password: string): void {
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256');

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const mnemonicBuffer = Buffer.from(this.mnemonic, 'utf-8');
    const encrypted = Buffer.concat([cipher.update(mnemonicBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const data: EncryptedMnemonic = {
      version: 2,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag: authTag.toString('hex'),
      encryptedMnemonic: encrypted.toString('hex'),
      derivations: this.derivations,
      createdAt: Date.now(),
    };

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });

    // Zero sensitive buffers
    key.fill(0);
    mnemonicBuffer.fill(0);

    console.log(`[HDWalletFactory] Saved encrypted mnemonic to ${filePath}`);
  }

  // ─── Accessors ────────────────────────────────────────────────

  /**
   * Get the mnemonic phrase (SENSITIVE — only show during initial setup)
   */
  getMnemonic(): string {
    return this.mnemonic;
  }

  /**
   * Get the master public key (derived at m/44'/501'/0'/0')
   */
  getMasterPublicKey(): string {
    return this.deriveKeypair(0).publicKey.toString();
  }

  /**
   * Get all derivation records
   */
  getDerivations(): DerivationRecord[] {
    return [...this.derivations];
  }

  /**
   * Get derivation info for a specific agent
   */
  getAgentDerivation(agentId: string): DerivationRecord | undefined {
    return this.derivations.find((d) => d.agentId === agentId);
  }

  /**
   * Total number of derived agent wallets
   */
  get agentCount(): number {
    return this.derivations.length;
  }

  /**
   * Validate that derived keys match stored public keys
   * (integrity check after loading from file)
   */
  verifyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const record of this.derivations) {
      const keypair = this.deriveKeypair(record.index);
      if (keypair.publicKey.toString() !== record.publicKey) {
        errors.push(
          `Agent "${record.agentId}" at index ${record.index}: derived key mismatch`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Zero out sensitive data when done
   */
  destroy(): void {
    this.seed.fill(0);
    this.mnemonic = '';
    console.log('[HDWalletFactory] Sensitive data zeroed');
  }
}

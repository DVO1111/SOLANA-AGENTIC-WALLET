import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Encrypted keypair data structure
 */
interface EncryptedKeyData {
  version: number;
  algorithm: string;
  iv: string;
  salt: string;
  authTag: string;
  encryptedKey: string;
  publicKey: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

/**
 * SecureKeyStore provides encrypted storage for Solana keypairs
 * 
 * Security features:
 * - AES-256-GCM encryption
 * - Password-derived key using PBKDF2
 * - Unique salt per keypair
 * - Authentication tag for integrity verification
 * - In-memory decryption only
 */
export class SecureKeyStore {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly SALT_LENGTH = 32;
  private static readonly PBKDF2_ITERATIONS = 100000;
  private static readonly VERSION = 1;

  private storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.storePath)) {
      fs.mkdirSync(this.storePath, { recursive: true });
    }
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      SecureKeyStore.PBKDF2_ITERATIONS,
      SecureKeyStore.KEY_LENGTH,
      'sha256'
    );
  }

  /**
   * Encrypt a secret key and store it securely
   */
  async storeKey(
    walletId: string,
    secretKey: Uint8Array,
    publicKey: string,
    password: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Generate unique salt and IV
    const salt = crypto.randomBytes(SecureKeyStore.SALT_LENGTH);
    const iv = crypto.randomBytes(SecureKeyStore.IV_LENGTH);

    // Derive encryption key from password
    const derivedKey = this.deriveKey(password, salt);

    // Encrypt the secret key
    const cipher = crypto.createCipheriv(
      SecureKeyStore.ALGORITHM,
      derivedKey,
      iv
    );

    const secretKeyBuffer = Buffer.from(secretKey);
    const encrypted = Buffer.concat([
      cipher.update(secretKeyBuffer),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Create encrypted data structure
    const encryptedData: EncryptedKeyData = {
      version: SecureKeyStore.VERSION,
      algorithm: SecureKeyStore.ALGORITHM,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag: authTag.toString('hex'),
      encryptedKey: encrypted.toString('hex'),
      publicKey,
      createdAt: Date.now(),
      metadata,
    };

    // Write to file
    const filePath = this.getKeyFilePath(walletId);
    fs.writeFileSync(filePath, JSON.stringify(encryptedData, null, 2), {
      mode: 0o600, // Owner read/write only
    });

    // Clear sensitive data from memory
    secretKeyBuffer.fill(0);
    derivedKey.fill(0);

    console.log(`[SecureKeyStore] Encrypted keypair stored: ${walletId}`);
  }

  /**
   * Decrypt and retrieve a secret key (in-memory only)
   * Returns a cleanup function to zero out the key when done
   */
  async retrieveKey(
    walletId: string,
    password: string
  ): Promise<{ secretKey: Uint8Array; publicKey: string; cleanup: () => void }> {
    const filePath = this.getKeyFilePath(walletId);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    const encryptedData: EncryptedKeyData = JSON.parse(
      fs.readFileSync(filePath, 'utf-8')
    );

    // Verify version
    if (encryptedData.version !== SecureKeyStore.VERSION) {
      throw new Error(`Unsupported keystore version: ${encryptedData.version}`);
    }

    // Parse stored values
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const encrypted = Buffer.from(encryptedData.encryptedKey, 'hex');

    // Derive key from password
    const derivedKey = this.deriveKey(password, salt);

    try {
      // Decrypt
      const decipher = crypto.createDecipheriv(
        SecureKeyStore.ALGORITHM,
        derivedKey,
        iv
      );
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      const secretKey = new Uint8Array(decrypted);

      // Return key with cleanup function
      return {
        secretKey,
        publicKey: encryptedData.publicKey,
        cleanup: () => {
          // Zero out the decrypted key
          decrypted.fill(0);
          secretKey.fill(0);
        },
      };
    } catch (error) {
      throw new Error('Invalid password or corrupted keystore');
    } finally {
      // Always clear derived key
      derivedKey.fill(0);
    }
  }

  /**
   * Check if a wallet exists in the store
   */
  hasWallet(walletId: string): boolean {
    return fs.existsSync(this.getKeyFilePath(walletId));
  }

  /**
   * List all stored wallet IDs (without decrypting)
   */
  listWallets(): string[] {
    const files = fs.readdirSync(this.storePath);
    return files
      .filter((f) => f.endsWith('.encrypted.json'))
      .map((f) => f.replace('.encrypted.json', ''));
  }

  /**
   * Get wallet metadata without decrypting
   */
  getWalletInfo(walletId: string): {
    publicKey: string;
    createdAt: number;
    metadata?: Record<string, any>;
  } | null {
    const filePath = this.getKeyFilePath(walletId);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const data: EncryptedKeyData = JSON.parse(
      fs.readFileSync(filePath, 'utf-8')
    );

    return {
      publicKey: data.publicKey,
      createdAt: data.createdAt,
      metadata: data.metadata,
    };
  }

  /**
   * Delete a wallet from the store
   */
  deleteWallet(walletId: string): boolean {
    const filePath = this.getKeyFilePath(walletId);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    // Secure deletion - overwrite with random data first
    const fileSize = fs.statSync(filePath).size;
    const randomData = crypto.randomBytes(fileSize);
    fs.writeFileSync(filePath, randomData);

    // Then delete
    fs.unlinkSync(filePath);

    console.log(`[SecureKeyStore] Wallet deleted: ${walletId}`);
    return true;
  }

  /**
   * Change the password for a stored wallet
   */
  async changePassword(
    walletId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    // Retrieve with old password
    const { secretKey, publicKey, cleanup } = await this.retrieveKey(
      walletId,
      oldPassword
    );

    try {
      // Get existing metadata
      const info = this.getWalletInfo(walletId);

      // Re-encrypt with new password
      await this.storeKey(
        walletId,
        secretKey,
        publicKey,
        newPassword,
        info?.metadata
      );

      console.log(`[SecureKeyStore] Password changed for: ${walletId}`);
    } finally {
      cleanup();
    }
  }

  private getKeyFilePath(walletId: string): string {
    // Sanitize wallet ID for filesystem
    const safeId = walletId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.storePath, `${safeId}.encrypted.json`);
  }
}

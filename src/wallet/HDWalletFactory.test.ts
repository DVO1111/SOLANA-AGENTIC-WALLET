import { HDWalletFactory } from './HDWalletFactory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('HDWalletFactory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-wallet-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('creates a valid 24-word mnemonic by default', () => {
      const factory = HDWalletFactory.generate();
      const words = factory.getMnemonic().split(' ');
      expect(words.length).toBe(24);
      factory.destroy();
    });

    it('creates a valid 12-word mnemonic with strength 128', () => {
      const factory = HDWalletFactory.generate(128);
      const words = factory.getMnemonic().split(' ');
      expect(words.length).toBe(12);
      factory.destroy();
    });
  });

  describe('deriveKeypair', () => {
    it('produces deterministic keypairs', () => {
      const factory = HDWalletFactory.generate();
      const kp1 = factory.deriveKeypair(0);
      const kp2 = factory.deriveKeypair(0);
      expect(kp1.publicKey.toString()).toBe(kp2.publicKey.toString());
      factory.destroy();
    });

    it('produces different keypairs for different indices', () => {
      const factory = HDWalletFactory.generate();
      const kp0 = factory.deriveKeypair(0);
      const kp1 = factory.deriveKeypair(1);
      expect(kp0.publicKey.toString()).not.toBe(kp1.publicKey.toString());
      factory.destroy();
    });
  });

  describe('deriveForAgent', () => {
    it('registers and returns keypair', () => {
      const factory = HDWalletFactory.generate();
      const { keypair, index, path: derivPath } = factory.deriveForAgent('trader');
      expect(index).toBe(0);
      expect(derivPath).toContain("m/44'/501'/0'/0'");
      expect(keypair.publicKey).toBeTruthy();
      expect(factory.agentCount).toBe(1);
      factory.destroy();
    });

    it('returns same keypair for same agent ID', () => {
      const factory = HDWalletFactory.generate();
      const first = factory.deriveForAgent('alpha');
      const second = factory.deriveForAgent('alpha');
      expect(first.keypair.publicKey.toString()).toBe(second.keypair.publicKey.toString());
      expect(first.index).toBe(second.index);
      factory.destroy();
    });

    it('derives sequential indices for different agents', () => {
      const factory = HDWalletFactory.generate();
      const a = factory.deriveForAgent('agent-a');
      const b = factory.deriveForAgent('agent-b');
      const c = factory.deriveForAgent('agent-c');
      expect(a.index).toBe(0);
      expect(b.index).toBe(1);
      expect(c.index).toBe(2);
      factory.destroy();
    });
  });

  describe('fromMnemonic', () => {
    it('restores the same keys from same mnemonic', () => {
      const factory1 = HDWalletFactory.generate();
      const mnemonic = factory1.getMnemonic();
      const key1 = factory1.deriveKeypair(0).publicKey.toString();

      const factory2 = HDWalletFactory.fromMnemonic(mnemonic);
      const key2 = factory2.deriveKeypair(0).publicKey.toString();

      expect(key1).toBe(key2);
      factory1.destroy();
      factory2.destroy();
    });

    it('rejects invalid mnemonics', () => {
      expect(() => HDWalletFactory.fromMnemonic('not a valid mnemonic phrase at all'))
        .toThrow('Invalid BIP39 mnemonic');
    });
  });

  describe('saveTo / loadFrom', () => {
    it('round-trips mnemonic + derivations through encrypted file', () => {
      const factory1 = HDWalletFactory.generate();
      const { keypair: kpA } = factory1.deriveForAgent('agent-a');
      const { keypair: kpB } = factory1.deriveForAgent('agent-b');
      const filePath = path.join(tmpDir, 'hd-wallet.encrypted.json');

      factory1.saveTo(filePath, 'test-password');
      expect(fs.existsSync(filePath)).toBe(true);

      const factory2 = HDWalletFactory.loadFrom(filePath, 'test-password');
      expect(factory2.agentCount).toBe(2);

      // Keys match
      const restored = factory2.deriveForAgent('agent-a');
      expect(restored.keypair.publicKey.toString()).toBe(kpA.publicKey.toString());

      factory1.destroy();
      factory2.destroy();
    });

    it('rejects wrong password', () => {
      const factory = HDWalletFactory.generate();
      const filePath = path.join(tmpDir, 'hd.encrypted.json');
      factory.saveTo(filePath, 'correct');
      factory.destroy();

      expect(() => HDWalletFactory.loadFrom(filePath, 'wrong'))
        .toThrow('Invalid password');
    });
  });

  describe('verifyIntegrity', () => {
    it('passes for valid derivations', () => {
      const factory = HDWalletFactory.generate();
      factory.deriveForAgent('a');
      factory.deriveForAgent('b');
      const result = factory.verifyIntegrity();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      factory.destroy();
    });
  });

  describe('destroy', () => {
    it('zeroes mnemonic', () => {
      const factory = HDWalletFactory.generate();
      factory.destroy();
      expect(factory.getMnemonic()).toBe('');
    });
  });
});

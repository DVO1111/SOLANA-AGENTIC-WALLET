import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { TokenExtensionsManager, ExtendedMintConfig, TokenExtension } from './TokenExtensionsManager';
import { AgenticWallet } from './AgenticWallet';

// ── Mocks ──────────────────────────────────────────────────────────────────────
// We mock @solana/spl-token so no real RPC calls are made.
// Each test can override individual mocked functions as needed.

jest.mock('@solana/spl-token', () => {
  const actual = jest.requireActual('@solana/spl-token');
  return {
    ...actual,
    // Keep real enums / helpers so config logic works
    ExtensionType: actual.ExtensionType,
    TOKEN_2022_PROGRAM_ID: actual.TOKEN_2022_PROGRAM_ID,
    getMintLen: actual.getMintLen,
    // Mock network-hitting functions
    getOrCreateAssociatedTokenAccount: jest.fn(),
    mintTo: jest.fn(),
    transfer: jest.fn(),
    transferChecked: jest.fn(),
    enableRequiredMemoTransfers: jest.fn(),
    disableRequiredMemoTransfers: jest.fn(),
    getMint: jest.fn(),
    getAccount: jest.fn(),
    getTransferFeeConfig: jest.fn(),
    getTransferFeeAmount: jest.fn(),
    getNonTransferable: jest.fn(),
    getMintCloseAuthority: jest.fn(),
    getMetadataPointerState: jest.fn(),
    getTokenMetadata: jest.fn(),
    // Instruction builders — return a dummy TransactionInstruction
    createInitializeTransferFeeConfigInstruction: jest.fn(() => dummyIx()),
    createInitializeMintCloseAuthorityInstruction: jest.fn(() => dummyIx()),
    createInitializeNonTransferableMintInstruction: jest.fn(() => dummyIx()),
    createInitializePermanentDelegateInstruction: jest.fn(() => dummyIx()),
    createInitializeInterestBearingMintInstruction: jest.fn(() => dummyIx()),
    createInitializeMetadataPointerInstruction: jest.fn(() => dummyIx()),
    createInitializeMint2Instruction: jest.fn(() => dummyIx()),
    createInitializeInstruction: jest.fn(() => dummyIx()),
    createUpdateFieldInstruction: jest.fn(() => dummyIx()),
  };
});

/** Helper: fake TransactionInstruction */
function dummyIx(): web3.TransactionInstruction {
  return new web3.TransactionInstruction({
    keys: [],
    programId: splToken.TOKEN_2022_PROGRAM_ID,
    data: Buffer.alloc(0),
  });
}

// ── Test-level helpers ─────────────────────────────────────────────────────────

function makeMockConnection(): web3.Connection {
  const conn = {
    getMinimumBalanceForRentExemption: jest.fn().mockResolvedValue(1_000_000),
    getLatestBlockhash: jest.fn().mockResolvedValue({
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 999,
    }),
    sendRawTransaction: jest.fn().mockResolvedValue('fakeSig123'),
    confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
    getParsedTokenAccountsByOwner: jest.fn().mockResolvedValue({ value: [] }),
  } as unknown as web3.Connection;
  return conn;
}

function makeManager(conn?: web3.Connection) {
  const connection = conn ?? makeMockConnection();
  const wallet = AgenticWallet.create(connection);
  const manager = new TokenExtensionsManager(wallet, connection);
  return { manager, wallet, connection };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TokenExtensionsManager', () => {
  afterEach(() => jest.clearAllMocks());

  // ── Construction ───────────────────────────────────────────────────────────

  test('should instantiate without errors', () => {
    const { manager } = makeManager();
    expect(manager).toBeDefined();
  });

  // ── createExtendedMint ─────────────────────────────────────────────────────

  describe('createExtendedMint', () => {
    test('should create a mint with transfer-fee extension', async () => {
      const { manager } = makeManager();
      const config: ExtendedMintConfig = {
        decimals: 6,
        transferFee: { feeBasisPoints: 250, maxFee: BigInt(1_000_000) },
      };

      const result = await manager.createExtendedMint(config);

      expect(result.extensions).toContain('transfer-fees');
      expect(result.decimals).toBe(6);
      expect(result.transactionSignature).toBe('fakeSig123');
      expect(result.mint).toBeInstanceOf(web3.PublicKey);
      expect(splToken.createInitializeTransferFeeConfigInstruction).toHaveBeenCalled();
    });

    test('should create a mint with metadata extension', async () => {
      const { manager } = makeManager();
      const config: ExtendedMintConfig = {
        metadata: {
          name: 'Agent Token',
          symbol: 'AGT',
          uri: 'https://example.com/metadata.json',
        },
      };

      const result = await manager.createExtendedMint(config);

      expect(result.extensions).toContain('metadata');
      expect(splToken.createInitializeMetadataPointerInstruction).toHaveBeenCalled();
      expect(splToken.createInitializeInstruction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Agent Token',
          symbol: 'AGT',
          uri: 'https://example.com/metadata.json',
        })
      );
    });

    test('should handle additionalMetadata fields', async () => {
      const { manager } = makeManager();
      const config: ExtendedMintConfig = {
        metadata: {
          name: 'Test',
          symbol: 'TST',
          uri: '',
          additionalMetadata: [
            ['role', 'trader'],
            ['version', '2'],
          ],
        },
      };

      const result = await manager.createExtendedMint(config);

      expect(result.extensions).toContain('metadata');
      // createUpdateFieldInstruction called once per additional field
      expect(splToken.createUpdateFieldInstruction).toHaveBeenCalledTimes(2);
      expect(splToken.createUpdateFieldInstruction).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'role', value: 'trader' })
      );
      expect(splToken.createUpdateFieldInstruction).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'version', value: '2' })
      );
    });

    test('should create a non-transferable (soulbound) mint', async () => {
      const { manager } = makeManager();
      const config: ExtendedMintConfig = { nonTransferable: true };

      const result = await manager.createExtendedMint(config);

      expect(result.extensions).toEqual(['non-transferable']);
      expect(splToken.createInitializeNonTransferableMintInstruction).toHaveBeenCalled();
    });

    test('should create a mint with mint-close-authority', async () => {
      const { manager } = makeManager();
      const config: ExtendedMintConfig = { mintCloseAuthority: true };

      const result = await manager.createExtendedMint(config);

      expect(result.extensions).toContain('mint-close-authority');
      expect(splToken.createInitializeMintCloseAuthorityInstruction).toHaveBeenCalled();
    });

    test('should create a mint with permanent delegate', async () => {
      const { manager } = makeManager();
      const delegate = web3.Keypair.generate().publicKey;
      const config: ExtendedMintConfig = { permanentDelegate: delegate };

      const result = await manager.createExtendedMint(config);

      expect(result.extensions).toContain('permanent-delegate');
      expect(splToken.createInitializePermanentDelegateInstruction).toHaveBeenCalledWith(
        expect.any(web3.PublicKey),
        delegate,
        splToken.TOKEN_2022_PROGRAM_ID
      );
    });

    test('should create a mint with interest-bearing config', async () => {
      const { manager } = makeManager();
      const config: ExtendedMintConfig = { interestRate: 500 }; // 5%

      const result = await manager.createExtendedMint(config);

      expect(result.extensions).toContain('interest-bearing');
      expect(splToken.createInitializeInterestBearingMintInstruction).toHaveBeenCalled();
    });

    test('should combine multiple extensions in one mint', async () => {
      const { manager } = makeManager();
      const config: ExtendedMintConfig = {
        decimals: 6,
        transferFee: { feeBasisPoints: 100, maxFee: BigInt(500_000) },
        mintCloseAuthority: true,
        metadata: { name: 'Multi', symbol: 'MLT', uri: '' },
      };

      const result = await manager.createExtendedMint(config);

      expect(result.extensions).toEqual(
        expect.arrayContaining(['transfer-fees', 'mint-close-authority', 'metadata'])
      );
      expect(result.extensions).toHaveLength(3);
    });

    test('should default decimals to 9', async () => {
      const { manager } = makeManager();
      const result = await manager.createExtendedMint({ nonTransferable: true });
      expect(result.decimals).toBe(9);
    });
  });

  // ── Token account operations ───────────────────────────────────────────────

  describe('createExtendedTokenAccount', () => {
    test('should create an ATA via TOKEN_2022_PROGRAM_ID', async () => {
      const fakeAta = web3.Keypair.generate().publicKey;
      (splToken.getOrCreateAssociatedTokenAccount as jest.Mock).mockResolvedValue({
        address: fakeAta,
      });

      const { manager } = makeManager();
      const mint = web3.Keypair.generate().publicKey;
      const result = await manager.createExtendedTokenAccount(mint);

      expect(result).toEqual(fakeAta);
      expect(splToken.getOrCreateAssociatedTokenAccount).toHaveBeenCalledWith(
        expect.anything(), // connection
        expect.anything(), // payer
        mint,
        expect.any(web3.PublicKey), // owner
        false,
        undefined,
        undefined,
        splToken.TOKEN_2022_PROGRAM_ID
      );
    });
  });

  // ── Mint tokens ────────────────────────────────────────────────────────────

  describe('mintExtendedTokens', () => {
    test('should mint tokens via TOKEN_2022_PROGRAM_ID', async () => {
      (splToken.mintTo as jest.Mock).mockResolvedValue('mintSig');

      const { manager } = makeManager();
      const mint = web3.Keypair.generate().publicKey;
      const dest = web3.Keypair.generate().publicKey;

      const sig = await manager.mintExtendedTokens(mint, dest, BigInt(1000));

      expect(sig).toBe('mintSig');
      expect(splToken.mintTo).toHaveBeenCalledWith(
        expect.anything(), expect.anything(),
        mint, dest, expect.any(web3.PublicKey),
        BigInt(1000), [], undefined, splToken.TOKEN_2022_PROGRAM_ID
      );
    });
  });

  // ── Transfer tokens ────────────────────────────────────────────────────────

  describe('transferExtendedTokens', () => {
    test('should use transfer() for tokens without fees', async () => {
      (splToken.transfer as jest.Mock).mockResolvedValue('xferSig');

      const { manager } = makeManager();
      const [mint, src, dst] = [0, 1, 2].map(() => web3.Keypair.generate().publicKey);

      const sig = await manager.transferExtendedTokens(mint, src, dst, BigInt(500));

      expect(sig).toBe('xferSig');
      expect(splToken.transfer).toHaveBeenCalled();
      expect(splToken.transferChecked).not.toHaveBeenCalled();
    });

    test('should use transferChecked() for tokens with transfer fees', async () => {
      (splToken.transferChecked as jest.Mock).mockResolvedValue('xferCheckedSig');
      (splToken.getMint as jest.Mock).mockResolvedValue({ decimals: 6 });

      const { manager } = makeManager();
      const [mint, src, dst] = [0, 1, 2].map(() => web3.Keypair.generate().publicKey);

      const sig = await manager.transferExtendedTokens(mint, src, dst, BigInt(500), true);

      expect(sig).toBe('xferCheckedSig');
      expect(splToken.transferChecked).toHaveBeenCalled();
      expect(splToken.transfer).not.toHaveBeenCalled();
    });
  });

  // ── Memo required ──────────────────────────────────────────────────────────

  describe('memo required', () => {
    test('enableMemoRequired should call enableRequiredMemoTransfers', async () => {
      (splToken.enableRequiredMemoTransfers as jest.Mock).mockResolvedValue('memoSig');

      const { manager } = makeManager();
      const account = web3.Keypair.generate().publicKey;
      const sig = await manager.enableMemoRequired(account);

      expect(sig).toBe('memoSig');
      expect(splToken.enableRequiredMemoTransfers).toHaveBeenCalled();
    });

    test('disableMemoRequired should call disableRequiredMemoTransfers', async () => {
      (splToken.disableRequiredMemoTransfers as jest.Mock).mockResolvedValue('disableSig');

      const { manager } = makeManager();
      const account = web3.Keypair.generate().publicKey;
      const sig = await manager.disableMemoRequired(account);

      expect(sig).toBe('disableSig');
      expect(splToken.disableRequiredMemoTransfers).toHaveBeenCalled();
    });
  });

  // ── Query helpers ──────────────────────────────────────────────────────────

  describe('getTransferFeeConfig', () => {
    test('should return fee config when present', async () => {
      const authority = web3.Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({});
      (splToken.getTransferFeeConfig as jest.Mock).mockReturnValue({
        newerTransferFee: { transferFeeBasisPoints: 250, maximumFee: BigInt(1_000_000) },
        transferFeeConfigAuthority: authority,
        withdrawWithheldAuthority: authority,
      });

      const { manager } = makeManager();
      const result = await manager.getTransferFeeConfig(web3.Keypair.generate().publicKey);

      expect(result).not.toBeNull();
      expect(result!.feeBasisPoints).toBe(250);
      expect(result!.maxFee).toBe(BigInt(1_000_000));
    });

    test('should return null when no fee config', async () => {
      (splToken.getMint as jest.Mock).mockResolvedValue({});
      (splToken.getTransferFeeConfig as jest.Mock).mockReturnValue(null);

      const { manager } = makeManager();
      const result = await manager.getTransferFeeConfig(web3.Keypair.generate().publicKey);
      expect(result).toBeNull();
    });
  });

  describe('getTokenMetadata', () => {
    test('should return metadata when present', async () => {
      (splToken.getTokenMetadata as jest.Mock).mockResolvedValue({
        name: 'Agent Token',
        symbol: 'AGT',
        uri: 'https://example.com',
        additionalMetadata: [['role', 'trader']],
      });

      const { manager } = makeManager();
      const result = await manager.getTokenMetadata(web3.Keypair.generate().publicKey);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Agent Token');
      expect(result!.additionalMetadata).toEqual([['role', 'trader']]);
    });

    test('should return null on error', async () => {
      (splToken.getTokenMetadata as jest.Mock).mockRejectedValue(new Error('not found'));

      const { manager } = makeManager();
      const result = await manager.getTokenMetadata(web3.Keypair.generate().publicKey);
      expect(result).toBeNull();
    });
  });

  describe('getWithheldFees', () => {
    test('should return withheld amount', async () => {
      (splToken.getAccount as jest.Mock).mockResolvedValue({});
      (splToken.getTransferFeeAmount as jest.Mock).mockReturnValue({
        withheldAmount: BigInt(5000),
      });

      const { manager } = makeManager();
      const result = await manager.getWithheldFees(web3.Keypair.generate().publicKey);
      expect(result).toBe(BigInt(5000));
    });

    test('should return 0n when no fee amount', async () => {
      (splToken.getAccount as jest.Mock).mockResolvedValue({});
      (splToken.getTransferFeeAmount as jest.Mock).mockReturnValue(null);

      const { manager } = makeManager();
      const result = await manager.getWithheldFees(web3.Keypair.generate().publicKey);
      expect(result).toBe(0n);
    });
  });

  describe('getMintExtensions', () => {
    test('should detect active extensions on a mint', async () => {
      (splToken.getMint as jest.Mock).mockResolvedValue({});
      (splToken.getTransferFeeConfig as jest.Mock).mockReturnValue({});
      (splToken.getNonTransferable as jest.Mock).mockReturnValue(null);
      (splToken.getMintCloseAuthority as jest.Mock).mockReturnValue({});
      (splToken.getMetadataPointerState as jest.Mock).mockReturnValue(null);

      const { manager } = makeManager();
      const exts = await manager.getMintExtensions(web3.Keypair.generate().publicKey);

      expect(exts).toContain('transfer-fees');
      expect(exts).toContain('mint-close-authority');
      expect(exts).not.toContain('non-transferable');
      expect(exts).not.toContain('metadata');
    });
  });

  describe('getExtendedTokenBalance', () => {
    test('should return the account amount', async () => {
      (splToken.getAccount as jest.Mock).mockResolvedValue({ amount: BigInt(42_000) });

      const { manager } = makeManager();
      const bal = await manager.getExtendedTokenBalance(web3.Keypair.generate().publicKey);
      expect(bal).toBe(BigInt(42_000));
    });
  });

  describe('getExtendedTokenAccounts', () => {
    test('should return parsed token accounts', async () => {
      const { manager, connection } = makeManager();
      const result = await manager.getExtendedTokenAccounts();
      expect(result).toEqual([]);
      expect(connection.getParsedTokenAccountsByOwner).toHaveBeenCalled();
    });
  });
});

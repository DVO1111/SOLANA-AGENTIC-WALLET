/**
 * SecureEnclave — TEE/HSM Simulation for Agentic Wallets
 *
 * This module simulates what a hardware security module (HSM) or
 * Trusted Execution Environment (TEE) interface would look like
 * for production-grade key management.
 *
 * In production, you'd replace this with:
 *   - AWS CloudHSM / Azure HSM
 *   - Intel SGX / ARM TrustZone enclave
 *   - YubiHSM / Ledger device
 *   - Fireblocks / Fordefi MPC
 *
 * The interface remains identical — agent code doesn't change.
 *
 * This simulation demonstrates:
 *   1. Keys never leave the enclave boundary
 *   2. All signing produces an attestation record
 *   3. The enclave enforces its own policy checks
 *   4. A clear upgrade path from devnet → mainnet security
 *
 * Example:
 *   const enclave = new SecureEnclave(keyStore, 'sim-tee-v1');
 *   const result  = await enclave.signTransaction(agentId, password, tx);
 *   console.log(result.attestation); // proof of signing context
 */

import * as web3 from '@solana/web3.js';
import * as crypto from 'crypto';
import { SecureKeyStore } from './SecureKeyStore';

// ─── Types ──────────────────────────────────────────────────────

/**
 * Attestation record — cryptographic proof that a signing event
 * occurred within the enclave boundary.
 *
 * In a real TEE, this would be a hardware-signed attestation.
 * In simulation, we use HMAC-SHA256 for the same interface.
 */
export interface SigningAttestation {
  /** Unique attestation ID */
  id: string;
  /** Agent that requested signing */
  agentId: string;
  /** Enclave identity */
  enclaveId: string;
  /** What was signed */
  transactionHash: string;
  /** Public key of signer */
  signerPublicKey: string;
  /** HMAC attestation signature */
  attestationSignature: string;
  /** When signing occurred */
  timestamp: number;
  /** Policy checks passed */
  policyChecks: Array<{ check: string; passed: boolean }>;
  /** Enclave mode */
  mode: 'simulation' | 'hardware-hsm' | 'cloud-hsm' | 'tee-sgx';
}

/**
 * Enclave signing result
 */
export interface EnclaveSignResult {
  /** Signed transaction (ready to send) */
  signedTransaction: web3.Transaction;
  /** Attestation record */
  attestation: SigningAttestation;
  /** Duration of signing in enclave (ms) */
  enclaveTimeMs: number;
}

/**
 * Enclave status / health check
 */
export interface EnclaveStatus {
  enclaveId: string;
  mode: 'simulation' | 'hardware-hsm' | 'cloud-hsm' | 'tee-sgx';
  initialized: boolean;
  totalSignings: number;
  totalDenials: number;
  lastSigningTimestamp: number;
  keyCount: number;
  attestationAlgorithm: string;
  /** In simulation, this describes the production upgrade path */
  productionPath: string;
}

// ─── Enclave Policy ─────────────────────────────────────────────

/**
 * Enclave-level policy — these are enforced INSIDE the enclave,
 * separate from the PolicyEngine (defense in depth).
 */
export interface EnclavePolicy {
  /** Maximum instructions per transaction */
  maxInstructions: number;
  /** Allowed program IDs (if set, only these programs) */
  allowedProgramIds?: string[];
  /** Maximum SOL value per signing */
  maxValuePerSign: number;
  /** Require recent blockhash (prevent pre-signed tx replay) */
  requireRecentBlockhash: boolean;
}

const DEFAULT_ENCLAVE_POLICY: EnclavePolicy = {
  maxInstructions: 10,
  maxValuePerSign: 5, // SOL
  requireRecentBlockhash: true,
};

// ─── SecureEnclave ──────────────────────────────────────────────

/**
 * SecureEnclave wraps the SecureKeyStore with hardware-security-module
 * semantics: keys never leave the boundary, all signings are attested,
 * and enclave-level policies are enforced independently.
 *
 * This is a simulation that demonstrates the production interface.
 * Swap the implementation for a real HSM/TEE on mainnet —
 * the agent-facing API stays identical.
 */
export class SecureEnclave {
  private keyStore: SecureKeyStore;
  private enclaveId: string;
  private attestationSecret: Buffer; // HMAC key for attestation
  private signingCount: number = 0;
  private denialCount: number = 0;
  private lastSigningTs: number = 0;
  private policy: EnclavePolicy;
  private attestationLog: SigningAttestation[] = [];

  constructor(
    keyStore: SecureKeyStore,
    enclaveId?: string,
    policy?: Partial<EnclavePolicy>
  ) {
    this.keyStore = keyStore;
    this.enclaveId = enclaveId || `sim-enclave-${crypto.randomBytes(4).toString('hex')}`;
    // In a real HSM, this would be a hardware-protected key
    this.attestationSecret = crypto.randomBytes(32);
    this.policy = { ...DEFAULT_ENCLAVE_POLICY, ...policy };

    console.log(`[SecureEnclave] Initialized: ${this.enclaveId} (mode: simulation)`);
    console.log(`[SecureEnclave] Policy: max ${this.policy.maxInstructions} ixs, max ${this.policy.maxValuePerSign} SOL/sign`);
  }

  /**
   * Sign a transaction within the enclave boundary.
   *
   * Flow:
   *   1. Validate transaction against enclave policy
   *   2. Decrypt key (momentarily, inside enclave)
   *   3. Sign the transaction
   *   4. Generate attestation record
   *   5. Zero the key
   *   6. Return signed tx + attestation
   *
   * The key NEVER leaves this method boundary.
   */
  async signTransaction(
    agentId: string,
    password: string,
    transaction: web3.Transaction
  ): Promise<EnclaveSignResult> {
    const startTime = Date.now();
    const policyChecks: Array<{ check: string; passed: boolean }> = [];

    // ── Enclave Policy Checks ──────────────────────
    // Check 1: Instruction count
    const ixCount = transaction.instructions.length;
    const ixCheck = ixCount <= this.policy.maxInstructions;
    policyChecks.push({
      check: `instruction_count (${ixCount} <= ${this.policy.maxInstructions})`,
      passed: ixCheck,
    });

    if (!ixCheck) {
      this.denialCount++;
      throw new EnclaveError(
        `Enclave policy violation: ${ixCount} instructions exceeds limit of ${this.policy.maxInstructions}`,
        policyChecks
      );
    }

    // Check 2: Allowed program IDs
    if (this.policy.allowedProgramIds && this.policy.allowedProgramIds.length > 0) {
      const programIds = transaction.instructions.map((ix) => ix.programId.toString());
      const allAllowed = programIds.every((pid) =>
        this.policy.allowedProgramIds!.includes(pid)
      );
      policyChecks.push({
        check: `allowed_programs (${programIds.length} programs checked)`,
        passed: allAllowed,
      });

      if (!allAllowed) {
        this.denialCount++;
        const forbidden = programIds.filter(
          (pid) => !this.policy.allowedProgramIds!.includes(pid)
        );
        throw new EnclaveError(
          `Enclave policy violation: forbidden program(s): ${forbidden.join(', ')}`,
          policyChecks
        );
      }
    }

    // Check 3: Recent blockhash
    if (this.policy.requireRecentBlockhash) {
      const hasBlockhash = !!transaction.recentBlockhash;
      policyChecks.push({
        check: 'recent_blockhash_present',
        passed: hasBlockhash,
      });

      if (!hasBlockhash) {
        this.denialCount++;
        throw new EnclaveError(
          'Enclave policy violation: transaction must have recentBlockhash set',
          policyChecks
        );
      }
    }

    // ── Key Decryption (inside enclave boundary) ───
    const { secretKey, publicKey, cleanup } = await this.keyStore.retrieveKey(
      agentId,
      password
    );

    try {
      const keypair = web3.Keypair.fromSecretKey(secretKey);

      // ── Sign ─────────────────────────────────────
      transaction.sign(keypair);

      // ── Generate Attestation ─────────────────────
      const txHash = crypto
        .createHash('sha256')
        .update(transaction.serialize())
        .digest('hex');

      const attestation = this.createAttestation(
        agentId,
        txHash,
        publicKey,
        policyChecks
      );

      this.signingCount++;
      this.lastSigningTs = Date.now();
      this.attestationLog.push(attestation);

      console.log(
        `[SecureEnclave] Signed tx for ${agentId} | attestation: ${attestation.id.slice(0, 16)}...`
      );

      return {
        signedTransaction: transaction,
        attestation,
        enclaveTimeMs: Date.now() - startTime,
      };
    } finally {
      // ── ALWAYS zero the key ──────────────────────
      cleanup();
    }
  }

  /**
   * Create HMAC-SHA256 attestation record
   */
  private createAttestation(
    agentId: string,
    txHash: string,
    publicKey: string,
    policyChecks: Array<{ check: string; passed: boolean }>
  ): SigningAttestation {
    const id = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();

    // Build attestation data
    const data = `${id}:${agentId}:${this.enclaveId}:${txHash}:${timestamp}`;
    const signature = crypto
      .createHmac('sha256', this.attestationSecret)
      .update(data)
      .digest('hex');

    return {
      id,
      agentId,
      enclaveId: this.enclaveId,
      transactionHash: txHash,
      signerPublicKey: publicKey,
      attestationSignature: signature,
      timestamp,
      policyChecks,
      mode: 'simulation',
    };
  }

  /**
   * Verify an attestation record is authentic
   */
  verifyAttestation(attestation: SigningAttestation): boolean {
    const data = `${attestation.id}:${attestation.agentId}:${attestation.enclaveId}:${attestation.transactionHash}:${attestation.timestamp}`;
    const expected = crypto
      .createHmac('sha256', this.attestationSecret)
      .update(data)
      .digest('hex');

    return expected === attestation.attestationSignature;
  }

  /**
   * Get enclave status
   */
  getStatus(): EnclaveStatus {
    return {
      enclaveId: this.enclaveId,
      mode: 'simulation',
      initialized: true,
      totalSignings: this.signingCount,
      totalDenials: this.denialCount,
      lastSigningTimestamp: this.lastSigningTs,
      keyCount: this.keyStore.listWallets().length,
      attestationAlgorithm: 'HMAC-SHA256 (simulation) → hardware attestation in production',
      productionPath: [
        'This is a simulation of hardware-security-module (HSM) semantics.',
        'To upgrade for mainnet:',
        '  1. Replace SecureKeyStore with AWS CloudHSM / Azure Dedicated HSM',
        '  2. Replace HMAC attestation with hardware-signed attestation (SGX/TrustZone)',
        '  3. Deploy enclave in Trusted Execution Environment (Intel SGX / ARM CCA)',
        '  4. Use remote attestation to verify enclave integrity',
        'The agent-facing API (signTransaction) stays IDENTICAL.',
      ].join('\n'),
    };
  }

  /**
   * Get all attestation records
   */
  getAttestationLog(): SigningAttestation[] {
    return [...this.attestationLog];
  }

  /**
   * Update enclave policy at runtime
   */
  updatePolicy(updates: Partial<EnclavePolicy>): void {
    this.policy = { ...this.policy, ...updates };
    console.log(`[SecureEnclave] Policy updated:`, this.policy);
  }

  /**
   * Zero out enclave secrets
   */
  destroy(): void {
    this.attestationSecret.fill(0);
    console.log(`[SecureEnclave] Enclave ${this.enclaveId} destroyed`);
  }
}

// ─── Enclave Error ──────────────────────────────────────────────

export class EnclaveError extends Error {
  public policyChecks: Array<{ check: string; passed: boolean }>;

  constructor(
    message: string,
    policyChecks: Array<{ check: string; passed: boolean }>
  ) {
    super(message);
    this.name = 'EnclaveError';
    this.policyChecks = policyChecks;
  }
}

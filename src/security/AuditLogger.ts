import * as fs from 'fs';
import * as path from 'path';

/**
 * Audit event types covering the full execution lifecycle
 */
export type AuditEvent =
  | 'permission_check'
  | 'rate_limit_check'
  | 'volume_check'
  | 'execution_start'
  | 'execution_success'
  | 'execution_failure'
  | 'wallet_created'
  | 'wallet_loaded'
  | 'agent_registered'
  | 'simulation'
  | 'swap'
  | 'error';

/**
 * Audit verdict for check events
 */
export type AuditVerdict = 'allowed' | 'denied' | 'success' | 'failed' | 'info';

/**
 * A single audit log entry
 */
export interface AuditEntry {
  timestamp: string;       // ISO 8601
  epochMs: number;         // Unix millis for fast sorting
  agentId: string;
  event: AuditEvent;
  action?: string;         // ActionType or free-form
  verdict: AuditVerdict;
  details: Record<string, unknown>;
}

/**
 * Filter options for querying the audit log
 */
export interface AuditFilter {
  agentId?: string;
  event?: AuditEvent;
  verdict?: AuditVerdict;
  since?: number;          // epoch ms
  until?: number;          // epoch ms
  limit?: number;
}

/**
 * AuditLogger — Persistent, append-only audit trail for agent operations
 *
 * Writes JSON Lines (JSONL) format: one JSON object per line, appended
 * synchronously to guarantee no data loss on crash. Every permission
 * check, rate-limit check, volume check, and execution result flows
 * through this logger.
 *
 * Usage:
 *   const logger = new AuditLogger('./logs/audit.jsonl');
 *   logger.log({ agentId: 'trader-1', event: 'execution_success', ... });
 *   const entries = logger.query({ agentId: 'trader-1', limit: 50 });
 */
export class AuditLogger {
  private logPath: string;
  private fd: number | null = null;

  constructor(logPath: string) {
    this.logPath = path.resolve(logPath);

    // Ensure parent directory exists
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open file in append mode
    this.fd = fs.openSync(this.logPath, 'a');
  }

  /**
   * Append a single audit entry (synchronous for reliability)
   */
  log(entry: Omit<AuditEntry, 'timestamp' | 'epochMs'>): void {
    const now = Date.now();
    const full: AuditEntry = {
      timestamp: new Date(now).toISOString(),
      epochMs: now,
      ...entry,
    };

    const line = JSON.stringify(full) + '\n';

    if (this.fd !== null) {
      fs.writeSync(this.fd, line);
    } else {
      // Fallback: reopen file
      fs.appendFileSync(this.logPath, line, 'utf-8');
    }
  }

  // ── Convenience logging methods ──────────────────────────────

  logPermissionCheck(
    agentId: string,
    action: string,
    allowed: boolean,
    reason?: string
  ): void {
    this.log({
      agentId,
      event: 'permission_check',
      action,
      verdict: allowed ? 'allowed' : 'denied',
      details: reason ? { reason } : {},
    });
  }

  logRateLimitCheck(
    agentId: string,
    allowed: boolean,
    currentRate?: number,
    limit?: number
  ): void {
    this.log({
      agentId,
      event: 'rate_limit_check',
      verdict: allowed ? 'allowed' : 'denied',
      details: { currentRate, limit },
    });
  }

  logVolumeCheck(
    agentId: string,
    allowed: boolean,
    currentVolume?: number,
    maxVolume?: number,
    txAmount?: number
  ): void {
    this.log({
      agentId,
      event: 'volume_check',
      verdict: allowed ? 'allowed' : 'denied',
      details: { currentVolume, maxVolume, txAmount },
    });
  }

  logExecution(
    agentId: string,
    action: string,
    success: boolean,
    details: Record<string, unknown> = {}
  ): void {
    this.log({
      agentId,
      event: success ? 'execution_success' : 'execution_failure',
      action,
      verdict: success ? 'success' : 'failed',
      details,
    });
  }

  logAgentRegistered(agentId: string, permissions: Record<string, unknown>): void {
    this.log({
      agentId,
      event: 'agent_registered',
      verdict: 'info',
      details: permissions,
    });
  }

  logSwap(
    agentId: string,
    success: boolean,
    details: Record<string, unknown> = {}
  ): void {
    this.log({
      agentId,
      event: 'swap',
      action: 'swap',
      verdict: success ? 'success' : 'failed',
      details,
    });
  }

  logError(agentId: string, error: string, context?: Record<string, unknown>): void {
    this.log({
      agentId,
      event: 'error',
      verdict: 'failed',
      details: { error, ...context },
    });
  }

  // ── Query / Read ─────────────────────────────────────────────

  /**
   * Read all entries from the log file
   */
  readAll(): AuditEntry[] {
    if (!fs.existsSync(this.logPath)) return [];

    const content = fs.readFileSync(this.logPath, 'utf-8').trim();
    if (!content) return [];

    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is AuditEntry => e !== null);
  }

  /**
   * Query the audit log with filters
   */
  query(filter: AuditFilter = {}): AuditEntry[] {
    let entries = this.readAll();

    if (filter.agentId) {
      entries = entries.filter((e) => e.agentId === filter.agentId);
    }
    if (filter.event) {
      entries = entries.filter((e) => e.event === filter.event);
    }
    if (filter.verdict) {
      entries = entries.filter((e) => e.verdict === filter.verdict);
    }
    if (filter.since) {
      entries = entries.filter((e) => e.epochMs >= filter.since!);
    }
    if (filter.until) {
      entries = entries.filter((e) => e.epochMs <= filter.until!);
    }

    // Return most recent first
    entries.sort((a, b) => b.epochMs - a.epochMs);

    if (filter.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  /**
   * Get a summary of audit activity
   */
  summary(agentId?: string): {
    totalEntries: number;
    byEvent: Record<string, number>;
    byVerdict: Record<string, number>;
    deniedActions: number;
    successfulExecutions: number;
    failedExecutions: number;
    firstEntry?: string;
    lastEntry?: string;
  } {
    const entries = agentId
      ? this.query({ agentId })
      : this.readAll();

    const byEvent: Record<string, number> = {};
    const byVerdict: Record<string, number> = {};

    for (const entry of entries) {
      byEvent[entry.event] = (byEvent[entry.event] || 0) + 1;
      byVerdict[entry.verdict] = (byVerdict[entry.verdict] || 0) + 1;
    }

    return {
      totalEntries: entries.length,
      byEvent,
      byVerdict,
      deniedActions: byVerdict['denied'] || 0,
      successfulExecutions: byEvent['execution_success'] || 0,
      failedExecutions: byEvent['execution_failure'] || 0,
      firstEntry: entries.length > 0 ? entries[entries.length - 1].timestamp : undefined,
      lastEntry: entries.length > 0 ? entries[0].timestamp : undefined,
    };
  }

  /**
   * Get the file path of the audit log
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Get file size in bytes
   */
  getLogSize(): number {
    try {
      const stats = fs.statSync(this.logPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Close the file descriptor
   */
  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }
}

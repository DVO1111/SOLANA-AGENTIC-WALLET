import { useState, useEffect, Fragment } from 'react'
import { securityApi } from '../api'
import {
  IconShield, IconRefresh, IconLock, IconShieldCheck,
  IconClock, IconBarChart, IconZap, IconFlask,
  IconChevronDown, IconCopy, IconCheck,
} from '../Icons'

interface LogEntry {
  timestamp: string
  action: string
  agent?: string
  status: 'success' | 'failed' | 'blocked'
  details: string
}

interface SecurityStats {
  total: number
  success: number
  failed: number
  blocked: number
}

export default function Security() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<SecurityStats>({ total: 0, success: 0, failed: 0, blocked: 0 })
  const [filter, setFilter] = useState<string>('all')
  const [expandedLog, setExpandedLog] = useState<number | null>(null)
  const [copiedText, setCopiedText] = useState<string | null>(null)

  function copyText(text: string) {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 1500)
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [logsData, statsData] = await Promise.all([
        securityApi.getLogs(),
        securityApi.getStats(),
      ])
      setLogs(logsData)
      setStats(statsData)
    } catch {}
  }

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter((l) => l.status === filter)

  const statusBadge = (status: string) => {
    switch (status) {
      case 'success': return 'badge-success'
      case 'failed': return 'badge-danger'
      case 'blocked': return 'badge-warning'
      default: return 'badge-neutral'
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Security & Audit</h2>
        <p>Execution logs, permission enforcement, and rate limiting</p>
      </div>

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon violet"><IconShield size={18} /></div>
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><IconShieldCheck size={18} /></div>
          <div className="stat-label">Successful</div>
          <div className="stat-value">{stats.success}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--danger-muted)', color: 'var(--danger)' }}>
            <IconZap size={18} />
          </div>
          <div className="stat-label">Failed</div>
          <div className="stat-value">{stats.failed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><IconLock size={18} /></div>
          <div className="stat-label">Blocked</div>
          <div className="stat-value">{stats.blocked}</div>
        </div>
      </div>

      {/* ── Architecture ───────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Security Architecture</h3>
        </div>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon violet"><IconLock size={18} /></div>
            <h4>AES-256-GCM Encryption</h4>
            <p>Private keys encrypted at rest with PBKDF2 key derivation</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon blue"><IconShieldCheck size={18} /></div>
            <h4>Permission Scoping</h4>
            <p>Per-agent permissions: transfer, swap, stake, custom actions</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon amber"><IconClock size={18} /></div>
            <h4>Rate Limiting</h4>
            <p>Configurable transactions per minute per agent</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon green"><IconBarChart size={18} /></div>
            <h4>Volume Tracking</h4>
            <p>Daily volume caps with automatic reset</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon red"><IconZap size={18} /></div>
            <h4>Circuit Breaker</h4>
            <p>Auto-disable agents after consecutive failures</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon violet"><IconFlask size={18} /></div>
            <h4>Tx Simulation</h4>
            <p>Dry-run via simulateTransaction before spending SOL</p>
          </div>
        </div>
      </div>

      {/* ── Execution Log ──────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Execution Log <span className="badge badge-neutral">{filteredLogs.length}</span></h3>
          <div className="btn-group">
            <button className="btn btn-sm btn-secondary" onClick={loadData}>
              <IconRefresh size={13} /> Refresh
            </button>
            {['all', 'success', 'failed', 'blocked'].map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><IconShield size={24} /></div>
            <p>{logs.length === 0
              ? 'No events recorded. Interact with the wallet to generate logs.'
              : 'No events match this filter.'
            }</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Agent</th>
                  <th style={{ width: 0 }}></th>
                </tr>
              </thead>
              <tbody>
                {[...filteredLogs].reverse().map((log, i) => {
                  const isExpanded = expandedLog === i
                  return (
                    <Fragment key={i}>
                      <tr
                        className={`row-clickable ${isExpanded ? 'row-selected' : ''}`}
                        onClick={() => setExpandedLog(isExpanded ? null : i)}
                        style={{ animationDelay: `${i * 20}ms` }}
                      >
                        <td className="font-mono" style={{ opacity: 0.4 }}>{i + 1}</td>
                        <td className="font-mono text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="font-bold text-sm">{log.action}</td>
                        <td>
                          <span className={`badge ${statusBadge(log.status)}`}>{log.status}</span>
                          <span className={`row-status-dot ${log.status === 'success' ? 'status-success' : log.status === 'blocked' ? 'status-warning' : 'status-danger'}`} />
                        </td>
                        <td>
                          {log.agent ? (
                            <span className="address-cell">
                              <span className="address-short">{log.agent.slice(0, 12)}...</span>
                              <button
                                className={`copy-btn ${copiedText === log.agent ? 'copied' : ''}`}
                                onClick={(e) => { e.stopPropagation(); copyText(log.agent!) }}
                                title="Copy agent ID"
                              >
                                {copiedText === log.agent ? <IconCheck size={12} /> : <IconCopy size={12} />}
                              </button>
                            </span>
                          ) : (
                            <span className="text-tertiary">—</span>
                          )}
                        </td>
                        <td>
                          <span className="row-actions">
                            <IconChevronDown
                              size={14}
                              style={{
                                transition: 'transform 0.2s ease',
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                opacity: 0.5,
                              }}
                            />
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="row-detail-row">
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="row-detail">
                              <div className="detail-grid">
                                <div>
                                  <span className="detail-label">Timestamp</span>
                                  <span className="detail-value font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                                </div>
                                <div>
                                  <span className="detail-label">Action</span>
                                  <span className="detail-value font-bold">{log.action}</span>
                                </div>
                                <div>
                                  <span className="detail-label">Status</span>
                                  <span className="detail-value">
                                    <span className={`badge ${statusBadge(log.status)}`}>{log.status}</span>
                                  </span>
                                </div>
                                <div>
                                  <span className="detail-label">Agent</span>
                                  <span className="detail-value font-mono" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                                    {log.agent || '—'}
                                  </span>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <span className="detail-label">Details</span>
                                  <span className="detail-value" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                    {log.details}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { securityApi } from '../api'

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
      default: return 'badge-info'
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Security & Audit</h2>
        <p>Execution logs, permission enforcement, and rate limiting overview</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Successful</div>
          <div className="stat-value accent">{stats.success}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.failed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Blocked</div>
          <div className="stat-value warning">{stats.blocked}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Security Architecture</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <SecurityFeature
            icon="🔐"
            title="AES-256-GCM Encryption"
            desc="Private keys encrypted at rest with PBKDF2 key derivation"
          />
          <SecurityFeature
            icon="🛡️"
            title="Permission Scoping"
            desc="Per-agent permissions: transfer, swap, stake, custom actions"
          />
          <SecurityFeature
            icon="⏱️"
            title="Rate Limiting"
            desc="Configurable transactions per minute per agent"
          />
          <SecurityFeature
            icon="📊"
            title="Volume Tracking"
            desc="Daily volume caps with automatic reset"
          />
          <SecurityFeature
            icon="🔄"
            title="Circuit Breaker"
            desc="Auto-disable after consecutive failures"
          />
          <SecurityFeature
            icon="🧪"
            title="Tx Simulation"
            desc="Dry-run transactions via simulateTransaction before spending SOL"
          />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Execution Log ({filteredLogs.length})</h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn btn-sm btn-secondary" onClick={loadData}>↻ Refresh</button>
            {['all', 'success', 'failed', 'blocked'].map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📋</div>
            <p>{logs.length === 0
              ? 'No events recorded yet. Interact with the wallet to generate logs.'
              : 'No events match this filter.'
            }</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Agent</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredLogs].reverse().map((log, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '13px' }}>{log.action}</td>
                    <td>
                      <span className={`badge ${statusBadge(log.status)}`}>{log.status}</span>
                    </td>
                    <td>
                      {log.agent ? (
                        <span className="address-short">{log.agent.slice(0, 16)}...</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SecurityFeature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '14px',
    }}>
      <div style={{ fontSize: '20px', marginBottom: '6px' }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{title}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{desc}</div>
    </div>
  )
}

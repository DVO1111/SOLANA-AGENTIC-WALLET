import { useState, useEffect, Fragment } from 'react'
import { agentApi, simulationApi } from '../api'
import { useScrollReveal } from '../useScrollReveal'
import { IconCpu, IconPlay, IconRefresh, IconDroplet, IconPlus, IconTrendingUp, IconCheck, IconX, IconCopy, IconChevronDown, IconExternalLink } from '../Icons'

interface AgentInfo {
  id: string
  name: string
  strategy: string
  walletAddress: string
  balance: number
  stats: {
    totalDecisions: number
    successfulTxns: number
    failedTxns: number
    totalVolume: number
  }
}

interface SimResult {
  round: number
  results: Array<{
    agentId: string
    name: string
    strategy: string
    totalDecisions: number
    successfulTxns: number
    failedTxns: number
    totalVolume: number
  }>
}

export default function Agents() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [status, setStatus] = useState<{ type: string; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [simResults, setSimResults] = useState<SimResult | null>(null)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    strategy: 'trading',
    maxTransactionSize: '1',
  })

  useEffect(() => { refreshAgents() }, [])

  async function refreshAgents() {
    try {
      const list = await agentApi.list()
      setAgents(list)
    } catch {}
  }

  async function registerAgent() {
    if (!form.name) {
      setStatus({ type: 'error', msg: 'Agent name is required' })
      return
    }
    setLoading(true)
    setStatus({ type: 'loading', msg: 'Registering agent...' })
    try {
      const result = await agentApi.register(
        form.name,
        form.strategy,
        parseFloat(form.maxTransactionSize)
      )
      setStatus({ type: 'success', msg: `Agent "${result.name}" registered — Wallet: ${result.walletAddress.slice(0, 16)}...` })
      setForm({ name: '', strategy: 'trading', maxTransactionSize: '1' })
      await refreshAgents()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
    setLoading(false)
  }

  async function fundAgent(id: string) {
    setStatus({ type: 'loading', msg: 'Funding agent...' })
    try {
      const result = await agentApi.fund(id)
      setStatus({ type: 'success', msg: `Funded — Balance: ${result.balance.toFixed(4)} SOL` })
      await refreshAgents()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
  }

  async function runSimulation() {
    setLoading(true)
    setStatus({ type: 'loading', msg: 'Running simulation round...' })
    try {
      const result = await simulationApi.run()
      setSimResults(result)
      setStatus({ type: 'success', msg: `Round #${result.round} complete — ${result.results.length} agents` })
      await refreshAgents()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
    setLoading(false)
  }

  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr)
    setCopiedAddr(addr)
    setTimeout(() => setCopiedAddr(null), 1500)
  }

  function toggleAgent(id: string) {
    setExpandedAgent(expandedAgent === id ? null : id)
  }

  const strategyBadge = (s: string) => {
    switch (s) {
      case 'trading': return 'badge-info'
      case 'liquidity-provider': return 'badge-purple'
      case 'arbitrage': return 'badge-warning'
      default: return 'badge-neutral'
    }
  }

  const scrollRef = useScrollReveal<HTMLDivElement>()

  return (
    <div ref={scrollRef}>
      <div className="page-header" data-scroll="blur-up">
        <h2>AI Agents</h2>
        <p>Register autonomous agents and run multi-agent simulations</p>
      </div>

      {status && (
        <div className={`status-message status-${status.type}`}>
          {status.type === 'loading' && <span className="spinner" />}
          {status.msg}
        </div>
      )}

      {/* ── Register ───────────────────────────────────────── */}
      <div className="card" data-scroll="fade-up">
        <div className="card-header">
          <div>
            <h3>Register Agent</h3>
            <span className="card-subtitle">Configure an autonomous trading agent</span>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Agent Name</label>
            <input
              className="form-input"
              placeholder="e.g. Alpha Trader"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Strategy</label>
            <select
              className="form-select"
              value={form.strategy}
              onChange={(e) => setForm({ ...form, strategy: e.target.value })}
            >
              <option value="trading">Trading</option>
              <option value="liquidity-provider">Liquidity Provider</option>
              <option value="arbitrage">Arbitrage</option>
            </select>
          </div>
        </div>
        <div className="form-group" style={{ maxWidth: 200 }}>
          <label>Max Transaction (SOL)</label>
          <input
            className="form-input"
            type="number"
            step="0.1"
            min="0.01"
            value={form.maxTransactionSize}
            onChange={(e) => setForm({ ...form, maxTransactionSize: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" onClick={registerAgent} disabled={loading}>
          <IconPlus size={15} /> Register Agent
        </button>
      </div>

      {/* ── Agent List ─────────────────────────────────────── */}
      {agents.length > 0 && (
        <>
          <div className="card" data-scroll="lift">
            <div className="card-header">
              <h3>Active Agents <span className="badge badge-neutral">{agents.length}</span></h3>
              <div className="btn-group">
                <button className="btn btn-sm btn-secondary" onClick={refreshAgents}>
                  <IconRefresh size={13} /> Refresh
                </button>
                <button className="btn btn-sm btn-primary" onClick={runSimulation} disabled={loading}>
                  {loading
                    ? <><span className="spinner" /> Running...</>
                    : <><IconPlay size={13} /> Run Simulation</>
                  }
                </button>
              </div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Name</th>
                    <th>Strategy</th>
                    <th>Wallet</th>
                    <th>Balance</th>
                    <th>Success Rate</th>
                    <th style={{ width: 0 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent, i) => {
                    const total = agent.stats.successfulTxns + agent.stats.failedTxns
                    const rate = total > 0 ? agent.stats.successfulTxns / total : 0
                    const isExpanded = expandedAgent === agent.id
                    return (
                      <Fragment key={agent.id}>
                        <tr
                          className={`row-clickable ${isExpanded ? 'row-selected' : ''}`}
                          onClick={() => toggleAgent(agent.id)}
                          style={{ animationDelay: `${i * 20}ms` }}
                        >
                          <td className="font-mono" style={{ opacity: 0.4 }}>{i + 1}</td>
                          <td className="font-bold">{agent.name}</td>
                          <td>
                            <span className={`badge ${strategyBadge(agent.strategy)}`}>
                              {agent.strategy}
                            </span>
                          </td>
                          <td>
                            <span className="address-cell">
                              <span className="address-short">
                                {agent.walletAddress.slice(0, 6)}...{agent.walletAddress.slice(-4)}
                              </span>
                              <button
                                className={`copy-btn ${copiedAddr === agent.walletAddress ? 'copied' : ''}`}
                                onClick={(e) => { e.stopPropagation(); copyAddress(agent.walletAddress) }}
                                title="Copy address"
                              >
                                {copiedAddr === agent.walletAddress ? <IconCheck size={12} /> : <IconCopy size={12} />}
                              </button>
                            </span>
                          </td>
                          <td>
                            <span className="font-mono">{agent.balance.toFixed(4)}</span>
                            <span className={`row-status-dot ${agent.balance > 0 ? 'status-success' : 'status-warning'}`} />
                          </td>
                          <td>
                            <div className="row-progress">
                              <div className="row-progress-fill" style={{ width: `${rate * 100}%` }} />
                            </div>
                            <span className="font-mono" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                              {total > 0 ? `${(rate * 100).toFixed(0)}%` : '—'}
                            </span>
                          </td>
                          <td>
                            <span className="row-actions">
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={(e) => { e.stopPropagation(); fundAgent(agent.id) }}
                              >
                                <IconDroplet size={13} /> Fund
                              </button>
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
                            <td colSpan={7} style={{ padding: 0 }}>
                              <div className="row-detail">
                                <div className="detail-grid">
                                  <div>
                                    <span className="detail-label">Full Wallet Address</span>
                                    <span className="detail-value font-mono" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                                      {agent.walletAddress}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="detail-label">Balance</span>
                                    <span className="detail-value font-mono">{agent.balance.toFixed(9)} SOL</span>
                                  </div>
                                  <div>
                                    <span className="detail-label">Strategy</span>
                                    <span className="detail-value">{agent.strategy}</span>
                                  </div>
                                  <div>
                                    <span className="detail-label">Total Decisions</span>
                                    <span className="detail-value font-mono">{agent.stats.totalDecisions}</span>
                                  </div>
                                  <div>
                                    <span className="detail-label">Successful</span>
                                    <span className="detail-value text-success font-mono">{agent.stats.successfulTxns}</span>
                                  </div>
                                  <div>
                                    <span className="detail-label">Failed</span>
                                    <span className="detail-value text-danger font-mono">{agent.stats.failedTxns}</span>
                                  </div>
                                  <div>
                                    <span className="detail-label">Total Volume</span>
                                    <span className="detail-value font-mono">{agent.stats.totalVolume.toFixed(4)} SOL</span>
                                  </div>
                                  <div>
                                    <span className="detail-label">Explorer</span>
                                    <a
                                      className="detail-value"
                                      href={`https://explorer.solana.com/address/${agent.walletAddress}?cluster=devnet`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    >
                                      View on Solana Explorer <IconExternalLink size={12} />
                                    </a>
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
          </div>

          {/* ── Simulation Results ──────────────────────────── */}
          {simResults && (
            <div className="card" data-scroll="scale-up">
              <div className="card-header">
                <h3>Round #{simResults.round} Results</h3>
              </div>
              <div className="result-grid">
                {simResults.results.map((r) => (
                  <div className="result-card" key={r.agentId}>
                    <h4>{r.name}</h4>
                    <div className="result-row">
                      <span className="result-label">Decisions</span>
                      <span className="result-value">{r.totalDecisions}</span>
                    </div>
                    <div className="result-row">
                      <span className="result-label">Volume</span>
                      <span className="result-value">{r.totalVolume.toFixed(4)}</span>
                    </div>
                    <div className="result-row">
                      <span className="result-label">Success</span>
                      <span className="result-value text-success">{r.successfulTxns}</span>
                    </div>
                    <div className="result-row">
                      <span className="result-label">Failed</span>
                      <span className="result-value text-danger">{r.failedTxns}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Empty ──────────────────────────────────────────── */}
      {agents.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><IconCpu size={24} /></div>
          <p>No agents registered. Create your first autonomous agent.</p>
        </div>
      )}
    </div>
  )
}

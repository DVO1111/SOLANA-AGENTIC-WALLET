import { useState, useEffect } from 'react'
import { agentApi, simulationApi } from '../api'

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
      setStatus({ type: 'success', msg: `Agent "${result.name}" registered! Wallet: ${result.walletAddress.slice(0, 12)}...` })
      setForm({ name: '', strategy: 'trading', maxTransactionSize: '1' })
      await refreshAgents()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
    setLoading(false)
  }

  async function fundAgent(id: string) {
    setStatus({ type: 'loading', msg: `Funding agent ${id.slice(0, 16)}...` })
    try {
      const result = await agentApi.fund(id)
      setStatus({ type: 'success', msg: `Funded! Balance: ${result.balance.toFixed(4)} SOL` })
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
      setStatus({ type: 'success', msg: `Round #${result.round} complete with ${result.results.length} agents` })
      await refreshAgents()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
    setLoading(false)
  }

  const strategyColor = (s: string) => {
    switch (s) {
      case 'trading': return 'badge-info'
      case 'liquidity-provider': return 'badge-purple'
      case 'arbitrage': return 'badge-warning'
      default: return 'badge-info'
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>AI Agents</h2>
        <p>Register autonomous agents and run multi-agent simulations</p>
      </div>

      {status && (
        <div className={`status-message status-${status.type}`}>
          {status.type === 'loading' && <span className="spinner" />}
          {status.msg}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Register New Agent</h3>
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
        <div className="form-group" style={{ maxWidth: '200px' }}>
          <label>Max Transaction Size (SOL)</label>
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
          🤖 Register Agent
        </button>
      </div>

      {agents.length > 0 && (
        <>
          <div className="card">
            <div className="card-header">
              <h3>Active Agents ({agents.length})</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-sm btn-secondary" onClick={refreshAgents}>
                  ↻ Refresh
                </button>
                <button className="btn btn-sm btn-primary" onClick={runSimulation} disabled={loading}>
                  {loading ? <><span className="spinner" /> Running...</> : '▶ Run Simulation'}
                </button>
              </div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Strategy</th>
                    <th>Wallet</th>
                    <th>Balance</th>
                    <th>Decisions</th>
                    <th>Success</th>
                    <th>Failed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.id}>
                      <td style={{ fontWeight: 600 }}>{agent.name}</td>
                      <td>
                        <span className={`badge ${strategyColor(agent.strategy)}`}>
                          {agent.strategy}
                        </span>
                      </td>
                      <td>
                        <span className="address-short">
                          {agent.walletAddress.slice(0, 6)}...{agent.walletAddress.slice(-4)}
                        </span>
                      </td>
                      <td>{agent.balance.toFixed(4)}</td>
                      <td>{agent.stats.totalDecisions}</td>
                      <td>
                        <span className="badge badge-success">{agent.stats.successfulTxns}</span>
                      </td>
                      <td>
                        <span className="badge badge-danger">{agent.stats.failedTxns}</span>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => fundAgent(agent.id)}>
                          💧 Fund
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {simResults && (
            <div className="card">
              <div className="card-header">
                <h3>Simulation Round #{simResults.round}</h3>
              </div>
              <div className="stat-grid">
                {simResults.results.map((r) => (
                  <div className="stat-card" key={r.agentId}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>{r.name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Decisions:</span>{' '}
                        <span style={{ fontWeight: 600 }}>{r.totalDecisions}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Volume:</span>{' '}
                        <span style={{ fontWeight: 600 }}>{r.totalVolume.toFixed(4)}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--success)' }}>✓ {r.successfulTxns}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--danger)' }}>✗ {r.failedTxns}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {agents.length === 0 && (
        <div className="empty-state">
          <div className="icon">🤖</div>
          <p>No agents registered yet. Create your first autonomous agent!</p>
        </div>
      )}
    </div>
  )
}

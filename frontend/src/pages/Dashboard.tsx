import { useState, useEffect } from 'react'
import { walletApi, agentApi, securityApi } from '../api'

interface DashboardProps {
  onNavigate: (page: 'wallets' | 'agents' | 'tokens' | 'security') => void
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState({
    wallets: 0,
    agents: 0,
    totalBalance: 0,
    securityEvents: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const [walletList, agentList, secStats] = await Promise.all([
        walletApi.list().catch(() => []),
        agentApi.list().catch(() => []),
        securityApi.getStats().catch(() => ({ total: 0 })),
      ])

      let totalBalance = 0
      for (const w of walletList) {
        try {
          const b = await walletApi.getBalance(w.address)
          totalBalance += b.balance
        } catch {}
      }

      setStats({
        wallets: walletList.length,
        agents: agentList.length,
        totalBalance,
        securityEvents: secStats.total || 0,
      })
    } catch {}
    setLoading(false)
  }

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Solana Agentic Wallet — AI-powered autonomous wallet infrastructure</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card" onClick={() => onNavigate('wallets')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Wallets</div>
          <div className="stat-value accent">{loading ? '—' : stats.wallets}</div>
        </div>
        <div className="stat-card" onClick={() => onNavigate('agents')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">AI Agents</div>
          <div className="stat-value purple">{loading ? '—' : stats.agents}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Balance (SOL)</div>
          <div className="stat-value blue">{loading ? '—' : stats.totalBalance.toFixed(4)}</div>
        </div>
        <div className="stat-card" onClick={() => onNavigate('security')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Security Events</div>
          <div className="stat-value warning">{loading ? '—' : stats.securityEvents}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Quick Actions</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => onNavigate('wallets')}>
            👛 Create Wallet
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('agents')}>
            🤖 Register Agent
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('tokens')}>
            🪙 Create Token
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('security')}>
            🔒 View Logs
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Architecture Overview</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <FeatureCard
            icon="🔑"
            title="Wallet Management"
            desc="Create, fund, and manage Solana wallets with full keypair control"
          />
          <FeatureCard
            icon="🤖"
            title="Autonomous Agents"
            desc="AI agents with rule-based scoring, strategy engines, and circuit breakers"
          />
          <FeatureCard
            icon="🪙"
            title="Token-2022 Extensions"
            desc="Transfer fees, soulbound tokens, on-chain metadata, memo-required"
          />
          <FeatureCard
            icon="🔒"
            title="Security Engine"
            desc="Permission scoping, rate limiting, volume caps, encrypted key storage"
          />
          <FeatureCard
            icon="📡"
            title="Devnet Integration"
            desc="Live Solana devnet connectivity with real transaction signing"
          />
          <FeatureCard
            icon="🧪"
            title="Simulation"
            desc="Multi-agent test harness with autonomous decision-making rounds"
          />
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '16px',
    }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{desc}</div>
    </div>
  )
}

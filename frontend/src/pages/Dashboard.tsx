import { useState, useEffect } from 'react'
import { walletApi, agentApi, securityApi } from '../api'
import { useScrollReveal } from '../useScrollReveal'
import {
  IconWallet, IconCpu, IconLayers, IconShield,
  IconPlus, IconArrowRight, IconHexagon,
  IconKey, IconZap, IconRadio, IconGlobe, IconFlask, IconBarChart,
} from '../Icons'

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

  const scrollRef = useScrollReveal<HTMLDivElement>()

  return (
    <div ref={scrollRef}>
      <div className="page-header" data-scroll="blur-up">
        <h2>Dashboard</h2>
        <p>AI-powered autonomous wallet infrastructure on Solana</p>
      </div>

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className="stat-grid">
        <div className="stat-card clickable" data-scroll="scale-up" data-scroll-stagger onClick={() => onNavigate('wallets')}>
          <div className="stat-icon violet"><IconWallet size={18} /></div>
          <div className="stat-label">Wallets</div>
          <div className="stat-value">{loading ? '–' : stats.wallets}</div>
        </div>
        <div className="stat-card clickable" data-scroll="scale-up" data-scroll-stagger onClick={() => onNavigate('agents')}>
          <div className="stat-icon blue"><IconCpu size={18} /></div>
          <div className="stat-label">AI Agents</div>
          <div className="stat-value">{loading ? '–' : stats.agents}</div>
        </div>
        <div className="stat-card" data-scroll="scale-up" data-scroll-stagger>
          <div className="stat-icon green"><IconLayers size={18} /></div>
          <div className="stat-label">Total Balance</div>
          <div className="stat-value">{loading ? '–' : `${stats.totalBalance.toFixed(2)}`}</div>
        </div>
        <div className="stat-card clickable" data-scroll="scale-up" data-scroll-stagger onClick={() => onNavigate('security')}>
          <div className="stat-icon amber"><IconShield size={18} /></div>
          <div className="stat-label">Security Events</div>
          <div className="stat-value">{loading ? '–' : stats.securityEvents}</div>
        </div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────── */}
      <div className="section-label" data-scroll="fade-up">Quick Actions</div>
      <div className="action-grid" data-scroll="fade-up" style={{ marginBottom: 28 }}>
        <button className="action-card" onClick={() => onNavigate('wallets')}>
          <div className="action-icon" style={{ background: 'var(--accent-muted)', color: 'var(--accent-text)' }}>
            <IconPlus size={18} />
          </div>
          Create Wallet
        </button>
        <button className="action-card" onClick={() => onNavigate('agents')}>
          <div className="action-icon" style={{ background: 'var(--info-muted)', color: 'var(--info)' }}>
            <IconCpu size={18} />
          </div>
          Register Agent
        </button>
        <button className="action-card" onClick={() => onNavigate('tokens')}>
          <div className="action-icon" style={{ background: 'var(--warning-muted)', color: 'var(--warning)' }}>
            <IconHexagon size={18} />
          </div>
          Create Token
        </button>
        <button className="action-card" onClick={() => onNavigate('security')}>
          <div className="action-icon" style={{ background: 'var(--success-muted)', color: 'var(--success)' }}>
            <IconBarChart size={18} />
          </div>
          View Logs
        </button>
      </div>

      {/* ── Architecture ───────────────────────────────────── */}
      <div className="section-label" data-scroll="fade-up">Architecture</div>
      <div className="feature-grid">
        <div className="feature-card" data-scroll="scale-in" data-scroll-stagger>
          <div className="feature-icon violet"><IconKey size={18} /></div>
          <h4>Wallet Management</h4>
          <p>Create, fund, and manage Solana wallets with full keypair control and balance tracking</p>
        </div>
        <div className="feature-card" data-scroll="scale-in" data-scroll-stagger>
          <div className="feature-icon blue"><IconCpu size={18} /></div>
          <h4>Autonomous Agents</h4>
          <p>AI agents with rule-based scoring, strategy engines, and automatic circuit breakers</p>
        </div>
        <div className="feature-card" data-scroll="scale-in" data-scroll-stagger>
          <div className="feature-icon amber"><IconHexagon size={18} /></div>
          <h4>Token-2022 Extensions</h4>
          <p>Transfer fees, soulbound tokens, on-chain metadata, interest-bearing mints</p>
        </div>
        <div className="feature-card" data-scroll="scale-in" data-scroll-stagger>
          <div className="feature-icon red"><IconShield size={18} /></div>
          <h4>Security Engine</h4>
          <p>Permission scoping, rate limiting, volume caps, AES-256-GCM encrypted key storage</p>
        </div>
        <div className="feature-card" data-scroll="scale-in" data-scroll-stagger>
          <div className="feature-icon green"><IconGlobe size={18} /></div>
          <h4>Devnet Integration</h4>
          <p>Live Solana devnet connectivity with real transaction signing and confirmation</p>
        </div>
        <div className="feature-card" data-scroll="scale-in" data-scroll-stagger>
          <div className="feature-icon violet"><IconFlask size={18} /></div>
          <h4>Simulation Engine</h4>
          <p>Multi-agent test harness with autonomous decision-making rounds</p>
        </div>
      </div>
    </div>
  )
}

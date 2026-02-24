import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Wallets from './pages/Wallets'
import Agents from './pages/Agents'
import Tokens from './pages/Tokens'
import Security from './pages/Security'

type Page = 'dashboard' | 'wallets' | 'agents' | 'tokens' | 'security'

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'wallets', label: 'Wallets', icon: '👛' },
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'tokens', label: 'Token Extensions', icon: '🪙' },
  { id: 'security', label: 'Security', icon: '🔒' },
]

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={setPage} />
      case 'wallets': return <Wallets />
      case 'agents': return <Agents />
      case 'tokens': return <Tokens />
      case 'security': return <Security />
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>◎ Agentic Wallet</h1>
          <p>Solana AI Wallet Infrastructure</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="network-badge">
            <span className="network-dot" />
            Devnet
          </span>
        </div>
      </aside>
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  )
}

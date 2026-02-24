import { useState } from 'react'
import { IconGrid, IconWallet, IconCpu, IconHexagon, IconShield } from './Icons'
import Dashboard from './pages/Dashboard'
import Wallets from './pages/Wallets'
import Agents from './pages/Agents'
import Tokens from './pages/Tokens'
import Security from './pages/Security'

type Page = 'dashboard' | 'wallets' | 'agents' | 'tokens' | 'security'

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard',        icon: <IconGrid size={18} /> },
  { id: 'wallets',   label: 'Wallets',           icon: <IconWallet size={18} /> },
  { id: 'agents',    label: 'Agents',             icon: <IconCpu size={18} /> },
  { id: 'tokens',    label: 'Token Extensions',   icon: <IconHexagon size={18} /> },
  { id: 'security',  label: 'Security',           icon: <IconShield size={18} /> },
]

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={setPage} />
      case 'wallets':   return <Wallets />
      case 'agents':    return <Agents />
      case 'tokens':    return <Tokens />
      case 'security':  return <Security />
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>
            <span className="brand-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            Agentic Wallet
          </h1>
          <p>Solana Infrastructure</p>
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

      <main className="main-content" key={page}>
        {renderPage()}
      </main>
    </div>
  )
}

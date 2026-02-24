import { useState, useEffect } from 'react'
import { walletApi } from '../api'
import { IconPlus, IconDroplet, IconSend, IconRefresh, IconWallet } from '../Icons'

interface WalletInfo {
  address: string
  balance: number
}

export default function Wallets() {
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: string; msg: string } | null>(null)
  const [sendForm, setSendForm] = useState({ from: '', to: '', amount: '0.01' })

  useEffect(() => { refreshWallets() }, [])

  async function refreshWallets() {
    try {
      const list = await walletApi.list()
      const withBalances = await Promise.all(
        list.map(async (w: any) => {
          try {
            const b = await walletApi.getBalance(w.address)
            return { address: w.address, balance: b.balance }
          } catch {
            return { address: w.address, balance: 0 }
          }
        })
      )
      setWallets(withBalances)
    } catch {}
  }

  async function createWallet() {
    setLoading(true)
    setStatus({ type: 'loading', msg: 'Generating keypair...' })
    try {
      const result = await walletApi.create()
      setStatus({ type: 'success', msg: `Wallet created: ${result.address}` })
      await refreshWallets()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
    setLoading(false)
  }

  async function airdrop(address: string) {
    setStatus({ type: 'loading', msg: `Requesting airdrop for ${address.slice(0, 8)}...` })
    try {
      const result = await walletApi.airdrop(address, 1)
      setStatus({ type: 'success', msg: `Airdropped 1 SOL — New balance: ${result.newBalance.toFixed(4)} SOL` })
      await refreshWallets()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
  }

  async function sendSOL() {
    if (!sendForm.from || !sendForm.to) {
      setStatus({ type: 'error', msg: 'Select both wallets' })
      return
    }
    setLoading(true)
    setStatus({ type: 'loading', msg: 'Signing transaction...' })
    try {
      const result = await walletApi.send(sendForm.from, sendForm.to, parseFloat(sendForm.amount))
      setStatus({ type: 'success', msg: `Sent ${sendForm.amount} SOL — Sig: ${result.signature.slice(0, 20)}...` })
      await refreshWallets()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="page-header">
        <h2>Wallets</h2>
        <p>Create and manage Solana wallets on devnet</p>
      </div>

      {status && (
        <div className={`status-message status-${status.type}`}>
          {status.type === 'loading' && <span className="spinner" />}
          {status.msg}
        </div>
      )}

      {/* ── Create ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Create Wallet</h3>
            <span className="card-subtitle">Generate a new Solana keypair for this session</span>
          </div>
          <button className="btn btn-primary" onClick={createWallet} disabled={loading}>
            {loading
              ? <><span className="spinner" /> Creating...</>
              : <><IconPlus size={15} /> New Wallet</>
            }
          </button>
        </div>
      </div>

      {/* ── Wallet List ────────────────────────────────────── */}
      {wallets.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Session Wallets <span className="badge badge-neutral">{wallets.length}</span></h3>
            <button className="btn btn-sm btn-secondary" onClick={refreshWallets}>
              <IconRefresh size={14} /> Refresh
            </button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Balance (SOL)</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => (
                  <tr key={w.address}>
                    <td><span className="address">{w.address}</span></td>
                    <td>
                      <span className="font-mono font-bold">{w.balance.toFixed(4)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => airdrop(w.address)}>
                        <IconDroplet size={13} /> Airdrop 1 SOL
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Send SOL ───────────────────────────────────────── */}
      {wallets.length >= 2 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Transfer SOL</h3>
              <span className="card-subtitle">Send SOL between session wallets</span>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>From</label>
              <select
                className="form-select"
                value={sendForm.from}
                onChange={(e) => setSendForm({ ...sendForm, from: e.target.value })}
              >
                <option value="">Select wallet</option>
                {wallets.map((w) => (
                  <option key={w.address} value={w.address}>
                    {w.address.slice(0, 8)}...{w.address.slice(-6)} ({w.balance.toFixed(2)} SOL)
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>To</label>
              <select
                className="form-select"
                value={sendForm.to}
                onChange={(e) => setSendForm({ ...sendForm, to: e.target.value })}
              >
                <option value="">Select destination</option>
                {wallets.filter(w => w.address !== sendForm.from).map((w) => (
                  <option key={w.address} value={w.address}>
                    {w.address.slice(0, 8)}...{w.address.slice(-6)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ maxWidth: 200 }}>
            <label>Amount (SOL)</label>
            <input
              className="form-input"
              type="number"
              step="0.001"
              min="0.001"
              value={sendForm.amount}
              onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" onClick={sendSOL} disabled={loading}>
            <IconSend size={15} /> Send
          </button>
        </div>
      )}

      {/* ── Empty ──────────────────────────────────────────── */}
      {wallets.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><IconWallet size={24} /></div>
          <p>No wallets yet. Create one to get started.</p>
          <button className="btn btn-primary" onClick={createWallet} disabled={loading}>
            <IconPlus size={15} /> Create First Wallet
          </button>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { tokenApi, walletApi } from '../api'

interface MintRecord {
  mint: string
  extensions: string[]
  decimals: number
  signature: string
  createdAt: string
}

interface WalletOption {
  address: string
}

export default function Tokens() {
  const [mints, setMints] = useState<MintRecord[]>([])
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [status, setStatus] = useState<{ type: string; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    walletAddress: '',
    decimals: '9',
    // Extensions toggles
    transferFee: false,
    feeBasisPoints: '250',
    nonTransferable: false,
    mintCloseAuthority: false,
    interestBearing: false,
    interestRate: '500',
    metadata: false,
    metaName: 'Agent Token',
    metaSymbol: 'AGT',
    metaUri: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [w, m] = await Promise.all([
        walletApi.list().catch(() => []),
        tokenApi.listMints().catch(() => []),
      ])
      setWallets(w)
      setMints(m)
      if (w.length > 0 && !form.walletAddress) {
        setForm(f => ({ ...f, walletAddress: w[0].address }))
      }
    } catch {}
  }

  async function createMint() {
    if (!form.walletAddress) {
      setStatus({ type: 'error', msg: 'Please select a wallet. Create one in the Wallets tab first.' })
      return
    }

    const hasAnyExtension = form.transferFee || form.nonTransferable || form.mintCloseAuthority || form.interestBearing || form.metadata
    if (!hasAnyExtension) {
      setStatus({ type: 'error', msg: 'Select at least one extension to create a Token-2022 mint.' })
      return
    }

    setLoading(true)
    setStatus({ type: 'loading', msg: 'Creating Token-2022 mint on devnet... (this may take a moment)' })

    try {
      const config: any = {
        decimals: parseInt(form.decimals),
      }

      if (form.transferFee) {
        config.transferFee = {
          feeBasisPoints: parseInt(form.feeBasisPoints),
          maxFee: '1000000000',
        }
      }
      if (form.nonTransferable) config.nonTransferable = true
      if (form.mintCloseAuthority) config.mintCloseAuthority = true
      if (form.interestBearing) {
        config.interestRate = parseInt(form.interestRate)
      }
      if (form.metadata) {
        config.metadata = {
          name: form.metaName,
          symbol: form.metaSymbol,
          uri: form.metaUri,
        }
      }

      const result = await tokenApi.createMint(form.walletAddress, config)
      setStatus({
        type: 'success',
        msg: `Mint created! Address: ${result.mint} | Extensions: [${result.extensions.join(', ')}]`,
      })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    }
    setLoading(false)
  }

  const extensionBadgeColor = (ext: string) => {
    switch (ext) {
      case 'transfer-fees': return 'badge-warning'
      case 'non-transferable': return 'badge-danger'
      case 'metadata': return 'badge-info'
      case 'mint-close-authority': return 'badge-purple'
      case 'interest-bearing': return 'badge-success'
      case 'memo-required': return 'badge-info'
      case 'permanent-delegate': return 'badge-danger'
      default: return 'badge-info'
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Token Extensions (Token-2022)</h2>
        <p>Create tokens with advanced extensions on Solana's Token-2022 program</p>
      </div>

      {status && (
        <div className={`status-message status-${status.type}`}>
          {status.type === 'loading' && <span className="spinner" />}
          {status.msg}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Create Extended Mint</h3>
        </div>

        {wallets.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            ⚠️ No wallets available. Go to the Wallets tab to create and fund one first.
          </p>
        ) : (
          <>
            <div className="form-row">
              <div className="form-group">
                <label>Payer Wallet</label>
                <select
                  className="form-select"
                  value={form.walletAddress}
                  onChange={(e) => setForm({ ...form, walletAddress: e.target.value })}
                >
                  {wallets.map((w) => (
                    <option key={w.address} value={w.address}>
                      {w.address.slice(0, 8)}...{w.address.slice(-6)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Decimals</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="18"
                  value={form.decimals}
                  onChange={(e) => setForm({ ...form, decimals: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Extensions</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.transferFee}
                    onChange={(e) => setForm({ ...form, transferFee: e.target.checked })} />
                  Transfer Fees
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.nonTransferable}
                    onChange={(e) => setForm({ ...form, nonTransferable: e.target.checked })} />
                  Non-Transferable (Soulbound)
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.mintCloseAuthority}
                    onChange={(e) => setForm({ ...form, mintCloseAuthority: e.target.checked })} />
                  Mint Close Authority
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.interestBearing}
                    onChange={(e) => setForm({ ...form, interestBearing: e.target.checked })} />
                  Interest-Bearing
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.metadata}
                    onChange={(e) => setForm({ ...form, metadata: e.target.checked })} />
                  On-chain Metadata
                </label>
              </div>
            </div>

            {form.transferFee && (
              <div className="form-group" style={{ maxWidth: '250px' }}>
                <label>Fee Basis Points (100 = 1%)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="10000"
                  value={form.feeBasisPoints}
                  onChange={(e) => setForm({ ...form, feeBasisPoints: e.target.value })}
                />
              </div>
            )}

            {form.interestBearing && (
              <div className="form-group" style={{ maxWidth: '250px' }}>
                <label>Interest Rate (basis points, 100 = 1%)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={form.interestRate}
                  onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                />
              </div>
            )}

            {form.metadata && (
              <div className="form-row">
                <div className="form-group">
                  <label>Token Name</label>
                  <input
                    className="form-input"
                    value={form.metaName}
                    onChange={(e) => setForm({ ...form, metaName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Symbol</label>
                  <input
                    className="form-input"
                    value={form.metaSymbol}
                    onChange={(e) => setForm({ ...form, metaSymbol: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: '12px' }}>
              <button className="btn btn-primary" onClick={createMint} disabled={loading}>
                {loading ? <><span className="spinner" /> Creating Mint...</> : '🪙 Create Token-2022 Mint'}
              </button>
            </div>
          </>
        )}
      </div>

      {mints.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Created Mints ({mints.length})</h3>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mint Address</th>
                  <th>Extensions</th>
                  <th>Decimals</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {mints.map((m) => (
                  <tr key={m.mint}>
                    <td><span className="address">{m.mint}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {m.extensions.map((ext) => (
                          <span key={ext} className={`badge ${extensionBadgeColor(ext)}`}>{ext}</span>
                        ))}
                      </div>
                    </td>
                    <td>{m.decimals}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mints.length === 0 && wallets.length > 0 && (
        <div className="empty-state">
          <div className="icon">🪙</div>
          <p>No token mints created yet. Use the form above to create one!</p>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, Fragment } from 'react'
import { tokenApi, walletApi } from '../api'
import { IconHexagon, IconPlus, IconCopy, IconCheck, IconChevronDown, IconExternalLink } from '../Icons'

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
  const [expandedMint, setExpandedMint] = useState<string | null>(null)
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null)
  const [form, setForm] = useState({
    walletAddress: '',
    decimals: '9',
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

  useEffect(() => { loadData() }, [])

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
      setStatus({ type: 'error', msg: 'Select a wallet. Create one in the Wallets tab first.' })
      return
    }
    const hasExt = form.transferFee || form.nonTransferable || form.mintCloseAuthority || form.interestBearing || form.metadata
    if (!hasExt) {
      setStatus({ type: 'error', msg: 'Enable at least one extension.' })
      return
    }
    setLoading(true)
    setStatus({ type: 'loading', msg: 'Creating Token-2022 mint on devnet...' })
    try {
      const config: any = { decimals: parseInt(form.decimals) }
      if (form.transferFee) {
        config.transferFee = { feeBasisPoints: parseInt(form.feeBasisPoints), maxFee: '1000000000' }
      }
      if (form.nonTransferable) config.nonTransferable = true
      if (form.mintCloseAuthority) config.mintCloseAuthority = true
      if (form.interestBearing) config.interestRate = parseInt(form.interestRate)
      if (form.metadata) {
        config.metadata = { name: form.metaName, symbol: form.metaSymbol, uri: form.metaUri }
      }
      const result = await tokenApi.createMint(form.walletAddress, config)
      setStatus({ type: 'success', msg: `Mint created: ${result.mint}` })
      await loadData()
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

  function toggleMint(mint: string) {
    setExpandedMint(expandedMint === mint ? null : mint)
  }

  const extBadge = (ext: string) => {
    switch (ext) {
      case 'transfer-fees': return 'badge-warning'
      case 'non-transferable': return 'badge-danger'
      case 'metadata': return 'badge-info'
      case 'mint-close-authority': return 'badge-purple'
      case 'interest-bearing': return 'badge-success'
      default: return 'badge-neutral'
    }
  }

  function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <label className={`toggle-item ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)}>
        <span className="toggle-dot" />
        <input type="checkbox" checked={checked} readOnly />
        {label}
      </label>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2>Token Extensions</h2>
        <p>Create tokens with Token-2022 extensions on Solana devnet</p>
      </div>

      {status && (
        <div className={`status-message status-${status.type}`}>
          {status.type === 'loading' && <span className="spinner" />}
          {status.msg}
        </div>
      )}

      {/* ── Create Mint ────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Create Extended Mint</h3>
            <span className="card-subtitle">Configure extensions for a new Token-2022 mint</span>
          </div>
        </div>

        {wallets.length === 0 ? (
          <p className="text-muted text-sm">No wallets available. Create and fund one in the Wallets tab first.</p>
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
              <div className="toggle-group">
                <Toggle label="Transfer Fees" checked={form.transferFee}
                  onChange={(v) => setForm({ ...form, transferFee: v })} />
                <Toggle label="Non-Transferable" checked={form.nonTransferable}
                  onChange={(v) => setForm({ ...form, nonTransferable: v })} />
                <Toggle label="Mint Close Authority" checked={form.mintCloseAuthority}
                  onChange={(v) => setForm({ ...form, mintCloseAuthority: v })} />
                <Toggle label="Interest-Bearing" checked={form.interestBearing}
                  onChange={(v) => setForm({ ...form, interestBearing: v })} />
                <Toggle label="On-chain Metadata" checked={form.metadata}
                  onChange={(v) => setForm({ ...form, metadata: v })} />
              </div>
            </div>

            {form.transferFee && (
              <div className="form-group" style={{ maxWidth: 250 }}>
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
              <div className="form-group" style={{ maxWidth: 250 }}>
                <label>Interest Rate (basis points)</label>
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

            <div className="mt-4">
              <button className="btn btn-primary" onClick={createMint} disabled={loading}>
                {loading
                  ? <><span className="spinner" /> Creating Mint...</>
                  : <><IconPlus size={15} /> Create Token-2022 Mint</>
                }
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Existing Mints ─────────────────────────────────── */}
      {mints.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Created Mints <span className="badge badge-neutral">{mints.length}</span></h3>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Mint Address</th>
                  <th>Extensions</th>
                  <th>Decimals</th>
                  <th>Created</th>
                  <th style={{ width: 0 }}></th>
                </tr>
              </thead>
              <tbody>
                {mints.map((m, i) => {
                  const isExpanded = expandedMint === m.mint
                  return (
                    <Fragment key={m.mint}>
                      <tr
                        className={`row-clickable ${isExpanded ? 'row-selected' : ''}`}
                        onClick={() => toggleMint(m.mint)}
                        style={{ animationDelay: `${i * 20}ms` }}
                      >
                        <td className="font-mono" style={{ opacity: 0.4 }}>{i + 1}</td>
                        <td>
                          <span className="address-cell">
                            <span className="address-short">
                              {m.mint.slice(0, 8)}...{m.mint.slice(-6)}
                            </span>
                            <button
                              className={`copy-btn ${copiedAddr === m.mint ? 'copied' : ''}`}
                              onClick={(e) => { e.stopPropagation(); copyAddress(m.mint) }}
                              title="Copy mint address"
                            >
                              {copiedAddr === m.mint ? <IconCheck size={12} /> : <IconCopy size={12} />}
                            </button>
                          </span>
                        </td>
                        <td>
                          <div className="btn-group">
                            {m.extensions.map((ext) => (
                              <span key={ext} className={`badge ${extBadge(ext)}`}>{ext}</span>
                            ))}
                          </div>
                        </td>
                        <td className="font-mono">{m.decimals}</td>
                        <td className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>
                          {new Date(m.createdAt).toLocaleTimeString()}
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
                                  <span className="detail-label">Full Mint Address</span>
                                  <span className="detail-value font-mono" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                                    {m.mint}
                                  </span>
                                </div>
                                <div>
                                  <span className="detail-label">Decimals</span>
                                  <span className="detail-value font-mono">{m.decimals}</span>
                                </div>
                                <div>
                                  <span className="detail-label">Extensions</span>
                                  <span className="detail-value">{m.extensions.join(', ')}</span>
                                </div>
                                <div>
                                  <span className="detail-label">Transaction Signature</span>
                                  <span className="detail-value font-mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                                    {m.signature}
                                  </span>
                                </div>
                                <div>
                                  <span className="detail-label">Created</span>
                                  <span className="detail-value">{new Date(m.createdAt).toLocaleString()}</span>
                                </div>
                                <div>
                                  <span className="detail-label">Explorer</span>
                                  <a
                                    className="detail-value"
                                    href={`https://explorer.solana.com/address/${m.mint}?cluster=devnet`}
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
      )}

      {/* ── Empty ──────────────────────────────────────────── */}
      {mints.length === 0 && wallets.length > 0 && (
        <div className="empty-state">
          <div className="empty-icon"><IconHexagon size={24} /></div>
          <p>No token mints created yet. Configure extensions above.</p>
        </div>
      )}
    </div>
  )
}

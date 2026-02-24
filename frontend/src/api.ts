const API_BASE = '/api';

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Wallet ──────────────────────────────────────────────────────────────────

export const walletApi = {
  create: () => request('/wallet/create', { method: 'POST' }),
  getBalance: (address: string) => request(`/wallet/${address}/balance`),
  airdrop: (address: string, amount: number) =>
    request(`/wallet/${address}/airdrop`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
  send: (from: string, to: string, amount: number) =>
    request('/wallet/send', {
      method: 'POST',
      body: JSON.stringify({ from, to, amount }),
    }),
  list: () => request('/wallets'),
};

// ── Agents ──────────────────────────────────────────────────────────────────

export const agentApi = {
  register: (name: string, strategy: string, maxTransactionSize: number) =>
    request('/agents/register', {
      method: 'POST',
      body: JSON.stringify({ name, strategy, maxTransactionSize }),
    }),
  list: () => request('/agents'),
  fund: (id: string) =>
    request(`/agents/${id}/fund`, { method: 'POST' }),
};

// ── Simulation ──────────────────────────────────────────────────────────────

export const simulationApi = {
  run: () => request('/simulation/run', { method: 'POST' }),
};

// ── Tokens ──────────────────────────────────────────────────────────────────

export const tokenApi = {
  createMint: (walletAddress: string, config: any) =>
    request('/tokens/create-mint', {
      method: 'POST',
      body: JSON.stringify({ walletAddress, config }),
    }),
  listMints: () => request('/tokens/mints'),
};

// ── Security ────────────────────────────────────────────────────────────────

export const securityApi = {
  getLogs: () => request('/security/logs'),
  getStats: () => request('/security/stats'),
};

import { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Save, RefreshCw, Lock, CheckCircle2, AlertTriangle, ArrowLeft, Send, Bell } from 'lucide-react';
import { cn } from '../lib/utils';

const API = '/api';

type Config = {
  contracts: {
    bsc: { bridge: string; token: string };
    mchain: { bridge: string; token: string };
  };
  maxLiquidityUsd: number;
  gasWalletKeyConfigured: boolean;
  gasWalletKeySource: 'config' | 'env' | 'none';
  telegramBotToken: string;
  telegramChatIds: string[];
};

type LiquidityInfo = {
  bridgeUsdtBalance: string;
  maxLiquidityUsd: number;
  utilizationPercent: string;
  capReached: boolean;
};

function Field({
  label,
  value,
  onChange,
  mono = false,
  type = 'text',
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none',
          'focus:border-primary transition-colors placeholder:text-muted-foreground/40',
          mono && 'font-mono',
        )}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs font-bold tracking-widest uppercase text-primary border-b border-border pb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Login gate ─────────────────────────────────────────────────────────────────
function LoginGate({ onLogin }: { onLogin: (pwd: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onLogin(password);
      } else {
        setError('Wrong password');
      }
    } catch {
      setError('Could not reach server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground text-center">Enter your admin password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40"
          />
          {error && (
            <p className="text-danger text-xs font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
          >
            {loading ? 'Verifying…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main admin panel ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const [password, setPassword] = useState(() => sessionStorage.getItem('adminPwd') ?? '');
  const authed = !!password;

  const [config, setConfig] = useState<Config | null>(null);
  const [liquidity, setLiquidity] = useState<LiquidityInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form state
  const [bscBridge, setBscBridge] = useState('');
  const [bscToken, setBscToken] = useState('');
  const [mchainBridge, setMchainBridge] = useState('');
  const [mchainToken, setMchainToken] = useState('');
  const [maxLiquidity, setMaxLiquidity] = useState('');
  const [gasKey, setGasKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatIds, setTelegramChatIds] = useState('');
  const [showTgToken, setShowTgToken] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const headers = useCallback(
    () => ({ 'Content-Type': 'application/json', 'x-admin-password': password }),
    [password],
  );

  const loadAll = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const [cfgRes, liqRes] = await Promise.all([
        fetch(`${API}/admin/config`, { headers: headers() }),
        fetch(`${API}/admin/liquidity`, { headers: headers() }),
      ]);
      if (cfgRes.status === 401) { setPassword(''); sessionStorage.removeItem('adminPwd'); return; }
      const cfg: Config = await cfgRes.json();
      const liq: LiquidityInfo = await liqRes.json();
      setConfig(cfg);
      setLiquidity(liq);
      setBscBridge(cfg.contracts.bsc.bridge);
      setBscToken(cfg.contracts.bsc.token);
      setMchainBridge(cfg.contracts.mchain.bridge);
      setMchainToken(cfg.contracts.mchain.token);
      setMaxLiquidity(String(cfg.maxLiquidityUsd));
      setTelegramToken(cfg.telegramBotToken ?? '');
      setTelegramChatIds((cfg.telegramChatIds ?? []).join(', '));
    } catch {
      showToast('Failed to load config', false);
    } finally {
      setLoading(false);
    }
  }, [password, headers]);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed, loadAll]);

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', false);
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/config`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ adminPassword: newPassword }),
      });
      if (!res.ok) {
        showToast('Failed to update password', false);
        return;
      }
      // Update session so the user stays logged in with the new password
      setPassword(newPassword);
      sessionStorage.setItem('adminPwd', newPassword);
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password changed', true);
    } catch {
      showToast('Failed to update password', false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        contracts: {
          bsc: { bridge: bscBridge, token: bscToken },
          mchain: { bridge: mchainBridge, token: mchainToken },
        },
        maxLiquidityUsd: Number(maxLiquidity),
      };
      if (gasKey) {
        // Normalize: strip whitespace, add 0x prefix if missing
        let normalizedKey = gasKey.trim().replace(/^0x/i, '');
        body['gasWalletPrivateKey'] = '0x' + normalizedKey;
      }
      body['telegramBotToken'] = telegramToken;
      body['telegramChatIds'] = telegramChatIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`${API}/admin/config`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string; details?: { message: string }[] };
        const detail = e.details?.[0]?.message;
        showToast(detail ? `${e.error}: ${detail}` : (e.error ?? 'Save failed'), false);
        return;
      }
      const updated: Config = await res.json();
      setConfig(updated);
      setGasKey('');
      setTelegramToken(updated.telegramBotToken ?? '');
      setTelegramChatIds((updated.telegramChatIds ?? []).join(', '));
      showToast('Settings saved', true);
      loadAll();
    } catch {
      showToast('Save failed', false);
    } finally {
      setSaving(false);
    }
  }

  async function handleTelegramTest() {
    setSendingTest(true);
    try {
      const res = await fetch(`${API}/admin/telegram-test`, {
        method: 'POST',
        headers: headers(),
      });
      const data = await res.json() as { ok: boolean; message?: string; error?: string; errors?: string[] };
      if (data.ok) {
        showToast('Test message sent!', true);
      } else {
        showToast(data.error ?? data.errors?.[0] ?? 'Send failed', false);
      }
    } catch {
      showToast('Could not reach server', false);
    } finally {
      setSendingTest(false);
    }
  }

  function handleLogin(pwd: string) {
    setPassword(pwd);
    sessionStorage.setItem('adminPwd', pwd);
  }

  if (!authed) return <LoginGate onLogin={handleLogin} />;

  const utilNum = Number(liquidity?.utilizationPercent ?? 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-surface px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Bridge
          </a>
          <span className="text-border">|</span>
          <h1 className="text-sm font-bold text-foreground">Admin Panel</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => { setPassword(''); sessionStorage.removeItem('adminPwd'); }}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">

        {/* Liquidity status */}
        <div className={cn(
          'rounded-2xl border p-5 flex flex-col gap-4',
          liquidity?.capReached ? 'border-red-800 bg-[#1E0A0A]' : 'border-border bg-surface',
        )}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-widest uppercase text-muted-foreground">
              BSC Bridge Liquidity
            </span>
            {liquidity?.capReached && (
              <span className="text-xs font-bold text-danger flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Cap Reached — bridging blocked
              </span>
            )}
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-2xl font-bold font-mono text-foreground">
                ${Number(liquidity?.bridgeUsdtBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                of ${Number(liquidity?.maxLiquidityUsd ?? 0).toLocaleString()} cap
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">{liquidity?.utilizationPercent ?? '0'}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">utilized</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                utilNum >= 100 ? 'bg-danger' : utilNum >= 80 ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${Math.min(100, utilNum)}%` }}
            />
          </div>
        </div>

        {/* Contract addresses */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-6">
          <Section title="Contract Addresses">
            <div className="grid grid-cols-1 gap-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest -mb-2">BSC</p>
              <Field
                label="BSC Bridge Contract"
                value={bscBridge}
                onChange={setBscBridge}
                mono
                placeholder="0x..."
              />
              <Field
                label="BSC USDT Token"
                value={bscToken}
                onChange={setBscToken}
                mono
                placeholder="0x..."
              />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-2 -mb-2">MChain</p>
              <Field
                label="MChain Bridge Contract"
                value={mchainBridge}
                onChange={setMchainBridge}
                mono
                placeholder="0x..."
              />
              <Field
                label="MChain Token Contract"
                value={mchainToken}
                onChange={setMchainToken}
                mono
                placeholder="0x..."
              />
            </div>
          </Section>
        </div>

        {/* Liquidity cap */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-6">
          <Section title="Liquidity Cap">
            <Field
              label="Max Total Liquidity (USD)"
              value={maxLiquidity}
              onChange={setMaxLiquidity}
              placeholder="10000"
              hint="Users cannot bridge new USDT into BSC once the bridge contract holds this much USDT. Reads the live USDT balance of the BSC bridge contract."
            />
          </Section>
        </div>

        {/* Gas wallet */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-6">
          <Section title="Gas Wallet (BNB Subsidy)">
            <div className="flex flex-col gap-3">
              {config && (
                <div className={cn(
                  'flex items-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-lg border',
                  config.gasWalletKeySource === 'none'
                    ? 'bg-[#2A0E0E] border-red-900 text-red-400'
                    : 'bg-[#0D2218] border-emerald-800 text-emerald-400',
                )}>
                  {config.gasWalletKeySource === 'none' ? (
                    <><AlertTriangle className="w-3.5 h-3.5" /> No key configured — gas subsidy disabled</>
                  ) : (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Key active (source: {config.gasWalletKeySource})</>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Private Key (hex, 0x-prefixed)
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={gasKey}
                    onChange={(e) => setGasKey(e.target.value)}
                    placeholder="0x... (leave blank to keep existing)"
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Stored in server config. Takes precedence over the BRIDGE_ADMIN_PRIVATE_KEY env var.
                  Leave blank to keep the current key unchanged.
                </p>
              </div>
            </div>
          </Section>
        </div>

        {/* Telegram alerts */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-6">
          <Section title="Telegram Alerts">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-surface-raised border border-border rounded-lg px-3 py-2.5">
                <Bell className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
                <span>Sends an alert when bridge liquidity reaches <strong className="text-foreground">90%</strong> of the cap. At most once per hour.</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Bot Token
                </label>
                <div className="relative">
                  <input
                    type={showTgToken ? 'text' : 'password'}
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="123456:ABC-DEF..."
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTgToken(!showTgToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showTgToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Get this from @BotFather on Telegram.</p>
              </div>
              <Field
                label="Chat IDs (comma-separated)"
                value={telegramChatIds}
                onChange={setTelegramChatIds}
                placeholder="-1001234567890, 987654321"
                hint="User or group chat IDs to notify. Use @userinfobot to find your chat ID."
              />
              <button
                onClick={handleTelegramTest}
                disabled={sendingTest || !telegramToken || !telegramChatIds.trim()}
                className="flex items-center justify-center gap-2 bg-surface-raised hover:bg-border disabled:opacity-40 border border-border text-foreground font-semibold rounded-xl py-2.5 text-sm transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingTest ? 'Sending…' : 'Send Test Message'}
              </button>
            </div>
          </Section>
        </div>

        {/* Change password */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-6">
          <Section title="Change Admin Password">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(!showNewPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40"
                />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-danger text-xs font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Passwords do not match
                </p>
              )}
              <button
                onClick={handleChangePassword}
                disabled={saving || !newPassword || !confirmPassword}
                className="flex items-center justify-center gap-2 bg-surface-raised hover:bg-border disabled:opacity-40 border border-border text-foreground font-semibold rounded-xl py-2.5 text-sm transition-colors mt-1"
              >
                {saving ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </Section>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>

        <p className="text-xs text-muted-foreground text-center pb-8">
          Changes take effect immediately — no server restart required.
        </p>
      </main>

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold shadow-2xl border-l-4 transition-all text-white',
          toast.ok
            ? 'bg-[#0D2218] border-l-emerald-500 border border-emerald-800'
            : 'bg-[#2A0E0E] border-l-red-500 border border-red-900',
        )}>
          {toast.ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type DurUnit = "sec" | "min" | "hour" | "day";

type LicenseRow = {
  id: number;
  license_key: string;
  duration_seconds: number;
  duration_label: string;
  status: string;
  note: string | null;
  username: string | null;
  hwid_hash: string | null;
  hwid_pending_reset: boolean;
  activated_at: string | null;
  expires_at: string | null;
  seconds_left: number;
};

type SessionRow = {
  user_id: number;
  username: string;
  hwid_hash: string;
  license_key: string | null;
  last_seen_at: string;
  is_online: boolean;
  seconds_idle: number;
};

const UNIT_MULT: Record<DurUnit, number> = {
  sec: 1,
  min: 60,
  hour: 3600,
  day: 86400,
};

const PRESETS: { label: string; amount: number; unit: DurUnit }[] = [
  { label: "5 min test", amount: 5, unit: "min" },
  { label: "15 min", amount: 15, unit: "min" },
  { label: "1 hour", amount: 1, unit: "hour" },
  { label: "1 day", amount: 1, unit: "day" },
  { label: "7 days", amount: 7, unit: "day" },
  { label: "30 days", amount: 30, unit: "day" },
];

function toSeconds(amount: number, unit: DurUnit): number {
  return Math.max(1, Math.floor(amount)) * UNIT_MULT[unit];
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "EXPIRED";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function liveSecondsLeft(expiresAt: string | null, tick: number): number {
  void tick;
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

function formatDurationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hr`;
  return `${(seconds / 86400).toFixed(1)} day`;
}

function displayHwid(hwid: string | null, pending: boolean): React.ReactNode {
  if (!hwid || pending) {
    return <span className="hwid-pending">Awaiting new PC bind</span>;
  }
  return <code className="hwid-full">{hwid}</code>;
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [durAmount, setDurAmount] = useState(5);
  const [durUnit, setDurUnit] = useState<DurUnit>("min");
  const [qty, setQty] = useState(1);
  const [generated, setGenerated] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);

  const durationSeconds = useMemo(() => toSeconds(durAmount, durUnit), [durAmount, durUnit]);

  const loadAll = useCallback(async (t: string) => {
    const headers = { Authorization: `Bearer ${t}` };
    const [licRes, sessRes] = await Promise.all([
      fetch(`${API}/admin/licenses`, { headers }),
      fetch(`${API}/admin/sessions`, { headers }),
    ]);
    if (!licRes.ok) throw new Error(await licRes.text());
    if (!sessRes.ok) throw new Error(await sessRes.text());
    setLicenses(await licRes.json());
    setSessions(await sessRes.json());
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (t) {
      setToken(t);
      loadAll(t).catch(() => localStorage.removeItem("admin_token"));
    }
  }, [loadAll]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      loadAll(token).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [token, loadAll]);

  async function parseApiError(res: Response): Promise<string> {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      return typeof j.detail === "string" ? j.detail : text;
    } catch {
      return text || `Request failed (${res.status})`;
    }
  }

  async function adminLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      localStorage.setItem("admin_token", data.access_token);
      setToken(data.access_token);
      await loadAll(data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    setToken(null);
    setLicenses([]);
    setSessions([]);
  }

  async function generateKeys(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    try {
      const res = await fetch(`${API}/admin/licenses/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          duration_seconds: durationSeconds,
          quantity: qty,
          note: note || null,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setGenerated(data.keys);
      await loadAll(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    }
  }

  async function revoke(id: number) {
    if (!token) return;
    await fetch(`${API}/admin/licenses/${id}/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadAll(token);
  }

  async function resetHwid(id: number) {
    if (!token) return;
    if (!confirm("Reset HWID? Customer can bind license on a new PC.")) return;
    const res = await fetch(`${API}/admin/licenses/${id}/reset-hwid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError(await parseApiError(res));
      return;
    }
    await loadAll(token);
  }

  async function kickSession(userId: number) {
    if (!token) return;
    if (!confirm("Kick this session? User can log in on another PC.")) return;
    await fetch(`${API}/admin/sessions/${userId}/kick`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadAll(token);
  }

  function applyPreset(amount: number, unit: DurUnit) {
    setDurAmount(amount);
    setDurUnit(unit);
  }

  const active = licenses.filter((l) => {
    if (l.status !== "active" || !l.expires_at) return false;
    return liveSecondsLeft(l.expires_at, tick) > 0;
  });

  const onlineSessions = sessions.filter((s) => s.is_online);

  if (!token) {
    return (
      <div className="app-shell login-wrap">
        <div className="header-row" style={{ marginBottom: "0.5rem" }}>
          <div />
          <ThemeToggle />
        </div>
        <h1>License Dashboard</h1>
        <p className="subtitle">Admin panel — keys, HWID, live sessions</p>
        <form onSubmit={adminLogin} className="card">
          <label>Username</label>
          <input value={user} onChange={(e) => setUser(e.target.value)} style={{ marginBottom: "1rem" }} />
          <label>Password</label>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            style={{ marginBottom: "1rem" }}
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" style={{ width: "100%" }}>
            Sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell wide">
      <div className="header-row">
        <div>
          <h1>License Dashboard</h1>
          <p className="subtitle">
            <span className="live-dot">Live</span> — one account / one PC / one license
          </p>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <button type="button" className="secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Active licenses</div>
          <div className="stat-value success">{active.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Online sessions</div>
          <div className="stat-value success">{onlineSessions.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total keys</div>
          <div className="stat-value">{licenses.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Unused</div>
          <div className="stat-value">{licenses.filter((l) => l.status === "unused").length}</div>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title">Generate license</h2>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Pick unit (sec / min / hour / day), enter amount, or use a quick preset.
        </p>

        <div className="preset-row">
          {PRESETS.map((p) => {
            const activePreset = durAmount === p.amount && durUnit === p.unit;
            return (
              <button
                key={p.label}
                type="button"
                className={`preset ${activePreset ? "active" : ""}`}
                onClick={() => applyPreset(p.amount, p.unit)}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="duration-row">
          <div className="field-amount">
            <label>Amount</label>
            <input
              type="number"
              min={1}
              value={durAmount}
              onChange={(e) => setDurAmount(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="field-unit">
            <label>Unit</label>
            <select value={durUnit} onChange={(e) => setDurUnit(e.target.value as DurUnit)}>
              <option value="sec">Seconds</option>
              <option value="min">Minutes</option>
              <option value="hour">Hours</option>
              <option value="day">Days</option>
            </select>
          </div>
          <div className="duration-preview">
            = <strong>{formatDurationLabel(durationSeconds)}</strong>
            <span className="muted"> ({durationSeconds} sec total)</span>
          </div>
        </div>

        <form onSubmit={generateKeys} className="form-grid">
          <div>
            <label>Quantity</label>
            <input type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <div>
            <label>Note (buyer)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label>&nbsp;</label>
            <button type="submit">Generate keys</button>
          </div>
        </form>

        {generated.length > 0 && <div className="keys-box">{generated.join("\n")}</div>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2 className="section-title">Active logins (sessions)</h2>
        <div className="info-banner">
          Same account cannot log in on two PCs at once. If online elsewhere, login is blocked until logout or ~2 min idle.
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>User</th>
                <th>License key</th>
                <th>Session HWID (full)</th>
                <th>Last seen</th>
                <th>Idle</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No sessions yet — users appear after loader login.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.user_id}>
                    <td>
                      <span className={`badge ${s.is_online ? "online" : "offline"}`}>
                        {s.is_online ? "online" : "offline"}
                      </span>
                    </td>
                    <td>{s.username}</td>
                    <td>
                      <code>{s.license_key ?? "—"}</code>
                    </td>
                    <td>
                      <code className="hwid-full">{s.hwid_hash}</code>
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                      {new Date(s.last_seen_at).toLocaleString()}
                    </td>
                    <td>{s.is_online ? "—" : `${s.seconds_idle}s`}</td>
                    <td>
                      <button type="button" className="warn" onClick={() => kickSession(s.user_id)}>
                        Kick
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Licenses</h2>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Full device HWID shown per key. Use <strong>Reset HWID</strong> when customer changes PC.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Duration</th>
                <th>Status</th>
                <th>User</th>
                <th>Device HWID (full)</th>
                <th>Activated</th>
                <th>Remaining</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => {
                const left =
                  l.status === "active" && l.expires_at
                    ? liveSecondsLeft(l.expires_at, tick)
                    : l.seconds_left;
                const isLive = l.status === "active" && l.expires_at;
                return (
                  <tr key={l.id}>
                    <td>
                      <code>{l.license_key}</code>
                    </td>
                    <td>{l.duration_label}</td>
                    <td>
                      <span className={`badge ${l.status}`}>{l.status}</span>
                    </td>
                    <td>{l.username ?? "—"}</td>
                    <td>{displayHwid(l.hwid_hash, l.hwid_pending_reset)}</td>
                    <td style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                      {l.activated_at ? new Date(l.activated_at).toLocaleString() : "—"}
                    </td>
                    <td>
                      {isLive ? (
                        <span className={`countdown ${left <= 0 ? "expired" : ""}`}>
                          {formatCountdown(left)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                      {l.expires_at ? new Date(l.expires_at).toLocaleString() : "—"}
                    </td>
                    <td>
                      <div className="actions">
                        {l.hwid_hash && l.status !== "revoked" && (
                          <button type="button" className="ghost" onClick={() => resetHwid(l.id)}>
                            Reset HWID
                          </button>
                        )}
                        {l.status !== "revoked" && (
                          <button type="button" className="danger" onClick={() => revoke(l.id)}>
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

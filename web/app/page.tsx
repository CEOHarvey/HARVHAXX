"use client";

import { useCallback, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type LicenseRow = {
  id: number;
  license_key: string;
  duration_seconds: number;
  duration_label: string;
  status: string;
  note: string | null;
  username: string | null;
  hwid_tail: string | null;
  activated_at: string | null;
  expires_at: string | null;
  seconds_left: number;
};

const PRESETS: { label: string; seconds: number }[] = [
  { label: "5 min (test)", seconds: 5 * 60 },
  { label: "15 min", seconds: 15 * 60 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "7 days", seconds: 7 * 86400 },
  { label: "30 days", seconds: 30 * 86400 },
];

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

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [durationSeconds, setDurationSeconds] = useState(5 * 60);
  const [customMinutes, setCustomMinutes] = useState("5");
  const [qty, setQty] = useState(1);
  const [generated, setGenerated] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);

  const loadLicenses = useCallback(async (t: string) => {
    const res = await fetch(`${API}/admin/licenses`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) throw new Error(await res.text());
    setLicenses(await res.json());
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (t) {
      setToken(t);
      loadLicenses(t).catch(() => localStorage.removeItem("admin_token"));
    }
  }, [loadLicenses]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      loadLicenses(token).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [token, loadLicenses]);

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
      await loadLicenses(data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    setToken(null);
    setLicenses([]);
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
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setGenerated(data.keys);
      await loadLicenses(token);
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
    await loadLicenses(token);
  }

  const active = licenses.filter((l) => {
    if (l.status !== "active" || !l.expires_at) return false;
    return liveSecondsLeft(l.expires_at, tick) > 0;
  });

  if (!token) {
    return (
      <div className="app-shell login-wrap">
        <h1>License Dashboard</h1>
        <p className="subtitle">Owner panel — generate keys and watch live expiry</p>
        <p className="subtitle" style={{ marginTop: "-0.75rem", fontSize: "0.85rem" }}>
          Use <strong>ADMIN</strong> credentials from Render (Environment), not loader accounts like demouser.
        </p>
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
    <div className="app-shell">
      <div className="header-row">
        <div>
          <h1>License Dashboard</h1>
          <p className="subtitle">
            <span className="live-dot">Live</span> countdown updates every second
          </p>
        </div>
        <button type="button" className="secondary" onClick={logout}>
          Log out
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Active now</div>
          <div className="stat-value success">{active.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total keys</div>
          <div className="stat-value">{licenses.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Unused</div>
          <div className="stat-value">{licenses.filter((l) => l.status === "unused").length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Expired</div>
          <div className="stat-value">{licenses.filter((l) => l.status === "expired").length}</div>
        </div>
      </div>

      <section className="card">
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Generate license</h2>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Use <strong>5 min</strong> to test if loader stops when time runs out.
        </p>

        <div className="preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.seconds}
              type="button"
              className={`preset ${durationSeconds === p.seconds ? "active" : ""}`}
              onClick={() => {
                setDurationSeconds(p.seconds);
                setCustomMinutes(String(Math.round(p.seconds / 60)));
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={generateKeys} className="form-grid">
          <div>
            <label>Custom duration (minutes)</label>
            <input
              type="number"
              min={1}
              max={525600}
              value={customMinutes}
              onChange={(e) => {
                setCustomMinutes(e.target.value);
                const m = parseInt(e.target.value, 10);
                if (!isNaN(m) && m >= 1) setDurationSeconds(m * 60);
              }}
            />
          </div>
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

        <p className="subtitle" style={{ marginBottom: 0 }}>
          Selected: <span className="mono">{durationSeconds}s</span> (
          {PRESETS.find((p) => p.seconds === durationSeconds)?.label ?? `${customMinutes} min`})
        </p>

        {generated.length > 0 && (
          <div className="keys-box">{generated.join("\n")}</div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Licenses</h2>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Each active key is locked to one <strong>account</strong> and one <strong>PC (HWID)</strong>.
          Another user or machine cannot activate the same license.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Duration</th>
                <th>Status</th>
                <th>User</th>
                <th>HWID (device)</th>
                <th>Activated</th>
                <th>Live remaining</th>
                <th>Expires</th>
                <th></th>
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
                    <td>
                      {l.hwid_tail ? (
                        <code title="Last 8 chars of bound device hash">…{l.hwid_tail}</code>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
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
                      {l.status !== "revoked" && (
                        <button type="button" className="danger" onClick={() => revoke(l.id)}>
                          Revoke
                        </button>
                      )}
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

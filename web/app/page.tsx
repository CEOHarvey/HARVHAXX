"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type DurUnit = "sec" | "min" | "hour" | "day";
type TabId = "generate" | "active" | "unused" | "expired" | "hwid" | "sessions";

type LicenseRow = {
  id: number;
  license_key: string;
  duration_seconds: number;
  duration_label: string;
  category: string;
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
  bound_hwid_count: number;
};

type ExpiryLogRow = {
  id: number;
  license_key: string;
  username: string | null;
  category: string;
  hwid_hash: string | null;
  expired_at: string;
};

type HwidRequestRow = {
  id: number;
  user_id: number;
  username: string;
  hwid_hash: string;
  status: string;
  requested_at: string;
};

const UNIT_MULT: Record<DurUnit, number> = { sec: 1, min: 60, hour: 3600, day: 86400 };

const PRESETS: { label: string; amount: number; unit: DurUnit }[] = [
  { label: "5 min test", amount: 5, unit: "min" },
  { label: "15 min", amount: 15, unit: "min" },
  { label: "1 hour", amount: 1, unit: "hour" },
  { label: "1 day", amount: 1, unit: "day" },
  { label: "7 days", amount: 7, unit: "day" },
  { label: "30 days", amount: 30, unit: "day" },
];

const CATEGORIES = ["standard", "premium", "trial", "vip", "lifetime"];

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
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatDurationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hr`;
  return `${(seconds / 86400).toFixed(1)} day`;
}

function displayHwid(hwid: string | null, pending: boolean): React.ReactNode {
  if (!hwid || pending) return <span className="hwid-pending">Awaiting new PC bind</span>;
  return <code className="hwid-full">{hwid}</code>;
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [tab, setTab] = useState<TabId>("generate");
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [expiryLogs, setExpiryLogs] = useState<ExpiryLogRow[]>([]);
  const [hwidRequests, setHwidRequests] = useState<HwidRequestRow[]>([]);
  const [durAmount, setDurAmount] = useState(5);
  const [durUnit, setDurUnit] = useState<DurUnit>("min");
  const [qty, setQty] = useState(1);
  const [category, setCategory] = useState("standard");
  const [generated, setGenerated] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);

  const durationSeconds = useMemo(() => toSeconds(durAmount, durUnit), [durAmount, durUnit]);

  const loadAll = useCallback(async (t: string) => {
    const headers = { Authorization: `Bearer ${t}` };
    const [licRes, sessRes, logRes, reqRes] = await Promise.all([
      fetch(`${API}/admin/licenses`, { headers }),
      fetch(`${API}/admin/sessions`, { headers }),
      fetch(`${API}/admin/expiry-logs`, { headers }),
      fetch(`${API}/admin/hwid-requests?status_filter=pending`, { headers }),
    ]);
    if (!licRes.ok) throw new Error(await licRes.text());
    if (!sessRes.ok) throw new Error(await sessRes.text());
    if (!logRes.ok) throw new Error(await logRes.text());
    if (!reqRes.ok) throw new Error(await reqRes.text());
    setLicenses(await licRes.json());
    setSessions(await sessRes.json());
    setExpiryLogs(await logRes.json());
    setHwidRequests(await reqRes.json());
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

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("Copied to clipboard");
      setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setCopyMsg("Copy failed — select and copy manually");
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
    setExpiryLogs([]);
    setHwidRequests([]);
  }

  async function generateKeys(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    try {
      const res = await fetch(`${API}/admin/licenses/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          duration_seconds: durationSeconds,
          quantity: qty,
          category,
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
    if (!res.ok) setError(await parseApiError(res));
    else await loadAll(token);
  }

  async function kickSession(userId: number) {
    if (!token) return;
    if (!confirm("Kick session? User can log in on another approved PC.")) return;
    await fetch(`${API}/admin/sessions/${userId}/kick`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadAll(token);
  }

  async function approveHwid(id: number) {
    if (!token) return;
    const res = await fetch(`${API}/admin/hwid-requests/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) setError(await parseApiError(res));
    else await loadAll(token);
  }

  async function rejectHwid(id: number) {
    if (!token) return;
    const res = await fetch(`${API}/admin/hwid-requests/${id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) setError(await parseApiError(res));
    else await loadAll(token);
  }

  const active = licenses.filter((l) => {
    if (l.status !== "active" || !l.expires_at) return false;
    return liveSecondsLeft(l.expires_at, tick) > 0;
  });

  const unused = licenses.filter((l) => l.status === "unused");
  const onlineSessions = sessions.filter((s) => s.is_online);

  const activeByCategory = useMemo(() => {
    const map = new Map<string, LicenseRow[]>();
    for (const l of active) {
      const c = l.category || "standard";
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(l);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [active]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "generate", label: "Generate" },
    { id: "active", label: "Active", count: active.length },
    { id: "unused", label: "Unused", count: unused.length },
    { id: "expired", label: "Expired logs", count: expiryLogs.length },
    { id: "hwid", label: "HWID requests", count: hwidRequests.length },
    { id: "sessions", label: "Sessions", count: onlineSessions.length },
  ];

  function licenseTable(rows: LicenseRow[], showActions = true) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Category</th>
              <th>Duration</th>
              <th>Status</th>
              <th>User</th>
              <th>HWID</th>
              <th>Remaining</th>
              {showActions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showActions ? 8 : 7} className="muted">
                  No licenses in this tab.
                </td>
              </tr>
            ) : (
              rows.map((l) => {
                const left =
                  l.status === "active" && l.expires_at
                    ? liveSecondsLeft(l.expires_at, tick)
                    : l.seconds_left;
                return (
                  <tr key={l.id}>
                    <td>
                      <code
                        className="key-click"
                        title="Click to copy"
                        onClick={() => copyText(l.license_key)}
                        style={{ cursor: "pointer" }}
                      >
                        {l.license_key}
                      </code>
                    </td>
                    <td>
                      <span className="badge active">{l.category}</span>
                    </td>
                    <td>{l.duration_label}</td>
                    <td>
                      <span className={`badge ${l.status}`}>{l.status}</span>
                    </td>
                    <td>{l.username ?? "—"}</td>
                    <td>{displayHwid(l.hwid_hash, l.hwid_pending_reset)}</td>
                    <td>
                      {l.status === "active" && l.expires_at ? (
                        <span className={`countdown ${left <= 0 ? "expired" : ""}`}>
                          {formatCountdown(left)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    {showActions && (
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
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="app-shell login-wrap">
        <div className="header-row" style={{ marginBottom: "0.5rem" }}>
          <div />
          <ThemeToggle />
        </div>
        <h1>License Dashboard</h1>
        <p className="subtitle">Admin — keys, multi-HWID, categories</p>
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
            <span className="live-dot">Live</span> — HARVEY keys · multi-HWID · one login at a time
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
          <div className="stat-label">Active</div>
          <div className="stat-value success">{active.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Unused</div>
          <div className="stat-value">{unused.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">HWID pending</div>
          <div className="stat-value">{hwidRequests.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Online</div>
          <div className="stat-value success">{onlineSessions.length}</div>
        </div>
      </div>

      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {copyMsg && <p className="success" style={{ marginTop: 0 }}>{copyMsg}</p>}
      {error && <p className="error">{error}</p>}

      {tab === "generate" && (
        <section className="card">
          <h2 className="section-title">Generate license keys</h2>
          <p className="subtitle" style={{ marginTop: 0 }}>
            Format: <code>HARVEY-XXXXX-XXXXX</code> — click any key to copy.
          </p>
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`preset ${durAmount === p.amount && durUnit === p.unit ? "active" : ""}`}
                onClick={() => {
                  setDurAmount(p.amount);
                  setDurUnit(p.unit);
                }}
              >
                {p.label}
              </button>
            ))}
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
            </div>
          </div>
          <form onSubmit={generateKeys} className="form-grid">
            <div>
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Quantity</label>
              <input type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </div>
            <div>
              <label>Note</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
            </div>
            <div>
              <label>&nbsp;</label>
              <button type="submit">Generate keys</button>
            </div>
          </form>
          {generated.length > 0 && (
            <div className="keys-box-copy">
              <button type="button" className="ghost copy-all-btn" onClick={() => copyText(generated.join("\n"))}>
                Copy all keys
              </button>
              {generated.map((k) => (
                <button key={k} type="button" className="key-chip" onClick={() => copyText(k)}>
                  {k}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "active" && (
        <section className="card">
          <h2 className="section-title">Active licenses by category</h2>
          {activeByCategory.length === 0 ? (
            <p className="muted">No active licenses right now.</p>
          ) : (
            activeByCategory.map(([cat, rows]) => (
              <div key={cat} className="category-block">
                <h3>
                  {cat} ({rows.length})
                </h3>
                {licenseTable(rows)}
              </div>
            ))
          )}
        </section>
      )}

      {tab === "unused" && (
        <section className="card">
          <h2 className="section-title">Unused license keys</h2>
          <p className="subtitle" style={{ marginTop: 0 }}>
            Keys not activated yet. Click a key to copy.
          </p>
          {licenseTable(unused, false)}
        </section>
      )}

      {tab === "expired" && (
        <section className="card">
          <h2 className="section-title">Expired logs</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>User</th>
                  <th>Category</th>
                  <th>HWID</th>
                  <th>Expired at</th>
                </tr>
              </thead>
              <tbody>
                {expiryLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No expiry logs yet.
                    </td>
                  </tr>
                ) : (
                  expiryLogs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <code style={{ cursor: "pointer" }} onClick={() => copyText(r.license_key)}>
                          {r.license_key}
                        </code>
                      </td>
                      <td>{r.username ?? "—"}</td>
                      <td>
                        <span className="badge expired">{r.category}</span>
                      </td>
                      <td>
                        <code className="hwid-full">{r.hwid_hash ?? "—"}</code>
                      </td>
                      <td>{new Date(r.expired_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "hwid" && (
        <section className="card">
          <h2 className="section-title">HWID bind requests</h2>
          <div className="info-banner">
            User logs in from a new PC → request appears here. Approve to add that device. They can switch PCs
            anytime, but <strong>cannot log in on two PCs at once</strong>.
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>HWID</th>
                  <th>Requested</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {hwidRequests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No pending HWID requests.
                    </td>
                  </tr>
                ) : (
                  hwidRequests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.username}</td>
                      <td>
                        <code className="hwid-full">{r.hwid_hash}</code>
                      </td>
                      <td>{new Date(r.requested_at).toLocaleString()}</td>
                      <td>
                        <div className="actions">
                          <button type="button" onClick={() => approveHwid(r.id)}>
                            Accept
                          </button>
                          <button type="button" className="danger" onClick={() => rejectHwid(r.id)}>
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "sessions" && (
        <section className="card">
          <h2 className="section-title">Active sessions</h2>
          <div className="info-banner">
            One account = one online session. If online elsewhere, second login is blocked until kick or ~2 min idle.
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>User</th>
                  <th>Bound HWIDs</th>
                  <th>Current HWID</th>
                  <th>License</th>
                  <th>Last seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      No sessions yet.
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
                      <td>{s.bound_hwid_count}</td>
                      <td>
                        <code className="hwid-full">{s.hwid_hash}</code>
                      </td>
                      <td>
                        <code>{s.license_key ?? "—"}</code>
                      </td>
                      <td>{new Date(s.last_seen_at).toLocaleString()}</td>
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
      )}
    </div>
  );
}

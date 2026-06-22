"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type DurUnit = "sec" | "min" | "hour" | "day";
type TabId = "generate" | "active" | "unused" | "print" | "expired" | "sessions" | "accounts";

type LicenseRow = {
  id: number;
  license_key: string;
  duration_seconds: number;
  duration_label: string;
  category: string;
  status: string;
  note: string | null;
  username: string | null;
  bound_player_name?: string | null;
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
  bound_player_name?: string | null;
};

type ExpiryLogRow = {
  id: number;
  license_key: string;
  username: string | null;
  category: string;
  hwid_hash: string | null;
  expired_at: string;
};

type RegistrationLogRow = {
  id: number;
  user_id: number;
  username: string;
  email: string;
  password_plain: string;
  hwid_hash: string;
  client_ip: string | null;
  created_at: string;
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
const PRINT_COLS_PER_ROW = 3;

function printDurationLabel(seconds: number): string {
  if (seconds <= 0) return "0DAY";
  if (seconds % 86400 === 0) return `${seconds / 86400}DAY`;
  if (seconds % 3600 === 0) return `${seconds / 3600}HOUR`;
  if (seconds % 60 === 0) return `${seconds / 60}MIN`;
  return formatDurationLabel(seconds).replace(/\s/g, "").toUpperCase();
}

function formatLicensePrintBlock(label: string, keys: string[], colsPerRow: number): string {
  const lines: string[] = [];
  for (let i = 0; i < keys.length; i += colsPerRow) {
    const chunk = keys.slice(i, i + colsPerRow);
    lines.push(chunk.map((k) => `${label} - ${k}`).join("  "));
  }
  return lines.join("\n");
}

function buildLicensePrintDocument(
  groups: { seconds: number; keys: string[] }[],
  colsPerRow: number
): string {
  return groups
    .map((g) => formatLicensePrintBlock(printDurationLabel(g.seconds), g.keys, colsPerRow))
    .join("\n\n");
}

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
  const [registrationLogs, setRegistrationLogs] = useState<RegistrationLogRow[]>([]);
  const [hwidRequests, setHwidRequests] = useState<HwidRequestRow[]>([]);
  const [durAmount, setDurAmount] = useState(5);
  const [durUnit, setDurUnit] = useState<DurUnit>("min");
  const [qty, setQty] = useState(1);
  const [category, setCategory] = useState("standard");
  const [generated, setGenerated] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);
  const [selectedPrintDurations, setSelectedPrintDurations] = useState<number[]>([]);
  const [includeGeneratedBatch, setIncludeGeneratedBatch] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const durationSeconds = useMemo(() => toSeconds(durAmount, durUnit), [durAmount, durUnit]);

  const loadAll = useCallback(async (t: string) => {
    const headers = { Authorization: `Bearer ${t}` };
    const [licRes, sessRes, logRes, regRes, reqRes] = await Promise.all([
      fetch(`${API}/admin/licenses`, { headers }),
      fetch(`${API}/admin/sessions`, { headers }),
      fetch(`${API}/admin/expiry-logs`, { headers }),
      fetch(`${API}/admin/registration-logs`, { headers }),
      fetch(`${API}/admin/hwid-requests?status_filter=pending`, { headers }),
    ]);
    if (!licRes.ok) throw new Error(await licRes.text());
    if (!sessRes.ok) throw new Error(await sessRes.text());
    if (!logRes.ok) throw new Error(await logRes.text());
    if (!regRes.ok) throw new Error(await regRes.text());
    if (!reqRes.ok) throw new Error(await reqRes.text());
    setLicenses(await licRes.json());
    setSessions(await sessRes.json());
    setExpiryLogs(await logRes.json());
    setRegistrationLogs(await regRes.json());
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
      setRefreshing(true);
      loadAll(token)
        .then(() => setLastRefreshed(Date.now()))
        .catch(() => {})
        .finally(() => setRefreshing(false));
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

  function timeAgo(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  }

  async function manualRefresh() {
    if (!token || refreshing) return;
    setRefreshing(true);
    try {
      await loadAll(token);
      setLastRefreshed(Date.now());
    } catch {}
    setRefreshing(false);
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
    setRegistrationLogs([]);
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

  async function deleteLicense(id: number, licenseKey?: string) {
    if (!token) return;
    const label = licenseKey || `#${id}`;
    if (!confirm(`Delete unused license ${label}? This cannot be undone.`)) return;
    setError("");
    const res = await fetch(`${API}/admin/licenses/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError(await parseApiError(res));
      return;
    }
    if (licenseKey) {
      setGenerated((prev) => prev.filter((k) => k !== licenseKey));
    }
    await loadAll(token);
    setCopyMsg("License key deleted");
    setTimeout(() => setCopyMsg(""), 2000);
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

  const unusedByDuration = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const l of unused) {
      const sec = l.duration_seconds;
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(l.license_key);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([seconds, keys]) => ({
        seconds,
        keys,
        label: printDurationLabel(seconds),
        human: formatDurationLabel(seconds),
      }));
  }, [unused]);

  const durationKeysSig = unusedByDuration.map((g) => g.seconds).join(",");

  useEffect(() => {
    const available = unusedByDuration.map((g) => g.seconds);
    setSelectedPrintDurations((prev) => {
      const kept = prev.filter((s) => available.includes(s));
      const added = available.filter((s) => !kept.includes(s));
      return [...kept, ...added];
    });
  }, [durationKeysSig, unusedByDuration]);

  const printDocument = useMemo(() => {
    const groups: { seconds: number; keys: string[] }[] = [];
    for (const g of unusedByDuration) {
      if (!selectedPrintDurations.includes(g.seconds)) continue;
      groups.push({ seconds: g.seconds, keys: [...g.keys] });
    }
    if (includeGeneratedBatch && generated.length > 0 && selectedPrintDurations.includes(durationSeconds)) {
      const idx = groups.findIndex((g) => g.seconds === durationSeconds);
      if (idx >= 0) {
        groups[idx] = {
          seconds: durationSeconds,
          keys: [...new Set([...groups[idx].keys, ...generated])],
        };
      } else {
        groups.push({ seconds: durationSeconds, keys: [...generated] });
        groups.sort((a, b) => a.seconds - b.seconds);
      }
    }
    if (!groups.length) return "";
    return buildLicensePrintDocument(groups, PRINT_COLS_PER_ROW);
  }, [
    unusedByDuration,
    selectedPrintDurations,
    includeGeneratedBatch,
    generated,
    durationSeconds,
  ]);

  function togglePrintDuration(seconds: number) {
    setSelectedPrintDurations((prev) =>
      prev.includes(seconds) ? prev.filter((s) => s !== seconds) : [...prev, seconds].sort((a, b) => a - b)
    );
  }

  function printLicenses() {
    if (!printDocument) return;
    setError("");
    const escaped = printDocument
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "License print");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
    document.body.appendChild(iframe);
    const frameWin = iframe.contentWindow;
    const doc = frameWin?.document;
    if (!frameWin || !doc) {
      document.body.removeChild(iframe);
      setError("Print failed in this browser. Use Copy print text instead.");
      return;
    }
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>License keys</title>
      <style>
        body { font-family: Consolas, "Courier New", monospace; font-size: 11px; line-height: 1.45; padding: 24px; margin: 0; }
        pre { white-space: pre-wrap; word-break: break-all; margin: 0; }
      </style></head><body><pre>${escaped}</pre></body></html>`);
    doc.close();
    frameWin.focus();
    frameWin.print();
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* already removed */
      }
    }, 1500);
  }

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
    { id: "print", label: "Print keys" },
    { id: "expired", label: "Expired logs", count: expiryLogs.length },
    { id: "accounts", label: "Account logs", count: registrationLogs.length },
    { id: "sessions", label: "Sessions", count: onlineSessions.length },
  ];

  function licenseTable(rows: LicenseRow[], mode: "full" | "unused" | "readonly" = "full") {
    const showActions = mode !== "readonly";
    const showDeleteOnly = mode === "unused";
    const colSpan = showActions ? 9 : 8;
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th className="hide-mobile">Category</th>
              <th className="hide-mobile">Duration</th>
              <th>Status</th>
              <th>User</th>
              <th className="hide-mobile">Bound player</th>
              <th className="hide-mobile">HWID</th>
              <th>Remaining</th>
              {showActions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="muted">
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
                    <td className="hide-mobile">
                      <span className="badge active">{l.category}</span>
                    </td>
                    <td className="hide-mobile">{l.duration_label}</td>
                    <td>
                      <span className={`badge ${l.status}`}>{l.status}</span>
                    </td>
                    <td>{l.username ?? "—"}</td>
                    <td className="hide-mobile">{l.bound_player_name ?? "—"}</td>
                    <td className="hide-mobile">{displayHwid(l.hwid_hash, l.hwid_pending_reset)}</td>
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
                          {showDeleteOnly ? (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteLicense(l.id, l.license_key)}
                            >
                              Delete
                            </button>
                          ) : (
                            <>
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
                            </>
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
          <div className="refresh-indicator">
            <span className="refresh-time">Updated {timeAgo(lastRefreshed)}</span>
            <button
              type="button"
              className={`refresh-btn ${refreshing ? "refreshing" : ""}`}
              onClick={manualRefresh}
            >
              {refreshing ? <span className="refresh-spin">↻</span> : "↻"} Refresh
            </button>
          </div>
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
              {generated.map((k) => {
                const row = licenses.find((l) => l.license_key === k && l.status === "unused");
                return (
                  <div key={k} className="key-chip-row">
                    <button type="button" className="key-chip" onClick={() => copyText(k)}>
                      {k}
                    </button>
                    {row && (
                      <button
                        type="button"
                        className="danger key-chip-delete"
                        title="Delete this key"
                        onClick={() => deleteLicense(row.id, k)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              })}
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
          <p className="subtitle" style={{ marginTop: 0 }}>
            Delete removes accidental keys permanently (unused only).
          </p>
          {licenseTable(unused, "unused")}
        </section>
      )}

      {tab === "print" && (
        <section className="card">
          <h2 className="section-title">Print license keys</h2>
          <p className="subtitle" style={{ marginTop: 0 }}>
            Format: <code>1DAY - HARVEY-XXXXX-XXXXX</code> — 3 keys per row. Each duration is a separate
            paragraph (1DAY block, then 2DAY block, etc.).
          </p>
          {unusedByDuration.length === 0 && generated.length === 0 ? (
            <p className="muted">No unused keys to print. Generate keys first.</p>
          ) : (
            <>
              <div className="print-duration-picks">
                <span className="muted" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Select durations to include (each prints in its own section):
                </span>
                {unusedByDuration.map((g) => (
                  <label key={g.seconds} className="print-duration-chip">
                    <input
                      type="checkbox"
                      checked={selectedPrintDurations.includes(g.seconds)}
                      onChange={() => togglePrintDuration(g.seconds)}
                    />
                    {g.label} ({g.keys.length} unused · {g.human})
                  </label>
                ))}
                {generated.length > 0 && (
                  <label className="print-duration-chip">
                    <input
                      type="checkbox"
                      checked={includeGeneratedBatch}
                      onChange={(e) => setIncludeGeneratedBatch(e.target.checked)}
                    />
                    Last generated batch ({generated.length} keys · {printDurationLabel(durationSeconds)})
                  </label>
                )}
              </div>
              <div className="print-actions">
                <button type="button" onClick={printLicenses} disabled={!printDocument}>
                  Print
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!printDocument}
                  onClick={() => copyText(printDocument)}
                >
                  Copy print text
                </button>
              </div>
              <div className="print-preview-wrap">
                <div className="print-preview-label">Preview</div>
                <pre className="print-preview">{printDocument || "Select at least one duration."}</pre>
              </div>
            </>
          )}
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
                    <th className="hide-mobile">Category</th>
                    <th className="hide-mobile">HWID</th>
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
                      <td className="hide-mobile">
                        <span className="badge expired">{r.category}</span>
                      </td>
                      <td className="hide-mobile">
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

      {tab === "accounts" && (
        <section className="card">
          <h2 className="section-title">Account registration logs</h2>
          <div className="info-banner">
            Passwords are saved here only when a user signs up (for forgot-password support). Older accounts
            registered before this feature will not appear — ask them to register a new account or reset manually.
          </div>
          <div className="table-wrap">
            <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th className="hide-mobile">Email</th>
                    <th>Password</th>
                    <th className="hide-mobile">HWID</th>
                    <th className="hide-mobile">IP</th>
                    <th className="hide-mobile">Registered</th>
                  </tr>
                </thead>
              <tbody>
                {registrationLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No registration logs yet. New signups from the loader will appear here.
                    </td>
                  </tr>
                ) : (
                  registrationLogs.map((r) => (
                    <tr key={r.id}>
                      <td>{r.username}</td>
                      <td className="hide-mobile">{r.email}</td>
                      <td>
                        <code
                          className="key-click"
                          title="Click to copy password"
                          onClick={() => copyText(r.password_plain)}
                          style={{ cursor: "pointer" }}
                        >
                          {r.password_plain}
                        </code>
                      </td>
                      <td className="hide-mobile">
                        <code className="hwid-full">{r.hwid_hash}</code>
                      </td>
                      <td className="hide-mobile">{r.client_ip ?? "—"}</td>
                      <td className="hide-mobile">{new Date(r.created_at).toLocaleString()}</td>
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
                    <th className="hide-mobile">Bound player</th>
                    <th className="hide-mobile">Bound HWIDs</th>
                    <th className="hide-mobile">Current HWID</th>
                    <th>License</th>
                    <th className="hide-mobile">Last seen</th>
                    <th></th>
                  </tr>
                </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
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
                      <td className="hide-mobile">{s.bound_player_name ?? "—"}</td>
                      <td className="hide-mobile">{s.bound_hwid_count}</td>
                      <td className="hide-mobile">
                        <code className="hwid-full">{s.hwid_hash}</code>
                      </td>
                      <td>
                        <code>{s.license_key ?? "—"}</code>
                      </td>
                      <td className="hide-mobile">{new Date(s.last_seen_at).toLocaleString()}</td>
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

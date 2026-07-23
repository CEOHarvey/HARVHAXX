"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const WS_API = API.replace(/^http/, "ws");

/* ─── types ─────────────────────────────────────────────────────────────── */
interface Message {
  id: number;
  user_id: number;
  sender: "user" | "admin";
  content: string;
  sent_at: string;
  seen_at: string | null;
  message_type: string;
  file_url: string | null;
  deleted: boolean;
}

interface Conversation {
  user_id: number;
  username: string;
  plan: string | null;
  license_status: string | null;
  last_message: Message | null;
  unread_count: number;
  is_online: boolean;
}

/* ─── helpers ────────────────────────────────────────────────────────────── */
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function planColor(p: string | null) {
  if (p === "premium" || p === "vip") return "#E9D5A1";
  if (p === "lifetime") return "#C9A46B";
  if (p === "trial") return "#B9AE97";
  return "#9A9384";
}
function groupByDate(msgs: Message[]) {
  const map = new Map<string, Message[]>();
  for (const m of msgs) {
    const k = new Date(m.sent_at).toDateString();
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(m);
  }
  return Array.from(map.entries()).map(([, messages]) => ({
    date: fmtDate(messages[0].sent_at),
    messages,
  }));
}

/* ─── CSS ────────────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --gold: #C9A46B;
    --gold-bright: #E9D5A1;
    --gold-deep: #A67C3D;
    --gold-grad: linear-gradient(135deg, #F0DDB0 0%, #C9A46B 52%, #A67C3D 100%);
    --ivory: #EFE9DD;
    --muted: #9A9384;
    --faint: #5c574c;
    --hair: rgba(201,164,107,0.14);
    --panel: rgba(22,20,17,0.72);
    --serif: 'Cormorant Garamond', Georgia, serif;
  }

  html, body {
    height: 100%; overflow: hidden;
    background: #0a0908; color: var(--ivory);
    font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased;
  }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(201,164,107,0.22); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(201,164,107,0.4); }

  .shell {
    display: flex; height: 100vh; width: 100vw; overflow: hidden;
    background:
      radial-gradient(1100px 700px at 82% -10%, rgba(201,164,107,0.09), transparent 60%),
      radial-gradient(900px 600px at 0% 110%, rgba(166,124,61,0.05), transparent 55%),
      #0a0908;
  }

  /* ── Left sidebar ── */
  .left-col {
    width: 320px; min-width: 320px;
    background: linear-gradient(180deg, #100e0b 0%, #0b0a08 100%);
    border-right: 1px solid var(--hair);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .left-header {
    padding: 22px 18px 18px; border-bottom: 1px solid var(--hair);
    display: flex; align-items: center; justify-content: space-between;
  }
  .left-header-title { font-family: var(--serif); font-size: 22px; font-weight: 600; color: var(--ivory); letter-spacing: 0.01em; }
  .left-header-sub { font-size: 10px; color: var(--gold); margin-top: 3px; text-transform: uppercase; letter-spacing: 0.16em; }
  .logout-btn {
    padding: 6px 13px; background: transparent; border: 1px solid var(--hair);
    border-radius: 9px; color: var(--muted); font-size: 11px; cursor: pointer;
    font-family: Inter, system-ui, sans-serif; transition: all 0.18s; letter-spacing: 0.04em;
  }
  .logout-btn:hover { border-color: rgba(229,103,94,0.5); color: #E5867E; }

  .search-wrap { padding: 14px 16px; border-bottom: 1px solid var(--hair); }
  .search-input {
    width: 100%; background: var(--panel); border: 1px solid var(--hair); border-radius: 11px;
    padding: 10px 14px; color: var(--ivory); font-size: 13px; outline: none;
    font-family: Inter, system-ui, sans-serif; transition: border-color 0.2s;
  }
  .search-input:focus { border-color: rgba(201,164,107,0.5); }
  .search-input::placeholder { color: var(--faint); }

  .conv-list { flex: 1; overflow-y: auto; }

  .conv-item {
    display: flex; align-items: center; gap: 12px; padding: 14px 16px;
    cursor: pointer; border-bottom: 1px solid rgba(201,164,107,0.06);
    transition: background 0.15s; position: relative;
  }
  .conv-item:hover { background: rgba(201,164,107,0.045); }
  .conv-item.active { background: rgba(201,164,107,0.08); border-left: 2px solid var(--gold); }

  .conv-avatar {
    width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--serif); font-size: 18px; font-weight: 600; position: relative;
    background: radial-gradient(circle at 32% 28%, #221c14, #100d0a);
    border: 1.5px solid rgba(201,164,107,0.5); color: var(--gold-bright);
  }
  .conv-online-dot {
    position: absolute; bottom: 1px; right: 1px; width: 10px; height: 10px;
    border-radius: 50%; border: 2px solid #100d0a;
    background: #5FC98C; animation: gp 2.4s infinite;
  }
  @keyframes gp {
    0%,100% { box-shadow: 0 0 0 0 rgba(95,201,140,0.4); }
    50% { box-shadow: 0 0 0 4px rgba(95,201,140,0); }
  }

  .conv-body { flex: 1; min-width: 0; }
  .conv-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }
  .conv-username { font-family: var(--serif); font-size: 16px; font-weight: 600; color: var(--ivory); }
  .conv-time { font-size: 10px; color: var(--faint); letter-spacing: 0.03em; }
  .conv-last { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .conv-last.admin-sent { color: var(--faint); }

  .unread-badge {
    min-width: 20px; height: 20px; border-radius: 10px; background: var(--gold-grad);
    color: #211a0e; font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; padding: 0 6px;
    flex-shrink: 0; box-shadow: 0 2px 8px rgba(166,124,61,0.4);
  }

  /* ── Center chat ── */
  .center-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .chat-header {
    display: flex; align-items: center; gap: 14px; padding: 16px 24px;
    background: linear-gradient(180deg, rgba(18,16,12,0.9), rgba(12,11,9,0.6));
    border-bottom: 1px solid var(--hair); flex-shrink: 0; backdrop-filter: blur(14px);
  }
  .chat-hdr-avatar {
    width: 42px; height: 42px; border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #221c14, #100d0a);
    border: 1.5px solid rgba(201,164,107,0.5); color: var(--gold-bright);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--serif); font-size: 18px; font-weight: 600; flex-shrink: 0; position: relative;
  }
  .hdr-online { position: absolute; bottom: 1px; right: 1px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid #100d0a; background: #5FC98C; }
  .chat-hdr-name { font-family: var(--serif); font-size: 19px; font-weight: 600; color: var(--ivory); }
  .chat-hdr-status { font-size: 11px; color: var(--muted); margin-top: 1px; letter-spacing: 0.03em; }
  .hdr-actions { display: flex; gap: 8px; margin-left: auto; }
  .hdr-btn {
    padding: 7px 15px; border-radius: 9px; border: 1px solid rgba(201,164,107,0.3); background: rgba(201,164,107,0.06);
    font-size: 10px; font-family: Inter, system-ui, sans-serif; cursor: pointer;
    transition: all 0.18s; color: var(--gold-bright); letter-spacing: 0.1em; text-transform: uppercase;
  }
  .hdr-btn:hover { border-color: rgba(201,164,107,0.6); background: rgba(201,164,107,0.12); }
  .hdr-btn.seen { color: var(--gold-bright); }

  .msgs-area { flex: 1; overflow-y: auto; padding: 24px 24px 0; }

  .date-sep { display: flex; align-items: center; gap: 12px; margin: 20px 0 14px; }
  .date-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--hair), transparent); }
  .date-lbl { font-family: var(--serif); font-size: 12px; color: var(--gold); text-transform: uppercase; letter-spacing: 0.2em; padding: 0 6px; white-space: nowrap; }

  .msg-row { display: flex; align-items: flex-end; gap: 9px; margin-bottom: 2px; }
  .msg-row.user { flex-direction: row-reverse; }
  .msg-row.admin { flex-direction: row; }

  .msg-av {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--serif); font-size: 12px; font-weight: 600; flex-shrink: 0; margin-bottom: 2px;
  }
  .msg-av.user { background: var(--gold-grad); color: #211a0e; }
  .msg-av.admin { background: radial-gradient(circle at 32% 28%, #221c14, #100d0a); border: 1px solid rgba(201,164,107,0.5); color: var(--gold-bright); }

  .msg-bub {
    max-width: 62%; padding: 10px 15px; border-radius: 17px;
    font-size: 13.5px; line-height: 1.55; word-break: break-word;
  }
  .msg-bub.user { background: var(--panel); border: 1px solid var(--hair); color: var(--ivory); border-bottom-right-radius: 4px; backdrop-filter: blur(10px); }
  .msg-bub.admin { background: var(--gold-grad); color: #211a0e; font-weight: 500; border-bottom-left-radius: 4px; box-shadow: 0 6px 18px rgba(166,124,61,0.26); }
  .msg-bub.deleted { font-style: italic; opacity: 0.5; background: transparent; border: 1px dashed rgba(201,164,107,0.2); color: var(--faint); box-shadow: none; font-weight: 400; }

  .msg-meta { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--faint); margin-top: 3px; letter-spacing: 0.03em; }
  .msg-meta.user { justify-content: flex-end; padding-right: 37px; }
  .msg-meta.admin { padding-left: 37px; }
  .receipt { color: var(--faint); font-size: 11px; }
  .receipt.seen { color: var(--gold); }
  .msg-meta-del { color: rgba(229,103,94,0.7); cursor: pointer; margin-left: 6px; font-size: 10px; }
  .msg-meta-del:hover { color: #E5867E; }

  .typing-row { display: flex; align-items: center; gap: 9px; padding: 6px 0; }
  .typing-bub { background: var(--panel); border: 1px solid var(--hair); border-radius: 17px; border-bottom-left-radius: 4px; padding: 10px 15px; display: flex; gap: 5px; align-items: center; }
  .ty-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); animation: tb 1.4s infinite ease-in-out; }
  .ty-dot:nth-child(2) { animation-delay: 0.2s; }
  .ty-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes tb { 0%,80%,100%{transform:scale(0.8);opacity:0.4}40%{transform:scale(1.15);opacity:1} }

  .input-wrap { padding: 16px 24px 22px; flex-shrink: 0; }
  .input-box {
    display: flex; align-items: flex-end; gap: 11px;
    background: var(--panel); border: 1px solid var(--hair); border-radius: 16px; padding: 10px 12px;
    transition: border-color 0.2s, box-shadow 0.2s; backdrop-filter: blur(12px);
  }
  .input-box:focus-within { border-color: rgba(201,164,107,0.55); box-shadow: 0 0 0 3px rgba(201,164,107,0.08); }
  .chat-ta {
    flex: 1; background: transparent; border: none; outline: none; resize: none;
    color: var(--ivory); font-family: Inter, system-ui, sans-serif; font-size: 13.5px; line-height: 1.5;
    min-height: 22px; max-height: 100px; overflow-y: auto; padding: 2px 0;
  }
  .chat-ta::placeholder { color: var(--faint); }
  .send-btn {
    width: 36px; height: 36px; border-radius: 11px; border: none; cursor: pointer;
    background: var(--gold-grad); color: #211a0e; display: flex; align-items: center; justify-content: center;
    transition: all 0.18s; flex-shrink: 0; box-shadow: 0 4px 14px rgba(166,124,61,0.35);
  }
  .send-btn:hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 6px 20px rgba(201,164,107,0.45); }
  .send-btn:disabled { background: rgba(201,164,107,0.12); color: var(--faint); cursor: not-allowed; transform: none; box-shadow: none; }

  /* ── Right sidebar ── */
  .right-col {
    width: 280px; min-width: 280px; background: linear-gradient(180deg, #100e0b 0%, #0b0a08 100%); border-left: 1px solid var(--hair);
    display: flex; flex-direction: column; overflow-y: auto;
  }
  .right-section { padding: 18px 16px; border-bottom: 1px solid var(--hair); }
  .right-section-title { font-size: 10px; font-weight: 600; color: var(--gold); text-transform: uppercase; letter-spacing: 0.16em; margin-bottom: 14px; }
  .detail-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; font-size: 12px; }
  .detail-label { color: var(--faint); text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; padding-top: 1px; }
  .detail-value { color: var(--muted); font-weight: 500; text-align: right; max-width: 140px; word-break: break-all; }
  .detail-value.green { color: #5FC98C; }
  .detail-value.red { color: #E5675E; }
  .detail-value.gold { color: var(--gold-bright); }

  .notes-input {
    width: 100%; background: var(--panel); border: 1px solid var(--hair); border-radius: 10px;
    padding: 10px 12px; color: var(--ivory); font-size: 12px; font-family: Inter, system-ui, sans-serif;
    outline: none; resize: none; min-height: 72px; transition: border-color 0.2s;
  }
  .notes-input:focus { border-color: rgba(201,164,107,0.5); }
  .notes-input::placeholder { color: var(--faint); }

  .empty-conv {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 40px 24px;
  }
  .empty-conv-icon {
    font-family: var(--serif); font-size: 36px; margin-bottom: 18px;
    width: 76px; height: 76px; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; border: 1px solid rgba(201,164,107,0.25); color: var(--gold);
    background: radial-gradient(circle at 32% 28%, rgba(34,28,20,0.6), transparent);
  }
  .empty-conv-title { font-family: var(--serif); font-size: 19px; font-weight: 600; color: var(--ivory); margin-bottom: 8px; }
  .empty-conv-sub { font-size: 12px; color: var(--muted); line-height: 1.6; }

  /* ── auth ── */
  .auth-wrap {
    display: flex; align-items: center; justify-content: center; height: 100vh; padding: 24px;
    background: radial-gradient(900px 600px at 50% -10%, rgba(201,164,107,0.12), transparent 60%), #0a0908;
  }
  .auth-card {
    background: var(--panel); border: 1px solid var(--hair); border-radius: 24px; padding: 46px 40px; width: 400px; max-width: 100%; text-align: center;
    backdrop-filter: blur(20px); box-shadow: 0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04); position: relative; overflow: hidden;
  }
  .auth-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(201,164,107,0.6), transparent); }
  .auth-icon {
    display: flex; align-items: center; justify-content: center;
    width: 66px; height: 66px; margin: 0 auto 22px; border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #221c14, #100d0a); border: 1.5px solid rgba(201,164,107,0.5);
    font-family: var(--serif); font-size: 30px; font-weight: 600; color: var(--gold-bright);
    box-shadow: 0 0 26px rgba(201,164,107,0.18);
  }
  .auth-title { font-family: var(--serif); font-size: 27px; font-weight: 600; color: var(--ivory); margin-bottom: 10px; letter-spacing: 0.01em; }
  .auth-sub { font-size: 13px; color: var(--muted); margin-bottom: 28px; line-height: 1.6; }
  .auth-input {
    width: 100%; background: rgba(10,9,8,0.6); border: 1px solid var(--hair); border-radius: 12px;
    padding: 13px 16px; color: var(--ivory); font-size: 14px; outline: none;
    font-family: Inter, system-ui, sans-serif; margin-bottom: 12px; transition: border-color 0.2s, box-shadow 0.2s;
  }
  .auth-input::placeholder { color: var(--faint); }
  .auth-input:focus { border-color: rgba(201,164,107,0.55); box-shadow: 0 0 0 3px rgba(201,164,107,0.08); }
  .auth-btn {
    width: 100%; padding: 14px; background: var(--gold-grad); color: #211a0e; border: none;
    border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; letter-spacing: 0.1em; text-transform: uppercase;
    font-family: Inter, system-ui, sans-serif; transition: transform 0.18s, box-shadow 0.18s; box-shadow: 0 6px 20px rgba(166,124,61,0.32);
  }
  .auth-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(201,164,107,0.42); }
  .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .auth-error { background: rgba(229,103,94,0.08); border: 1px solid rgba(229,103,94,0.25); border-radius: 10px; padding: 11px 15px; font-size: 12px; color: #E5867E; margin-bottom: 14px; text-align: left; }

  .loading-spin { width: 40px; height: 40px; border: 2px solid rgba(201,164,107,0.15); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.9s linear infinite; margin: 0 auto 18px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 900px) { .right-col { display: none; } }
  @media (max-width: 600px) { .left-col { width: 0; min-width: 0; display: none; } }
`;

/* ─── component ──────────────────────────────────────────────────────────── */
export default function SupportAdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── init ── */
  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (t) {
      setToken(t);
      loadConversations(t);
      connectWs(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── auth ── */
  async function adminLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? "Login failed");
      const data = await res.json();
      localStorage.setItem("admin_token", data.access_token);
      setToken(data.access_token);
      await loadConversations(data.access_token);
      connectWs(data.access_token);
    } catch (err) {
      setAuthErr(err instanceof Error ? err.message : "Login failed");
    }
    setLoading(false);
  }

  function logout() {
    wsRef.current?.close();
    localStorage.removeItem("admin_token");
    setToken(null);
    setConversations([]);
    setMessages([]);
    setSelectedId(null);
  }

  /* ── data loading ── */
  const loadConversations = useCallback(async (t: string) => {
    const res = await fetch(`${API}/chat/admin/conversations`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const data: Conversation[] = await res.json();
      setConversations(data);
    } else if (res.status === 401) {
      logout();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMessages(userId: number, t: string) {
    const res = await fetch(`${API}/chat/admin/messages/${userId}?limit=80`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const data: Message[] = await res.json();
      setMessages(data);
    }
  }

  /* ── select conversation ── */
  function selectConv(userId: number) {
    if (!token) return;
    setSelectedId(userId);
    setInput("");
    setUserTyping(false);
    loadMessages(userId, token);
    // mark as seen
    fetch(`${API}/chat/admin/messages/${userId}/seen`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => {
      setConversations((prev) =>
        prev.map((c) => (c.user_id === userId ? { ...c, unread_count: 0 } : c))
      );
    });
  }

  /* ── WebSocket ── */
  function connectWs(t: string) {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`${WS_API}/chat/admin/ws?token=${encodeURIComponent(t)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 25000);
      ws.addEventListener("close", () => clearInterval(ping));
    };

    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);

      if (data.type === "new_message") {
        const msg: Message = data.message;
        const uid: number = data.user_id ?? msg.user_id;

        // update message list if this conv is open
        setSelectedId((sel) => {
          if (sel === uid) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            // auto-mark seen
            if (token && msg.sender === "user") {
              fetch(`${API}/chat/admin/messages/${uid}/seen`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}` },
              });
            }
          }
          return sel;
        });

        // update conversation list
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.user_id === uid);
          const isSelectedCurrent = selectedId === uid;
          if (idx >= 0) {
            const updated = {
              ...prev[idx],
              last_message: msg,
              unread_count: msg.sender === "user" && !isSelectedCurrent
                ? prev[idx].unread_count + 1
                : prev[idx].unread_count,
            };
            const next = [...prev];
            next.splice(idx, 1);
            return [updated, ...next];
          } else {
            return [
              {
                user_id: uid,
                username: data.username ?? `user_${uid}`,
                plan: data.plan ?? null,
                license_status: data.license_status ?? null,
                last_message: msg,
                unread_count: msg.sender === "user" ? 1 : 0,
                is_online: true,
              },
              ...prev,
            ];
          }
        });
      } else if (data.type === "typing") {
        const uid: number = data.user_id;
        setSelectedId((sel) => {
          if (sel === uid) {
            setUserTyping(true);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setUserTyping(false), 3000);
          }
          return sel;
        });
      } else if (data.type === "user_online") {
        setOnlineUserIds((prev) => new Set(prev).add(data.user_id));
        setConversations((prev) =>
          prev.map((c) => (c.user_id === data.user_id ? { ...c, is_online: true } : c))
        );
      } else if (data.type === "user_offline") {
        setOnlineUserIds((prev) => {
          const n = new Set(prev);
          n.delete(data.user_id);
          return n;
        });
        setConversations((prev) =>
          prev.map((c) => (c.user_id === data.user_id ? { ...c, is_online: false } : c))
        );
      } else if (data.type === "messages_seen") {
        // The customer read our replies → mark admin messages seen so the
        // developer gets a read receipt (✓✓) on the open conversation.
        const uid: number = data.user_id;
        const seenAt: string = data.seen_at;
        setSelectedId((sel) => {
          if (sel === uid) {
            setMessages((prev) =>
              prev.map((m) => (m.sender === "admin" && !m.seen_at ? { ...m, seen_at: seenAt } : m))
            );
          }
          return sel;
        });
      } else if (data.type === "message_deleted") {
        const mid: number = data.message_id;
        setMessages((prev) =>
          prev.map((m) => (m.id === mid ? { ...m, deleted: true, content: "[deleted]" } : m))
        );
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        const t2 = localStorage.getItem("admin_token");
        if (t2) connectWs(t2);
      }, 3000);
    };
  }

  /* ── send ── */
  async function sendMessage() {
    if (!token || !selectedId || !input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    const opt: Message = {
      id: Date.now(),
      user_id: selectedId,
      sender: "admin",
      content,
      sent_at: new Date().toISOString(),
      seen_at: null,
      message_type: "text",
      file_url: null,
      deleted: false,
    };
    setMessages((prev) => [...prev, opt]);
    try {
      const res = await fetch(`${API}/chat/admin/messages/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, message_type: "text" }),
      });
      if (res.ok) {
        const real: Message = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === opt.id ? real : m)));
        if (token) loadConversations(token);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== opt.id));
    }
    setSending(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "22px";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
    // typing indicator
    if (wsRef.current?.readyState === WebSocket.OPEN && selectedId) {
      wsRef.current.send(JSON.stringify({ type: "typing", user_id: selectedId }));
    }
  }

  async function deleteMessage(msgId: number) {
    if (!token) return;
    await fetch(`${API}/chat/admin/messages/${msgId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /* ── scroll to bottom ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, userTyping]);

  /* ── poll conversations ── */
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => loadConversations(token), 15000);
    return () => clearInterval(id);
  }, [token, loadConversations]);

  /* ── filtered conversations ── */
  const filtered = conversations.filter((c) =>
    c.username.toLowerCase().includes(search.toLowerCase())
  );

  const selectedConv = conversations.find((c) => c.user_id === selectedId) ?? null;

  /* ── auth UI ── */
  if (!token) {
    return (
      <>
        <style>{CSS}</style>
        <div className="auth-wrap">
          <div className="auth-card">
            <span className="auth-icon">H</span>
            <div className="auth-title">Harvcious Admin</div>
            <div className="auth-sub">Sign in with your admin credentials</div>
            {authErr && <div className="auth-error">{authErr}</div>}
            <form onSubmit={adminLogin}>
              <input className="auth-input" placeholder="Username" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
              <input className="auth-input" type="password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
              <button className="auth-btn" type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  const grouped = groupByDate(messages);

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">
        {/* ── Left: conversations ── */}
        <div className="left-col">
          <div className="left-header">
            <div>
              <div className="left-header-title">Support Inbox</div>
              <div className="left-header-sub">
                {conversations.reduce((s, c) => s + c.unread_count, 0)} unread
              </div>
            </div>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>

          <div className="search-wrap">
            <input
              className="search-input"
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="conv-list">
            {filtered.length === 0 && (
              <div style={{ padding: "24px 14px", textAlign: "center", color: "#2a2d3a", fontSize: 12 }}>
                {search ? "No results." : "No conversations yet."}
              </div>
            )}
            {filtered.map((c) => (
              <div
                key={c.user_id}
                className={`conv-item${selectedId === c.user_id ? " active" : ""}`}
                onClick={() => selectConv(c.user_id)}
              >
                <div className="conv-avatar">
                  {c.username.slice(0, 2).toUpperCase()}
                  {c.is_online && <span className="conv-online-dot" />}
                </div>
                <div className="conv-body">
                  <div className="conv-top">
                    <span className="conv-username">{c.username}</span>
                    <span className="conv-time">
                      {c.last_message ? timeAgo(c.last_message.sent_at) : ""}
                    </span>
                  </div>
                  <div className={`conv-last${c.last_message?.sender === "admin" ? " admin-sent" : ""}`}>
                    {c.last_message
                      ? (c.last_message.sender === "admin" ? "You: " : "") +
                        (c.last_message.deleted ? "[deleted]" : c.last_message.content.slice(0, 48))
                      : "No messages yet"}
                  </div>
                </div>
                {c.unread_count > 0 && (
                  <div className="unread-badge">{c.unread_count}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: chat ── */}
        <div className="center-col">
          {!selectedConv ? (
            <div className="empty-conv">
              <div className="empty-conv-icon">✦</div>
              <div className="empty-conv-title">Select a conversation</div>
              <div className="empty-conv-sub">
                Choose a customer from the left to start chatting.
              </div>
            </div>
          ) : (
            <>
              {/* header */}
              <div className="chat-header">
                <div className="chat-hdr-avatar">
                  {selectedConv.username.slice(0, 2).toUpperCase()}
                  {selectedConv.is_online && <span className="hdr-online" />}
                </div>
                <div>
                  <div className="chat-hdr-name">{selectedConv.username}</div>
                  <div className="chat-hdr-status">
                    {selectedConv.is_online
                      ? "● Online"
                      : selectedConv.last_message
                      ? `Last seen ${timeAgo(selectedConv.last_message.sent_at)}`
                      : "Offline"}
                  </div>
                </div>
                <div className="hdr-actions">
                  <button
                    className="hdr-btn seen"
                    onClick={() =>
                      token &&
                      fetch(`${API}/chat/admin/messages/${selectedConv.user_id}/seen`, {
                        method: "PATCH",
                        headers: { Authorization: `Bearer ${token}` },
                      }).then(() =>
                        setConversations((p) =>
                          p.map((c) => (c.user_id === selectedConv.user_id ? { ...c, unread_count: 0 } : c))
                        )
                      )
                    }
                  >
                    Mark seen
                  </button>
                </div>
              </div>

              {/* messages */}
              <div className="msgs-area">
                {messages.length === 0 ? (
                  <div className="empty-conv">
                    <div className="empty-conv-icon" style={{ fontSize: 28, width: 64, height: 64 }}>✦</div>
                    <div className="empty-conv-sub">No messages yet. Start the conversation!</div>
                  </div>
                ) : (
                  grouped.map((group) => (
                    <div key={group.date}>
                      <div className="date-sep">
                        <div className="date-line" />
                        <span className="date-lbl">{group.date}</span>
                        <div className="date-line" />
                      </div>
                      {group.messages.map((msg) => {
                        const isUser = msg.sender === "user";
                        return (
                          <div key={msg.id}>
                            <div className={`msg-row ${isUser ? "user" : "admin"}`}>
                              <div className={`msg-av ${isUser ? "user" : "admin"}`}>
                                {isUser ? selectedConv.username.slice(0, 2).toUpperCase() : "H"}
                              </div>
                              <div className={`msg-bub ${isUser ? "user" : "admin"}${msg.deleted ? " deleted" : ""}`}>
                                {msg.content}
                              </div>
                            </div>
                            <div className={`msg-meta ${isUser ? "user" : "admin"}`}>
                              <span>{fmt(msg.sent_at)}</span>
                              {!isUser && !msg.deleted && (
                                <span
                                  className={`receipt${msg.seen_at ? " seen" : ""}`}
                                  title={msg.seen_at ? `Seen ${fmt(msg.seen_at)}` : "Delivered"}
                                >
                                  {msg.seen_at ? "✓✓" : "✓"}
                                </span>
                              )}
                              {!msg.deleted && (
                                <span
                                  className="msg-meta-del"
                                  title="Delete message"
                                  onClick={() => deleteMessage(msg.id)}
                                >
                                  ✕
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
                {userTyping && (
                  <div className="typing-row">
                    <div className="msg-av user">{selectedConv.username.slice(0, 2).toUpperCase()}</div>
                    <div className="typing-bub">
                      <div className="ty-dot" /><div className="ty-dot" /><div className="ty-dot" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} style={{ height: 20 }} />
              </div>

              {/* input */}
              <div className="input-wrap">
                <div className="input-box">
                  <textarea
                    className="chat-ta"
                    placeholder={`Reply to ${selectedConv.username}…`}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKey}
                    rows={1}
                  />
                  <button className="send-btn" onClick={sendMessage} disabled={!input.trim() || sending}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Right: customer info ── */}
        <div className="right-col">
          {selectedConv ? (
            <>
              <div className="right-section">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 4px", gap: 8 }}>
                  <div
                    style={{
                      width: 62, height: 62, borderRadius: "50%",
                      background: "radial-gradient(circle at 32% 28%, #221c14, #100d0a)",
                      border: "1.5px solid rgba(201,164,107,0.55)", color: "#E9D5A1",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600,
                      boxShadow: "0 0 20px rgba(201,164,107,0.16)",
                    }}
                  >
                    {selectedConv.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 19, color: "#EFE9DD" }}>{selectedConv.username}</div>
                  {selectedConv.plan && (
                    <div style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 600,
                      background: `${planColor(selectedConv.plan)}18`,
                      border: `1px solid ${planColor(selectedConv.plan)}40`,
                      color: planColor(selectedConv.plan),
                      textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>
                      ★ {selectedConv.plan}
                    </div>
                  )}
                </div>
              </div>

              <div className="right-section">
                <div className="right-section-title">License</div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span
                    className={`detail-value ${selectedConv.license_status === "active" ? "green" : selectedConv.license_status === "expired" ? "red" : ""}`}
                  >
                    {selectedConv.license_status ?? "—"}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Plan</span>
                  <span className="detail-value">{selectedConv.plan ?? "—"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Online</span>
                  <span className={`detail-value ${selectedConv.is_online ? "green" : ""}`}>
                    {selectedConv.is_online ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              <div className="right-section">
                <div className="right-section-title">Stats</div>
                <div className="detail-row">
                  <span className="detail-label">Messages</span>
                  <span className="detail-value">{messages.length}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Unread</span>
                  <span className={`detail-value ${selectedConv.unread_count > 0 ? "gold" : ""}`}>
                    {selectedConv.unread_count}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Last msg</span>
                  <span className="detail-value">
                    {selectedConv.last_message ? timeAgo(selectedConv.last_message.sent_at) : "—"}
                  </span>
                </div>
              </div>

              <div className="right-section">
                <div className="right-section-title">Notes</div>
                <textarea
                  className="notes-input"
                  placeholder="Internal notes about this customer…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="right-section" style={{ textAlign: "center", color: "#2a2d3a", fontSize: 12, paddingTop: 32 }}>
              Select a conversation to see customer details.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

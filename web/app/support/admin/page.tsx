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
  if (p === "premium" || p === "vip") return "#F5C451";
  if (p === "lifetime") return "#10B981";
  if (p === "trial") return "#8B5CF6";
  return "#3B82F6";
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
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; background: #090909; color: #fff; font-family: Inter, system-ui, sans-serif; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e2028; border-radius: 2px; }

  .shell { display: flex; height: 100vh; width: 100vw; overflow: hidden; }

  /* ── Left sidebar ── */
  .left-col {
    width: 300px; min-width: 300px;
    background: #0d0e11; border-right: 1px solid #1a1c22;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .left-header {
    padding: 18px 16px 14px; border-bottom: 1px solid #1a1c22;
    display: flex; align-items: center; justify-content: space-between;
  }
  .left-header-title { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
  .left-header-sub { font-size: 11px; color: #4a5060; margin-top: 2px; }
  .logout-btn {
    padding: 5px 12px; background: transparent; border: 1px solid #1e2028;
    border-radius: 7px; color: #4a5060; font-size: 11px; cursor: pointer;
    font-family: Inter, system-ui, sans-serif; transition: all 0.15s;
  }
  .logout-btn:hover { border-color: #EF4444; color: #EF4444; }

  .search-wrap { padding: 12px 14px; border-bottom: 1px solid #1a1c22; }
  .search-input {
    width: 100%; background: #16181D; border: 1px solid #1e2028; border-radius: 9px;
    padding: 8px 12px; color: #e2e8f0; font-size: 13px; outline: none;
    font-family: Inter, system-ui, sans-serif; transition: border-color 0.15s;
  }
  .search-input:focus { border-color: rgba(59,130,246,0.4); }
  .search-input::placeholder { color: #2a2d3a; }

  .conv-list { flex: 1; overflow-y: auto; }

  .conv-item {
    display: flex; align-items: center; gap: 10px; padding: 12px 14px;
    cursor: pointer; border-bottom: 1px solid rgba(26,28,34,0.5);
    transition: background 0.12s; position: relative;
  }
  .conv-item:hover { background: rgba(59,130,246,0.04); }
  .conv-item.active { background: rgba(59,130,246,0.08); border-left: 2px solid #3B82F6; }

  .conv-avatar {
    width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; position: relative;
    background: linear-gradient(135deg, #1e2a4a, #162040);
    border: 1px solid #1e2a6a; color: #3B82F6;
  }
  .conv-online-dot {
    position: absolute; bottom: 1px; right: 1px; width: 9px; height: 9px;
    border-radius: 50%; border: 2px solid #0d0e11;
    background: #10B981; animation: gp 2s infinite;
  }
  @keyframes gp {
    0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
    50% { box-shadow: 0 0 0 3px rgba(16,185,129,0); }
  }

  .conv-body { flex: 1; min-width: 0; }
  .conv-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }
  .conv-username { font-size: 13px; font-weight: 600; color: #e2e8f0; }
  .conv-time { font-size: 10px; color: #2e3140; }
  .conv-last { font-size: 12px; color: #4a5060; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .conv-last.admin-sent { color: #3a4a60; }

  .unread-badge {
    min-width: 18px; height: 18px; border-radius: 9px; background: #3B82F6;
    color: #fff; font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; padding: 0 5px;
    flex-shrink: 0;
  }

  /* ── Center chat ── */
  .center-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .chat-header {
    display: flex; align-items: center; gap: 12px; padding: 13px 20px;
    background: #0d0e11; border-bottom: 1px solid #1a1c22; flex-shrink: 0;
  }
  .chat-hdr-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: linear-gradient(135deg, #1e2a4a, #162040);
    border: 1px solid #1e2a6a; color: #3B82F6;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; flex-shrink: 0; position: relative;
  }
  .hdr-online { position: absolute; bottom: 1px; right: 1px; width: 8px; height: 8px; border-radius: 50%; border: 2px solid #0d0e11; background: #10B981; }
  .chat-hdr-name { font-size: 14px; font-weight: 600; color: #fff; }
  .chat-hdr-status { font-size: 11px; color: #4a5060; margin-top: 2px; }
  .hdr-actions { display: flex; gap: 8px; margin-left: auto; }
  .hdr-btn {
    padding: 5px 12px; border-radius: 7px; border: 1px solid #1e2028; background: transparent;
    font-size: 11px; font-family: Inter, system-ui, sans-serif; cursor: pointer;
    transition: all 0.15s; color: #4a5060;
  }
  .hdr-btn:hover { border-color: #3B82F6; color: #3B82F6; }
  .hdr-btn.seen { color: #10B981; border-color: rgba(16,185,129,0.3); }

  .msgs-area { flex: 1; overflow-y: auto; padding: 20px 20px 0; }

  .date-sep { display: flex; align-items: center; gap: 10px; margin: 16px 0 12px; }
  .date-line { flex: 1; height: 1px; background: #1a1c22; }
  .date-lbl { font-size: 10px; color: #2a2d3a; text-transform: uppercase; letter-spacing: 0.06em; padding: 0 4px; white-space: nowrap; }

  .msg-row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 2px; }
  .msg-row.user { flex-direction: row-reverse; }
  .msg-row.admin { flex-direction: row; }

  .msg-av {
    width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; flex-shrink: 0; margin-bottom: 2px;
  }
  .msg-av.user { background: linear-gradient(135deg, #1e2a4a, #162040); color: #3B82F6; border: 1px solid #1e2a6a; }
  .msg-av.admin { background: linear-gradient(135deg, #3B82F6, #10B981); color: #fff; }

  .msg-bub {
    max-width: 60%; padding: 9px 13px; border-radius: 16px;
    font-size: 13px; line-height: 1.5; word-break: break-word;
  }
  .msg-bub.user { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; border-bottom-right-radius: 3px; box-shadow: 0 2px 10px rgba(37,99,235,0.25); }
  .msg-bub.admin { background: #16181D; border: 1px solid #1e2028; color: #e2e8f0; border-bottom-left-radius: 3px; }
  .msg-bub.deleted { font-style: italic; opacity: 0.4; background: transparent; border: 1px dashed #2a2d3a; color: #4a5060; box-shadow: none; }

  .msg-meta { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #2e3140; margin-top: 2px; }
  .msg-meta.user { justify-content: flex-end; padding-right: 34px; }
  .msg-meta.admin { padding-left: 34px; }
  .msg-meta-del { color: #EF4444; cursor: pointer; margin-left: 6px; font-size: 10px; }
  .msg-meta-del:hover { color: #f87171; }

  .typing-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
  .typing-bub { background: #16181D; border: 1px solid #1e2028; border-radius: 16px; border-bottom-left-radius: 3px; padding: 9px 14px; display: flex; gap: 4px; align-items: center; }
  .ty-dot { width: 5px; height: 5px; border-radius: 50%; background: #4a5568; animation: tb 1.4s infinite ease-in-out; }
  .ty-dot:nth-child(2) { animation-delay: 0.2s; }
  .ty-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes tb { 0%,80%,100%{transform:scale(0.8);opacity:0.4}40%{transform:scale(1.1);opacity:1} }

  .input-wrap { padding: 14px 20px 20px; flex-shrink: 0; }
  .input-box {
    display: flex; align-items: flex-end; gap: 10px;
    background: #16181D; border: 1px solid #1e2028; border-radius: 14px; padding: 9px 11px;
    transition: border-color 0.15s;
  }
  .input-box:focus-within { border-color: rgba(59,130,246,0.4); box-shadow: 0 0 0 2px rgba(59,130,246,0.05); }
  .chat-ta {
    flex: 1; background: transparent; border: none; outline: none; resize: none;
    color: #e2e8f0; font-family: Inter, system-ui, sans-serif; font-size: 13px; line-height: 1.5;
    min-height: 22px; max-height: 100px; overflow-y: auto; padding: 1px 0;
  }
  .chat-ta::placeholder { color: #2a2d3a; }
  .send-btn {
    width: 34px; height: 34px; border-radius: 9px; border: none; cursor: pointer;
    background: #3B82F6; color: #fff; display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; flex-shrink: 0;
  }
  .send-btn:hover { background: #2563eb; transform: scale(1.05); }
  .send-btn:disabled { background: #1e2028; color: #2a2d3a; cursor: not-allowed; transform: none; }

  /* ── Right sidebar ── */
  .right-col {
    width: 260px; min-width: 260px; background: #0d0e11; border-left: 1px solid #1a1c22;
    display: flex; flex-direction: column; overflow-y: auto;
  }
  .right-section { padding: 16px 14px; border-bottom: 1px solid #1a1c22; }
  .right-section-title { font-size: 10px; font-weight: 600; color: #2e3140; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
  .detail-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; font-size: 12px; }
  .detail-label { color: #4a5060; }
  .detail-value { color: #AEB6C2; font-weight: 500; text-align: right; max-width: 130px; word-break: break-all; }
  .detail-value.green { color: #10B981; }
  .detail-value.red { color: #EF4444; }
  .detail-value.gold { color: #F5C451; }

  .notes-input {
    width: 100%; background: #16181D; border: 1px solid #1e2028; border-radius: 8px;
    padding: 8px 10px; color: #e2e8f0; font-size: 12px; font-family: Inter, system-ui, sans-serif;
    outline: none; resize: none; min-height: 72px; transition: border-color 0.15s;
  }
  .notes-input:focus { border-color: rgba(59,130,246,0.4); }
  .notes-input::placeholder { color: #2a2d3a; }

  .empty-conv {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #2a2d3a; text-align: center; padding: 40px 24px;
  }
  .empty-conv-icon { font-size: 48px; opacity: 0.3; margin-bottom: 16px; }
  .empty-conv-title { font-size: 15px; font-weight: 600; color: #2e3140; margin-bottom: 8px; }
  .empty-conv-sub { font-size: 12px; color: #2a2d3a; line-height: 1.5; }

  /* ── auth ── */
  .auth-wrap { display: flex; align-items: center; justify-content: center; height: 100vh; background: #090909; }
  .auth-card { background: #16181D; border: 1px solid #1e2028; border-radius: 20px; padding: 40px 36px; width: 380px; text-align: center; }
  .auth-icon { font-size: 36px; margin-bottom: 20px; display: block; }
  .auth-title { font-size: 20px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.02em; }
  .auth-sub { font-size: 13px; color: #4a5060; margin-bottom: 24px; }
  .auth-input {
    width: 100%; background: #0d0e11; border: 1px solid #1e2028; border-radius: 9px;
    padding: 11px 14px; color: #e2e8f0; font-size: 14px; outline: none;
    font-family: Inter, system-ui, sans-serif; margin-bottom: 10px; transition: border-color 0.15s;
  }
  .auth-input:focus { border-color: rgba(59,130,246,0.4); }
  .auth-btn {
    width: 100%; padding: 12px; background: #3B82F6; color: #fff; border: none;
    border-radius: 9px; font-size: 14px; font-weight: 600; cursor: pointer;
    font-family: Inter, system-ui, sans-serif; transition: background 0.15s;
  }
  .auth-btn:hover { background: #2563eb; }
  .auth-error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.18); border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #f87171; margin-bottom: 14px; text-align: left; }

  .loading-spin { width: 32px; height: 32px; border: 3px solid #1e2028; border-top-color: #3B82F6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 14px; }
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
            <span className="auth-icon">⚡</span>
            <div className="auth-title">Support Admin</div>
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
              <div className="empty-conv-icon">💬</div>
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
                    <div className="empty-conv-icon" style={{ fontSize: 32 }}>💬</div>
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
                              {msg.seen_at && isUser && <span style={{ color: "#3B82F6" }}>✓✓</span>}
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
                      width: 56, height: 56, borderRadius: "50%",
                      background: "linear-gradient(135deg, #1e2a4a, #162040)",
                      border: "1px solid #1e2a6a", color: "#3B82F6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, fontWeight: 700,
                    }}
                  >
                    {selectedConv.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{selectedConv.username}</div>
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

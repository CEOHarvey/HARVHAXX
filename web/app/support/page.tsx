"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const WS_API = API.replace(/^http/, "ws");

/* ─── types ─────────────────────────────────────────────────────────────── */
interface MeInfo {
  user_id: number;
  username: string;
  plan: string | null;
  license_status: string | null;
  expires_at: string | null;
}

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

/* ─── helpers ────────────────────────────────────────────────────────────── */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function groupByDate(msgs: Message[]): { date: string; messages: Message[] }[] {
  const map = new Map<string, Message[]>();
  for (const m of msgs) {
    const key = new Date(m.sent_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries()).map(([, messages]) => ({
    date: formatDate(messages[0].sent_at),
    messages,
  }));
}

function planBadgeColor(plan: string | null) {
  if (!plan) return "#AEB6C2";
  if (plan === "premium" || plan === "vip") return "#F5C451";
  if (plan === "lifetime") return "#10B981";
  return "#3B82F6";
}

function statusColor(s: string | null) {
  if (s === "active") return "#10B981";
  if (s === "expired") return "#EF4444";
  return "#AEB6C2";
}

/* ─── CSS (injected once) ────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body { height: 100%; overflow: hidden; background: #090909; color: #fff; font-family: Inter, system-ui, sans-serif; }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e2028; border-radius: 2px; }

  .support-shell {
    display: flex;
    height: 100vh;
    width: 100vw;
    background: #090909;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: 280px;
    min-width: 280px;
    background: #0d0e11;
    border-right: 1px solid #1a1c22;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 20px 20px 16px;
    border-bottom: 1px solid #1a1c22;
  }

  .brand-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #3B82F6, #1d4ed8);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.35);
  }

  .brand-name {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.02em;
  }

  .brand-sub {
    font-size: 11px;
    color: #4a5060;
    margin-top: 1px;
  }

  .profile-card {
    margin: 16px 14px;
    background: #16181D;
    border: 1px solid #1e2028;
    border-radius: 14px;
    padding: 18px 16px;
  }

  .profile-avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1e2a4a, #162040);
    border: 2px solid #1e2a6a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    color: #3B82F6;
    margin-bottom: 12px;
    text-transform: uppercase;
  }

  .profile-username {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 10px;
  }

  .profile-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    margin-bottom: 14px;
    text-transform: uppercase;
  }

  .profile-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
  }

  .profile-row-label { color: #4a5060; }
  .profile-row-value { color: #AEB6C2; font-weight: 500; }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 4px;
    flex-shrink: 0;
  }

  .sidebar-footer {
    margin-top: auto;
    padding: 16px;
    border-top: 1px solid #1a1c22;
  }

  .sidebar-footer-text {
    font-size: 11px;
    color: #2a2d38;
    text-align: center;
    line-height: 1.5;
  }

  /* ── Chat main ── */
  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #090909;
  }

  /* ── Chat header ── */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 24px;
    background: #0d0e11;
    border-bottom: 1px solid #1a1c22;
    flex-shrink: 0;
  }

  .dev-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3B82F6, #10B981);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    position: relative;
    flex-shrink: 0;
  }

  .online-indicator {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #10B981;
    border: 2px solid #0d0e11;
    animation: pulse-green 2s infinite;
  }

  @keyframes pulse-green {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
    50% { box-shadow: 0 0 0 4px rgba(16,185,129,0); }
  }

  .dev-info { flex: 1; }
  .dev-name { font-size: 14px; font-weight: 600; color: #fff; }
  .dev-status { font-size: 11px; color: #10B981; margin-top: 2px; }

  .header-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: rgba(59,130,246,0.08);
    border: 1px solid rgba(59,130,246,0.2);
    border-radius: 999px;
    font-size: 11px;
    color: #3B82F6;
    font-weight: 500;
  }

  /* ── Messages area ── */
  .messages-wrap {
    flex: 1;
    overflow-y: auto;
    padding: 24px 24px 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .date-separator {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 20px 0 16px;
  }

  .date-line { flex: 1; height: 1px; background: #1a1c22; }

  .date-label {
    font-size: 11px;
    color: #2e3140;
    font-weight: 500;
    white-space: nowrap;
    padding: 0 4px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .msg-group {
    display: flex;
    flex-direction: column;
    margin-bottom: 4px;
  }

  .msg-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    margin-bottom: 2px;
  }

  .msg-row.user { flex-direction: row-reverse; }
  .msg-row.admin { flex-direction: row; }

  .msg-sender-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    margin-bottom: 2px;
  }

  .msg-sender-avatar.admin {
    background: linear-gradient(135deg, #3B82F6, #10B981);
    color: #fff;
  }

  .msg-sender-avatar.user {
    background: linear-gradient(135deg, #1e2a4a, #162040);
    color: #3B82F6;
    border: 1px solid #1e2a6a;
  }

  .msg-bubble {
    max-width: 68%;
    padding: 10px 14px;
    border-radius: 18px;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
    position: relative;
  }

  .msg-bubble.user {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff;
    border-bottom-right-radius: 4px;
    box-shadow: 0 2px 12px rgba(37,99,235,0.3);
  }

  .msg-bubble.admin {
    background: #16181D;
    border: 1px solid #1e2028;
    color: #e2e8f0;
    border-bottom-left-radius: 4px;
  }

  .msg-bubble.deleted {
    font-style: italic;
    opacity: 0.45;
    background: transparent;
    border: 1px dashed #2a2d3a;
    color: #4a5060;
    box-shadow: none;
  }

  .msg-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #4a5060;
    margin-top: 3px;
  }

  .msg-meta.user { justify-content: flex-end; padding-right: 36px; }
  .msg-meta.admin { justify-content: flex-start; padding-left: 36px; }

  .seen-icon { font-size: 12px; }
  .seen-icon.seen { color: #3B82F6; }

  /* ── Typing indicator ── */
  .typing-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0 4px;
  }

  .typing-bubble {
    background: #16181D;
    border: 1px solid #1e2028;
    border-radius: 18px;
    border-bottom-left-radius: 4px;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .typing-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4a5568;
    animation: typing-bounce 1.4s infinite ease-in-out;
  }
  .typing-dot:nth-child(1) { animation-delay: 0s; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typing-bounce {
    0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
    40% { transform: scale(1.2); opacity: 1; }
  }

  .typing-label {
    font-size: 11px;
    color: #4a5568;
    font-style: italic;
    margin-left: 4px;
  }

  /* ── Input area ── */
  .input-wrap {
    padding: 16px 24px 24px;
    background: #090909;
    flex-shrink: 0;
  }

  .input-box {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    background: #16181D;
    border: 1px solid #1e2028;
    border-radius: 16px;
    padding: 10px 12px;
    transition: border-color 0.2s;
  }

  .input-box:focus-within {
    border-color: rgba(59,130,246,0.5);
    box-shadow: 0 0 0 3px rgba(59,130,246,0.06);
  }

  .chat-textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #e2e8f0;
    font-family: Inter, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    min-height: 22px;
    max-height: 120px;
    overflow-y: auto;
    padding: 1px 0;
  }

  .chat-textarea::placeholder { color: #2e3140; }

  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
    background: #3B82F6;
    color: #fff;
  }

  .send-btn:hover { background: #2563eb; transform: scale(1.05); }
  .send-btn:active { transform: scale(0.97); }
  .send-btn:disabled { background: #1e2028; color: #2e3140; cursor: not-allowed; transform: none; }

  .input-hint {
    font-size: 11px;
    color: #2a2d3a;
    margin-top: 8px;
    text-align: center;
  }

  /* ── Auth / loading states ── */
  .auth-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #090909;
  }

  .auth-card {
    background: #16181D;
    border: 1px solid #1e2028;
    border-radius: 20px;
    padding: 40px 36px;
    width: 380px;
    text-align: center;
  }

  .auth-icon {
    font-size: 40px;
    margin-bottom: 20px;
    display: block;
  }

  .auth-title {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
    letter-spacing: -0.02em;
  }

  .auth-sub {
    font-size: 13px;
    color: #4a5060;
    margin-bottom: 28px;
    line-height: 1.5;
  }

  .auth-input {
    width: 100%;
    background: #0d0e11;
    border: 1px solid #1e2028;
    border-radius: 10px;
    padding: 11px 14px;
    color: #e2e8f0;
    font-size: 14px;
    font-family: Inter, system-ui, sans-serif;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 12px;
  }

  .auth-input:focus { border-color: rgba(59,130,246,0.5); }

  .auth-btn {
    width: 100%;
    padding: 12px;
    background: #3B82F6;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    font-family: Inter, system-ui, sans-serif;
  }

  .auth-btn:hover { background: #2563eb; }

  .auth-error {
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: #f87171;
    margin-bottom: 14px;
    text-align: left;
  }

  .loading-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid #1e2028;
    border-top-color: #3B82F6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Empty state ── */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    text-align: center;
    color: #2e3140;
  }

  .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.4; }
  .empty-title { font-size: 16px; font-weight: 600; color: #3a3d4a; margin-bottom: 8px; }
  .empty-sub { font-size: 13px; color: #2a2d3a; line-height: 1.5; max-width: 260px; }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .sidebar { width: 0; min-width: 0; display: none; }
    .messages-wrap { padding: 16px 14px 0; }
    .input-wrap { padding: 12px 14px 20px; }
    .chat-header { padding: 12px 16px; }
  }

  /* ── Glow animation on chat button ── */
  @keyframes glow-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(59,130,246,0.4); }
    50% { box-shadow: 0 0 20px rgba(59,130,246,0.7); }
  }
`;

/* ─── main component ─────────────────────────────────────────────────────── */
export default function SupportPage() {
  const [styleInjected] = useState(true);

  // auth state
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [authMode, setAuthMode] = useState<"loading_token" | "fallback_input" | "authing" | "ready" | "error">("loading_token");
  const [fallbackUsername, setFallbackUsername] = useState("");
  const [authError, setAuthError] = useState("");

  // chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);
  const [typingTimer, setTypingTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [userTypingTimer, setUserTypingTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── token from URL on mount ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) {
      setToken(t);
      authWithToken(t);
    } else {
      setAuthMode("fallback_input");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authWithToken = useCallback(async (t: string) => {
    setAuthMode("authing");
    try {
      const res = await fetch(`${API}/chat/me?token=${encodeURIComponent(t)}`);
      if (!res.ok) throw new Error("Token expired or invalid. Please open support from the Loader.");
      const data: MeInfo = await res.json();
      setMe(data);
      setToken(t);
      setAuthMode("ready");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed.");
      setAuthMode("fallback_input");
    }
  }, []);

  /* ── load messages once authenticated ── */
  useEffect(() => {
    if (authMode !== "ready" || !token) return;
    fetchMessages();
    connectWs();
    return () => wsRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, token]);

  async function fetchMessages() {
    if (!token) return;
    const res = await fetch(`${API}/chat/messages?token=${encodeURIComponent(token)}&limit=80`);
    if (res.ok) {
      const data: Message[] = await res.json();
      setMessages(data);
    }
  }

  function connectWs() {
    if (!token) return;
    const ws = new WebSocket(`${WS_API}/chat/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // ping loop
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 25000);
      ws.addEventListener("close", () => clearInterval(ping));
    };

    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "new_message") {
        setMessages((prev) => {
          if (prev.find((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      } else if (data.type === "typing") {
        setAdminTyping(true);
        if (typingTimer) clearTimeout(typingTimer);
        const t = setTimeout(() => setAdminTyping(false), 3000);
        setTypingTimer(t);
      } else if (data.type === "messages_seen") {
        const seenAt = data.seen_at;
        setMessages((prev) => prev.map((m) => (m.sender === "user" && !m.seen_at ? { ...m, seen_at: seenAt } : m)));
      } else if (data.type === "message_deleted") {
        setMessages((prev) => prev.map((m) => (m.id === data.message_id ? { ...m, deleted: true, content: "[deleted]" } : m)));
      }
    };

    ws.onclose = () => {
      // reconnect after 3s
      setTimeout(() => {
        if (authMode === "ready" && token) connectWs();
      }, 3000);
    };
  }

  /* ── scroll to bottom on new messages ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, adminTyping]);

  /* ── fallback auth by username ── */
  async function handleFallbackAuth() {
    const uname = fallbackUsername.trim();
    if (!uname) return;
    setAuthMode("authing");
    setAuthError("");
    // In fallback mode, we can't auto-auth without a token.
    // Tell user to open from loader.
    setAuthError("Automatic login requires opening support from the Harvcious Loader. Please click 'Chat with Developer' in the loader.");
    setAuthMode("fallback_input");
  }

  /* ── send message ── */
  async function sendMessage() {
    if (!token || !input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    // optimistic
    const optimistic: Message = {
      id: Date.now(),
      user_id: me?.user_id ?? 0,
      sender: "user",
      content,
      sent_at: new Date().toISOString(),
      seen_at: null,
      message_type: "text",
      file_url: null,
      deleted: false,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`${API}/chat/messages?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, message_type: "text" }),
      });
      if (res.ok) {
        const real: Message = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? real : m)));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // auto-resize
    e.target.style.height = "22px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
    // send typing event
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (userTypingTimer) clearTimeout(userTypingTimer);
      wsRef.current.send(JSON.stringify({ type: "typing" }));
      const t = setTimeout(() => {}, 3000);
      setUserTypingTimer(t);
    }
  }

  /* ── seen status label ── */
  function seenLabel(msg: Message) {
    if (msg.sender !== "user") return null;
    if (msg.seen_at)
      return (
        <span className="seen-icon seen" title={`Seen ${formatTime(msg.seen_at)}`}>✓✓</span>
      );
    // check if delivered (has real id vs optimistic)
    if (msg.id > 1000000000) return <span className="seen-icon" title="Sending…">○</span>;
    return <span className="seen-icon" title="Delivered">✓</span>;
  }

  /* ── render loading/auth ── */
  if (authMode === "loading_token" || authMode === "authing") {
    return (
      <>
        <style>{CSS}</style>
        <div className="auth-wrap">
          <div className="auth-card">
            <div className="loading-spinner" />
            <div className="auth-title">Connecting…</div>
            <div className="auth-sub">Authenticating your session securely.</div>
          </div>
        </div>
      </>
    );
  }

  if (authMode === "fallback_input") {
    return (
      <>
        <style>{CSS}</style>
        <div className="auth-wrap">
          <div className="auth-card">
            <span className="auth-icon">💬</span>
            <div className="auth-title">Harvcious Support</div>
            <div className="auth-sub">
              Open support directly from the loader for instant access — click <strong>Chat with Developer</strong> in the app.
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <input
              className="auth-input"
              placeholder="Or enter your username to continue…"
              value={fallbackUsername}
              onChange={(e) => setFallbackUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFallbackAuth()}
            />
            <button className="auth-btn" onClick={handleFallbackAuth}>
              Continue
            </button>
          </div>
        </div>
      </>
    );
  }

  /* ── main chat UI ── */
  const grouped = groupByDate(messages);
  const lastSeen = [...messages].reverse().find((m) => m.sender === "user" && m.seen_at);

  return (
    <>
      <style>{CSS}</style>
      <div className="support-shell">
        {/* ─ sidebar ─ */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="brand-icon">⚡</div>
            <div>
              <div className="brand-name">Harvcious</div>
              <div className="brand-sub">Support Center</div>
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar">
              {me?.username?.slice(0, 2).toUpperCase() ?? "??"}
            </div>
            <div className="profile-username">{me?.username}</div>
            {me?.plan && (
              <div
                className="profile-badge"
                style={{
                  background: `${planBadgeColor(me.plan)}18`,
                  border: `1px solid ${planBadgeColor(me.plan)}40`,
                  color: planBadgeColor(me.plan),
                }}
              >
                ★ {me.plan.toUpperCase()}
              </div>
            )}
            <div className="profile-rows">
              <div className="profile-row">
                <span className="profile-row-label">Status</span>
                <span className="profile-row-value" style={{ color: statusColor(me?.license_status ?? null) }}>
                  <span className="status-dot" style={{ background: statusColor(me?.license_status ?? null) }} />
                  {me?.license_status ?? "—"}
                </span>
              </div>
              {me?.expires_at && (
                <div className="profile-row">
                  <span className="profile-row-label">Expires</span>
                  <span className="profile-row-value">
                    {new Date(me.expires_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}
              <div className="profile-row">
                <span className="profile-row-label">Support</span>
                <span className="profile-row-value" style={{ color: "#10B981" }}>
                  <span className="status-dot" style={{ background: "#10B981" }} />
                  Open
                </span>
              </div>
            </div>
          </div>

          <div className="sidebar-footer">
            <div className="sidebar-footer-text">
              Harvcious Support · End-to-end encrypted<br />
              Avg. response &lt; 1 hour
            </div>
          </div>
        </aside>

        {/* ─ main chat ─ */}
        <div className="chat-main">
          {/* header */}
          <div className="chat-header">
            <div className="dev-avatar" style={{ position: "relative" }}>
              H
              <span className="online-indicator" />
            </div>
            <div className="dev-info">
              <div className="dev-name">Harvey · Developer</div>
              <div className="dev-status">● Online now</div>
            </div>
            <div className="header-badge">
              <span>🔒</span>
              Encrypted
            </div>
          </div>

          {/* messages */}
          <div className="messages-wrap">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <div className="empty-title">Start the conversation</div>
                <div className="empty-sub">
                  Send a message and Harvey will get back to you as soon as possible.
                </div>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.date}>
                  <div className="date-separator">
                    <div className="date-line" />
                    <span className="date-label">{group.date}</span>
                    <div className="date-line" />
                  </div>
                  {group.messages.map((msg) => {
                    const isUser = msg.sender === "user";
                    const initials = isUser
                      ? me?.username?.slice(0, 2).toUpperCase() ?? "U"
                      : "H";
                    return (
                      <div key={msg.id}>
                        <div className={`msg-row ${isUser ? "user" : "admin"}`}>
                          <div className={`msg-sender-avatar ${isUser ? "user" : "admin"}`}>
                            {initials}
                          </div>
                          <div className={`msg-bubble ${isUser ? "user" : "admin"}${msg.deleted ? " deleted" : ""}`}>
                            {msg.content}
                          </div>
                        </div>
                        <div className={`msg-meta ${isUser ? "user" : "admin"}`}>
                          <span>{formatTime(msg.sent_at)}</span>
                          {seenLabel(msg)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}

            {adminTyping && (
              <div className="typing-row">
                <div className="msg-sender-avatar admin" style={{ width: 28, height: 28, fontSize: 11 }}>H</div>
                <div className="typing-bubble">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
                <span className="typing-label">Harvey is typing…</span>
              </div>
            )}

            <div ref={bottomRef} style={{ height: 24 }} />
          </div>

          {/* input */}
          <div className="input-wrap">
            <div className="input-box">
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                placeholder="Send a message…"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                className="send-btn"
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                title="Send (Enter)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <div className="input-hint">Enter to send · Shift+Enter for new line</div>
          </div>
        </div>
      </div>
    </>
  );
}

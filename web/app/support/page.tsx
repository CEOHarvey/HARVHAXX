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
  if (!plan) return "#B9AE97";
  if (plan === "premium" || plan === "vip") return "#E9D5A1";
  if (plan === "lifetime") return "#C9A46B";
  return "#B9AE97";
}

function statusColor(s: string | null) {
  if (s === "active") return "#5FC98C";
  if (s === "expired") return "#E5675E";
  return "#B9AE97";
}

/* ─── CSS (injected once) ────────────────────────────────────────────────── */
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
    height: 100%;
    overflow: hidden;
    background: #0a0908;
    color: var(--ivory);
    font-family: Inter, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(201,164,107,0.22); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(201,164,107,0.4); }

  .support-shell {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background:
      radial-gradient(1100px 700px at 78% -10%, rgba(201,164,107,0.10), transparent 60%),
      radial-gradient(900px 600px at 0% 110%, rgba(166,124,61,0.06), transparent 55%),
      #0a0908;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: 300px;
    min-width: 300px;
    background: linear-gradient(180deg, #100e0b 0%, #0b0a08 100%);
    border-right: 1px solid var(--hair);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .sidebar::after {
    content: "";
    position: absolute;
    top: 0; right: 0;
    width: 1px; height: 100%;
    background: linear-gradient(180deg, transparent, rgba(201,164,107,0.35), transparent);
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 26px 24px 22px;
    border-bottom: 1px solid var(--hair);
  }

  .brand-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: radial-gradient(circle at 30% 25%, #1c1813, #0d0b09);
    border: 1px solid rgba(201,164,107,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--serif);
    font-size: 24px;
    font-weight: 600;
    flex-shrink: 0;
    background-clip: padding-box;
    box-shadow: 0 0 22px rgba(201,164,107,0.14), inset 0 1px 0 rgba(255,255,255,0.05);
    color: transparent;
  }
  .brand-icon > span {
    background: var(--gold-grad);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .brand-name {
    font-family: var(--serif);
    font-size: 22px;
    font-weight: 600;
    color: var(--ivory);
    letter-spacing: 0.01em;
    line-height: 1;
  }

  .brand-sub {
    font-size: 10px;
    color: var(--gold);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.28em;
  }

  .profile-card {
    margin: 20px 16px;
    background: var(--panel);
    border: 1px solid var(--hair);
    border-radius: 16px;
    padding: 22px 18px;
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 40px rgba(0,0,0,0.45);
    position: relative;
    overflow: hidden;
  }
  .profile-card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(201,164,107,0.5), transparent);
  }

  .profile-avatar {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #221c14, #100d0a);
    border: 1.5px solid rgba(201,164,107,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--serif);
    font-size: 24px;
    font-weight: 600;
    color: var(--gold-bright);
    margin-bottom: 14px;
    text-transform: uppercase;
    box-shadow: 0 0 20px rgba(201,164,107,0.14);
  }

  .profile-username {
    font-family: var(--serif);
    font-size: 20px;
    font-weight: 600;
    color: var(--ivory);
    margin-bottom: 12px;
    letter-spacing: 0.01em;
  }

  .profile-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.16em;
    margin-bottom: 18px;
    text-transform: uppercase;
  }

  .profile-rows {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .profile-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    padding-bottom: 11px;
    border-bottom: 1px solid rgba(201,164,107,0.07);
  }
  .profile-row:last-child { border-bottom: none; padding-bottom: 0; }

  .profile-row-label {
    color: var(--faint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 10px;
  }
  .profile-row-value { color: var(--muted); font-weight: 500; }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 5px;
    flex-shrink: 0;
    box-shadow: 0 0 6px currentColor;
  }

  .sidebar-footer {
    margin-top: auto;
    padding: 18px;
    border-top: 1px solid var(--hair);
  }

  .sidebar-footer-text {
    font-size: 10px;
    color: var(--faint);
    text-align: center;
    line-height: 1.7;
    letter-spacing: 0.04em;
  }

  /* ── Chat main ── */
  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Chat header ── */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 28px;
    background: linear-gradient(180deg, rgba(18,16,12,0.9), rgba(12,11,9,0.6));
    border-bottom: 1px solid var(--hair);
    backdrop-filter: blur(14px);
    flex-shrink: 0;
  }

  .dev-avatar {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #221c14, #100d0a);
    border: 1.5px solid rgba(201,164,107,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--serif);
    font-size: 22px;
    font-weight: 600;
    color: var(--gold-bright);
    position: relative;
    flex-shrink: 0;
    box-shadow: 0 0 20px rgba(201,164,107,0.16);
  }

  .online-indicator {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #5FC98C;
    border: 2px solid #100d0a;
    animation: pulse-green 2.4s infinite;
  }

  @keyframes pulse-green {
    0%, 100% { box-shadow: 0 0 0 0 rgba(95,201,140,0.4); }
    50% { box-shadow: 0 0 0 5px rgba(95,201,140,0); }
  }

  .dev-info { flex: 1; }
  .dev-name {
    font-family: var(--serif);
    font-size: 19px;
    font-weight: 600;
    color: var(--ivory);
    letter-spacing: 0.01em;
  }
  .dev-status {
    font-size: 11px;
    color: #5FC98C;
    margin-top: 1px;
    letter-spacing: 0.03em;
  }

  .header-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    background: rgba(201,164,107,0.07);
    border: 1px solid rgba(201,164,107,0.28);
    border-radius: 999px;
    font-size: 10px;
    color: var(--gold-bright);
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  /* ── Messages area ── */
  .messages-wrap {
    flex: 1;
    overflow-y: auto;
    padding: 28px 28px 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .date-separator {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 22px 0 18px;
  }

  .date-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--hair), transparent); }

  .date-label {
    font-family: var(--serif);
    font-size: 12px;
    color: var(--gold);
    font-weight: 500;
    white-space: nowrap;
    padding: 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }

  .msg-group {
    display: flex;
    flex-direction: column;
    margin-bottom: 4px;
  }

  .msg-row {
    display: flex;
    align-items: flex-end;
    gap: 9px;
    margin-bottom: 2px;
  }

  .msg-row.user { flex-direction: row-reverse; }
  .msg-row.admin { flex-direction: row; }

  .msg-sender-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--serif);
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
    margin-bottom: 2px;
  }

  .msg-sender-avatar.admin {
    background: radial-gradient(circle at 32% 28%, #221c14, #100d0a);
    border: 1px solid rgba(201,164,107,0.5);
    color: var(--gold-bright);
  }

  .msg-sender-avatar.user {
    background: var(--gold-grad);
    color: #211a0e;
  }

  .msg-bubble {
    max-width: 66%;
    padding: 11px 16px;
    border-radius: 18px;
    font-size: 14px;
    line-height: 1.55;
    word-break: break-word;
    position: relative;
  }

  .msg-bubble.user {
    background: var(--gold-grad);
    color: #211a0e;
    font-weight: 500;
    border-bottom-right-radius: 5px;
    box-shadow: 0 6px 20px rgba(166,124,61,0.28);
  }

  .msg-bubble.admin {
    background: var(--panel);
    border: 1px solid var(--hair);
    color: var(--ivory);
    border-bottom-left-radius: 5px;
    backdrop-filter: blur(10px);
  }

  .msg-bubble.deleted {
    font-style: italic;
    opacity: 0.5;
    background: transparent;
    border: 1px dashed rgba(201,164,107,0.2);
    color: var(--faint);
    box-shadow: none;
    font-weight: 400;
  }

  .msg-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--faint);
    margin-top: 4px;
    letter-spacing: 0.03em;
  }

  .msg-meta.user { justify-content: flex-end; padding-right: 39px; }
  .msg-meta.admin { justify-content: flex-start; padding-left: 39px; }

  .seen-icon { font-size: 12px; }
  .seen-icon.seen { color: var(--gold); }

  /* ── Typing indicator ── */
  .typing-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 0 4px;
  }

  .typing-bubble {
    background: var(--panel);
    border: 1px solid var(--hair);
    border-radius: 18px;
    border-bottom-left-radius: 5px;
    padding: 11px 17px;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .typing-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gold);
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
    color: var(--muted);
    font-style: italic;
    margin-left: 5px;
    font-family: var(--serif);
  }

  /* ── Input area ── */
  .input-wrap {
    padding: 18px 28px 26px;
    flex-shrink: 0;
  }

  .input-box {
    display: flex;
    align-items: flex-end;
    gap: 11px;
    background: var(--panel);
    border: 1px solid var(--hair);
    border-radius: 18px;
    padding: 11px 13px;
    transition: border-color 0.25s, box-shadow 0.25s;
    backdrop-filter: blur(12px);
  }

  .input-box:focus-within {
    border-color: rgba(201,164,107,0.55);
    box-shadow: 0 0 0 3px rgba(201,164,107,0.08), 0 8px 24px rgba(0,0,0,0.3);
  }

  .chat-textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--ivory);
    font-family: Inter, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    min-height: 22px;
    max-height: 120px;
    overflow-y: auto;
    padding: 3px 2px;
  }

  .chat-textarea::placeholder { color: var(--faint); }

  .send-btn {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.18s;
    flex-shrink: 0;
    background: var(--gold-grad);
    color: #211a0e;
    box-shadow: 0 4px 14px rgba(166,124,61,0.35);
  }

  .send-btn:hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 6px 20px rgba(201,164,107,0.45); }
  .send-btn:active { transform: scale(0.97); }
  .send-btn:disabled { background: rgba(201,164,107,0.12); color: var(--faint); cursor: not-allowed; transform: none; box-shadow: none; }

  .input-hint {
    font-size: 10px;
    color: var(--faint);
    margin-top: 10px;
    text-align: center;
    letter-spacing: 0.08em;
  }

  /* ── Auth / loading states ── */
  .auth-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 24px;
    background:
      radial-gradient(900px 600px at 50% -10%, rgba(201,164,107,0.12), transparent 60%),
      #0a0908;
  }

  .auth-card {
    background: var(--panel);
    border: 1px solid var(--hair);
    border-radius: 24px;
    padding: 46px 40px;
    width: 400px;
    max-width: 100%;
    text-align: center;
    backdrop-filter: blur(20px);
    box-shadow: 0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
    position: relative;
    overflow: hidden;
  }
  .auth-card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(201,164,107,0.6), transparent);
  }

  .auth-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 66px;
    height: 66px;
    margin: 0 auto 22px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #221c14, #100d0a);
    border: 1.5px solid rgba(201,164,107,0.5);
    font-family: var(--serif);
    font-size: 30px;
    font-weight: 600;
    color: var(--gold-bright);
    box-shadow: 0 0 26px rgba(201,164,107,0.18);
  }

  .auth-title {
    font-family: var(--serif);
    font-size: 27px;
    font-weight: 600;
    color: var(--ivory);
    margin-bottom: 10px;
    letter-spacing: 0.01em;
  }

  .auth-sub {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 30px;
    line-height: 1.65;
  }
  .auth-sub strong { color: var(--gold-bright); font-weight: 600; }

  .auth-input {
    width: 100%;
    background: rgba(10,9,8,0.6);
    border: 1px solid var(--hair);
    border-radius: 12px;
    padding: 13px 16px;
    color: var(--ivory);
    font-size: 14px;
    font-family: Inter, system-ui, sans-serif;
    outline: none;
    transition: border-color 0.25s, box-shadow 0.25s;
    margin-bottom: 13px;
  }
  .auth-input::placeholder { color: var(--faint); }
  .auth-input:focus { border-color: rgba(201,164,107,0.55); box-shadow: 0 0 0 3px rgba(201,164,107,0.08); }

  .auth-btn {
    width: 100%;
    padding: 14px;
    background: var(--gold-grad);
    color: #211a0e;
    border: none;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: transform 0.18s, box-shadow 0.18s;
    font-family: Inter, system-ui, sans-serif;
    margin-top: 4px;
    box-shadow: 0 6px 20px rgba(166,124,61,0.32);
  }

  .auth-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(201,164,107,0.42); }
  .auth-btn:active { transform: translateY(0); }

  .auth-error {
    background: rgba(229,103,94,0.08);
    border: 1px solid rgba(229,103,94,0.25);
    border-radius: 10px;
    padding: 11px 15px;
    font-size: 13px;
    color: #E5867E;
    margin-bottom: 15px;
    text-align: left;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 2px solid rgba(201,164,107,0.15);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
    margin: 0 auto 20px;
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
  }

  .empty-icon {
    font-family: var(--serif);
    font-size: 40px;
    margin-bottom: 18px;
    width: 78px;
    height: 78px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid rgba(201,164,107,0.25);
    color: var(--gold);
    background: radial-gradient(circle at 32% 28%, rgba(34,28,20,0.6), transparent);
  }
  .empty-title {
    font-family: var(--serif);
    font-size: 20px;
    font-weight: 600;
    color: var(--ivory);
    margin-bottom: 8px;
  }
  .empty-sub { font-size: 13px; color: var(--muted); line-height: 1.6; max-width: 280px; }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .sidebar { width: 0; min-width: 0; display: none; }
    .messages-wrap { padding: 18px 16px 0; }
    .input-wrap { padding: 14px 16px 22px; }
    .chat-header { padding: 14px 18px; }
    .auth-card { padding: 38px 26px; }
  }

  /* ── Glow animation ── */
  @keyframes glow-pulse {
    0%, 100% { box-shadow: 0 0 10px rgba(201,164,107,0.35); }
    50% { box-shadow: 0 0 24px rgba(201,164,107,0.6); }
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
  const [fallbackPassword, setFallbackPassword] = useState("");
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

  /* ── fallback auth by account login (username + password) ──
     Same credentials the user logs in with in the loader. Posts to the
     web-only /chat/login (no HWID / session claim) to get a short-lived
     support token, then resolves identity like the token-from-loader flow.
     Password is required so nobody can impersonate another user's chat. */
  async function handleFallbackAuth() {
    const uname = fallbackUsername.trim();
    const pwd = fallbackPassword;
    if (!uname || !pwd) {
      setAuthError("Enter your username and password to continue.");
      return;
    }
    setAuthMode("authing");
    setAuthError("");
    try {
      // Account login for support chat → short-lived support token.
      // Uses the web-only /chat/login (no HWID / session claim) so signing in
      // from a browser never conflicts with the loader session.
      const loginRes = await fetch(`${API}/chat/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: uname, password: pwd }),
      });
      if (!loginRes.ok) {
        throw new Error(
          loginRes.status === 401
            ? "Invalid username or password."
            : "Login failed. Please try again."
        );
      }
      const { support_token } = await loginRes.json();

      // Resolve identity + enter chat (reuses the loader token flow)
      setFallbackPassword("");
      await authWithToken(support_token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Login failed.");
      setAuthMode("fallback_input");
    }
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
            <span className="auth-icon">H</span>
            <div className="auth-title">Harvcious Concierge</div>
            <div className="auth-sub">
              Sign in with your account — the same username and password you use in the loader. Or open <strong>Chat with Developer</strong> from the app for instant access.
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <input
              className="auth-input"
              placeholder="Username"
              autoComplete="username"
              value={fallbackUsername}
              onChange={(e) => setFallbackUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFallbackAuth()}
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={fallbackPassword}
              onChange={(e) => setFallbackPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFallbackAuth()}
            />
            <button className="auth-btn" onClick={handleFallbackAuth}>
              Sign in
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
            <div className="brand-icon"><span>H</span></div>
            <div>
              <div className="brand-name">Harvcious</div>
              <div className="brand-sub">Concierge</div>
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
              Encrypted
            </div>
          </div>

          {/* messages */}
          <div className="messages-wrap">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✦</div>
                <div className="empty-title">Start the conversation</div>
                <div className="empty-sub">
                  Send a message and Harvey will personally attend to you shortly.
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

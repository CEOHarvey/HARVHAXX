# Loader EXE — design & language guide

## Recommended language: **C# WPF** (.NET 8)

| Option | Good for | Loader UI |
|--------|----------|-----------|
| **C# WPF** ✅ | Login forms, timers, HTTP, polished Windows UI | Best default |
| C++ ImGui | Same language as hook DLL | Harder UI, longer dev time |
| C# WinForms | Simple | Looks dated |
| Electron | Web UI | Huge EXE, overkill |
| Rust + egui | Performance | Steep learning curve |

**Split stack (recommended):**
- `LicenseLoader.exe` → C# WPF (auth, license, countdown, “Start”)
- `your.dll` → C++ (Kiero / hooks) — only runs after server says license is valid

## Where does “design” live?

| Surface | Tool | Who uses it |
|---------|------|-------------|
| **Loader EXE** | WPF XAML + dark theme | Your customers |
| **Admin website** | Next.js in `web/` | You (owner) |
| **API** | No UI | Both apps call it |

Do **not** put admin license generation inside the EXE — customers only login + activate + see expiry.

## Loader window flow

```
┌─────────────────────────────┐
│  [Logo]  Your Product Name  │
├─────────────────────────────┤
│  Screen 1: Login            │
│    Username / Password      │
│    [ Login ]  Register link │
├─────────────────────────────┤
│  Screen 2: License (once)   │
│    Key: ____-____-____      │
│    [ Activate ]             │
├─────────────────────────────┤
│  Screen 3: Main             │
│    User: harvey             │
│    Status: ACTIVE           │
│    Expires: May 24, 2026    │
│    Remaining: 23:14:02      │  ← DispatcherTimer, 1s tick
│    [ Start ]  (disabled if  │
│               expired)      │
└─────────────────────────────┘
```

## Visual style (WPF)

- **Theme:** Dark (`#1a1b26` background, `#7aa2f7` accent) — common for game-adjacent tools
- **Library (optional):** [WPF UI](https://github.com/lepoco/wpfui) or MaterialDesignInXaml for modern controls
- **Size:** Fixed, non-resizable 420×560 — feels like a “loader”, not a full app
- **Font:** Segoe UI 12–14, monospace for countdown

## “Start” button behavior

1. Call `POST /license/validate` with JWT + HWID.
2. If `valid` and `seconds_left > 0` → run your inject routine (Process.Find + inject DLL).
3. If expired → red banner, button disabled.

Optionally validate again inside DLL via same API (shared secret or one-time token from loader).

## Website (owner)

- Sidebar: Dashboard, Licenses, Users
- Generate: duration dropdown (1 / 7 / 30 days), quantity, copy keys
- Table: username, key mask, HWID tail, activated, expires, status, Revoke

Built in `web/` — runs in browser, separate from EXE.

# Deploy API (public) — step by step

Recommended: **Render.com** (free HTTPS URL, e.g. `https://license-loader-api.onrender.com`).

---

## Before deploy — checklist

1. Change secrets (do NOT use defaults in production):
   - `SECRET_KEY` — long random string
   - `ADMIN_PASSWORD` — strong password
2. Use **PostgreSQL** on cloud (included below). SQLite is for local dev only.
3. After deploy, update:
   - Loader `appsettings.json` → `ApiBaseUrl`
   - Web `.env.local` → `NEXT_PUBLIC_API_URL`

---

## Part A — Push code to GitHub

### 1. Create GitHub repo

- Go to https://github.com/new
- Name: `license-loader-platform` (or any name)
- Create repository (empty)

### 2. Push from your PC

```powershell
cd C:\Users\Harvey\Projects\license-loader-platform
git add .
git commit -m "Prepare API for deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/license-loader-platform.git
git push -u origin main
```

Replace `YOUR_USERNAME` and repo name.

---

## Part B — Deploy API on Render (recommended)

### 1. Sign up

- https://render.com — sign up (GitHub login is easiest)

### 2. New PostgreSQL database

1. Dashboard → **New +** → **PostgreSQL**
2. Name: `license-loader-db`
3. Plan: **Free**
4. Create
5. Copy **Internal Database URL** (starts with `postgresql://`)

### 3. New Web Service (API)

1. **New +** → **Web Service**
2. Connect your GitHub repo
3. Settings:

| Field | Value |
|-------|--------|
| **Name** | `license-loader-api` |
| **Root Directory** | `api` |
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Plan** | Free |

### 4. Environment variables

In **Environment** tab, add:

| Key | Value |
|-----|--------|
| `SECRET_KEY` | (generate: https://randomkeygen.com/ — use 64 char) |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | your strong password |
| `DATABASE_URL` | paste PostgreSQL URL from step 2 |
| `CORS_ORIGINS` | `http://localhost:3000,https://YOUR-WEB-URL.vercel.app` |

Add your real web URL when you deploy the dashboard.

### 5. Deploy

- Click **Create Web Service**
- Wait until status **Live** (5–10 min first time)

### 6. Test public API

Your URL will look like:

```
https://license-loader-api.onrender.com
```

Test in browser or PowerShell:

```powershell
Invoke-RestMethod https://license-loader-api.onrender.com/health
```

Should return `status: ok`.

**Note:** Free tier sleeps after ~15 min idle. First request may take 30–60 seconds to wake up.

---

## Part C — Connect loader + web

### Loader (`appsettings.json` or rebuild embedded)

```json
"ApiBaseUrl": "https://license-loader-api.onrender.com"
```

Rebuild/publish EXE after change.

### Web dashboard

`web/.env.local`:

```
NEXT_PUBLIC_API_URL=https://license-loader-api.onrender.com
```

Then:

```powershell
cd web
npm run dev
```

For public web too, deploy `web` on **Vercel** (see `web/DEPLOY.md` if added) or Render static site.

---

## Part D — Deploy web on Vercel (optional, public dashboard)

1. https://vercel.com → sign up with GitHub
2. **Add New Project** → import same repo
3. **Root Directory:** `web`
4. Environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://license-loader-api.onrender.com`
5. Deploy
6. Copy Vercel URL → add to API `CORS_ORIGINS` on Render → **Manual Deploy** API again

---

## Alternative: Railway

1. https://railway.app → New Project → Deploy from GitHub
2. Add **PostgreSQL** plugin
3. Service root: `/api`
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Variables: same as Render (`DATABASE_URL` from Railway Postgres)

---

## Alternative: VPS (Windows/Linux)

```bash
cd api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://...
export SECRET_KEY=...
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Put **Nginx** or **Caddy** in front with HTTPS (Let's Encrypt).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS error on web | Add exact web URL to `CORS_ORIGINS` on Render |
| 502 / slow first request | Free tier waking up — wait and retry |
| DB error | `DATABASE_URL` must be `postgresql://...` not sqlite |
| Loader cannot connect | HTTPS URL in `ApiBaseUrl`, no trailing slash |

---

## Security reminders

- Never commit `.env` with real passwords to GitHub
- Rotate `SECRET_KEY` and admin password before going live
- Use HTTPS only in production

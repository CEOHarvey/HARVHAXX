# Deploy API (public) — Render step by step

## IMPORTANTE: Anong service ang pipiliin?

| Gusto mo i-deploy | Render type | May Build Command? |
|-------------------|-------------|-------------------|
| **FastAPI (API)** `api/` | **Web Service** | Oo |
| **Next.js dashboard** `web/` | **Static Site** o Vercel | Oo (npm) |

**Huwag** gumawa ng **Static Site** para sa API — wala doon ang Python/uvicorn fields.

Kung nakikita mo lang "static site" at walang **Start Command** → mali ang napili. Delete at gumawa ng **Web Service**.

---

## STEP 1 — GitHub

1. https://github.com/new → bagong repo
2. Sa PC:

```powershell
cd C:\Users\Harvey\Projects\license-loader-platform
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO-NAME.git
git push -u origin main
```

---

## STEP 2 — PostgreSQL (database)

1. https://dashboard.render.com
2. Click **+ New** (top right)
3. Piliin **PostgreSQL** (hindi Web Service, hindi Static Site)
4. Name: `license-loader-db` → Plan **Free** → **Create Database**
5. Hintayin **Available**
6. Sa page ng database, copy ang **Internal Database URL** (`postgresql://...`)

---

## STEP 3 — API = Web Service (hindi Static Site)

### 3.1 Gumawa ng tamang service

1. Dashboard → **+ New**
2. Piliin **Web Service**  
   - Icon: globe / server  
   - Description: "Dynamic web app" / Python, Node, etc.  
   - **HINDI** "Static Site"

### 3.2 Connect repo

1. **Build and deploy from a Git repository** → **Next**
2. Connect GitHub kung first time
3. Piliin ang repo `license-loader-platform` → **Connect**

### 3.3 Settings (ito ang dapat mong makita)

| Field | Ilagay mo |
|-------|-----------|
| **Name** | `license-loader-api` |
| **Region** | Singapore o pinakamalapit |
| **Branch** | `main` |
| **Root Directory** | **`api`** ← PINAKA-IMPORTANTE (kung blank = build failed, walang requirements.txt) |
| **Runtime** | **Python 3** |
| **Python Version** (Environment) | `3.12.0` (huwag 3.14 — maaaring may compatibility issues) |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

**Kung error:** `Could not open requirements file: requirements.txt`  
→ **Root Directory** ay blank o mali. Dapat eksaktong: `api` (walang slash: hindi `/api`).

Kung **walang** Build Command / Start Command / Runtime:
- Cancel — napili mo Static Site o maling template
- Ulitin at piliin **Web Service**

**Instance type:** Free

### 3.4 Environment variables

Scroll sa **Environment Variables** → Add:

| Key | Value |
|-----|--------|
| `SECRET_KEY` | long random string (64 chars) |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | malakas na password |
| `DATABASE_URL` | paste Internal Database URL (Step 2) |
| `CORS_ORIGINS` | `http://localhost:3000,https://harvhaxx.vercel.app` |
| `DISCORD_WEBHOOK_EXPIRED` | (optional) `#expired` channel webhook |
| `DISCORD_WEBHOOK_ACTIVE` | (optional) `#active` channel webhook |
| `DISCORD_WEBHOOK_HWID_RESET` | (optional) `#hwid-reset` channel webhook |
| `DISCORD_WEBHOOK_URL` | (optional) legacy — same as expired if `EXPIRED` empty |

**Walang space** pagkatapos ng comma. **Walang** trailing slash sa URL.  
Pagkatapos mag-save → **Manual Deploy** ulit ang API.

### 3.5 Deploy

1. Click **Create Web Service** (bottom)
2. Hintayin logs: Build → Deploy → **Live**
3. Public URL:

```
https://license-loader-api.onrender.com
```

(iba ang name kung iba ang Name mo)

### 3.6 Test

Browser o PowerShell:

```
https://YOUR-NAME.onrender.com/health
```

Dapat: `{"status":"ok"}`

---

## STEP 4 — Web dashboard (hiwalay — Static Site o Vercel)

Ang **Next.js** sa folder `web/` ay **HIWALAY** sa API.

### Option A — Vercel (recommended)

1. https://vercel.com → Import GitHub repo
2. **Root Directory:** `web`
3. Env: `NEXT_PUBLIC_API_URL` = `https://license-loader-api.onrender.com`
4. Deploy

### Option B — Render Static Site (kung gusto lahat sa Render)

1. **+ New** → **Static Site** (dito lang Static Site)
2. Same repo, **Root Directory:** `web`
3. **Build Command:** `npm install && npm run build`
4. **Publish Directory:** `out` o `.next` — para Next.js mas okay Vercel

Para sa Next.js 14 App Router, **Vercel** ang mas simple.

Pagkatapos mag-deploy ng web, idagdag ang web URL sa API `CORS_ORIGINS` sa Render → redeploy API.

---

## STEP 5 — Loader EXE

`appsettings.json`:

```json
"ApiBaseUrl": "https://license-loader-api.onrender.com"
```

Rebuild / `publish-single-exe.ps1`

---

## Troubleshooting

### "Wala build command sa Render"

→ Gumawa ka ng **Static Site**. Delete ito. Gumawa ng **Web Service** (Step 3.1).

### "Publish Directory" lang ang nakikita

→ Static Site yan. Para sa API kailangan **Web Service**.

### Build failed `Could not open requirements file`

→ **Root Directory** sa Render Settings = `api`  
→ Repo root ay `HARVHAXX/` — ang `requirements.txt` ay nasa `HARVHAXX/api/requirements.txt`

### Build failed `pip install` (iba pang error)

→ Root Directory = `api`, Python Version = `3.12.0`

### Database error

→ `DATABASE_URL` dapat `postgresql://...` from Render Postgres

### CORS error sa browser

→ Idagdag exact frontend URL sa `CORS_ORIGINS`

### Free tier slow / 502 first request

→ Natutulog ang service; wait 30–60 sec at retry

---

## Visual checklist (Render dashboard)

```
+ New
├── Static Site     ← web folder (Next.js) LANG
├── Web Service     ← API (Python) DITO
├── PostgreSQL      ← database DITO
└── ...
```

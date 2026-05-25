# Deploy web dashboard (Vercel)

## Vercel setup

1. Push repo to GitHub.
2. [vercel.com](https://vercel.com) → **Add New Project** → import repo.
3. **Root Directory:** `web` (important).
4. **Environment variable** (Production + Preview):

   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_API_URL` | `https://harvhaxx.onrender.com` (your Render API URL) |

5. **Deploy** → copy your site URL, e.g. `https://your-app.vercel.app`

## Render API (required for dashboard to work)

After Vercel deploy, on **Render** → your API service → **Environment**:

```
CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app
```

Then **Manual Deploy** / redeploy the API so new tables + routes load.

> API also allows any `https://*.vercel.app` URL automatically (preview deploys).

## Checklist (naka-deploy na sa Vercel)

- [ ] Vercel env: `NEXT_PUBLIC_API_URL` = live API (not `127.0.0.1`)
- [ ] Open `https://YOUR-API.onrender.com/health` → `{"status":"ok"}`
- [ ] Admin login on Vercel site works
- [ ] Generate tab → keys look like `HARVEY-XXXXX-XXXXX`, click to copy
- [ ] Tabs: Active / Unused / Expired / HWID requests / Sessions
- [ ] Render API redeployed after latest code push

## Common issues

| Problem | Fix |
|---------|-----|
| Network error / failed to fetch | Wrong `NEXT_PUBLIC_API_URL` or API sleeping (Render free tier) |
| CORS error in browser console | Add exact Vercel URL to Render `CORS_ORIGINS`, redeploy API |
| Old UI only | Vercel → **Deployments** → **Redeploy** (clear cache) |
| HWID / tabs missing | Redeploy **API** on Render (backend changes) |

## Local dev

```bash
cd web
cp .env.local.example .env.local
# edit NEXT_PUBLIC_API_URL if needed
npm install
npm run dev
```

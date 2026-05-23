# Deploy web dashboard (Vercel)

1. Push repo to GitHub (same repo as API).
2. https://vercel.com → Import project.
3. **Root Directory:** `web`
4. Environment:
   ```
   NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com
   ```
5. Deploy → copy URL (e.g. `https://license-dashboard.vercel.app`)
6. On Render API, set `CORS_ORIGINS` to include that URL.

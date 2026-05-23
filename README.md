# License Loader Platform

Monorepo for a licensed desktop loader: **API + Admin website + Windows loader (EXE)**.

## Structure

| Folder | Tech | Role |
|--------|------|------|
| `api/` | Python FastAPI + SQLite | Login, register, license activate/validate, admin generate |
| `web/` | Next.js | Owner dashboard: generate keys, monitor active users |
| `client/` | C# WPF (.NET 8) | Loader EXE: login, license, expiry countdown, gate before inject |

## Quick start

### API
```bash
cd api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Default admin (change in `.env`): `admin` / `admin123`

### Web dashboard
```bash
cd web
npm install
copy .env.local.example .env.local
npm run dev
```
Open http://localhost:3000

### Loader (EXE)
Open `client/LicenseLoader.sln` in Visual Studio 2022, set startup project, build **Release | x64**.
Set API URL in `appsettings.json` (or environment).

## Loader design notes

- **Language:** C# WPF — best balance of native Windows UI, HTTP client, and HWID without fighting C++ UI code.
- **DLL/inject:** Keep in **C++** if you already use Kiero; loader only validates license then launches your inject path.
- **UI:** Compact dark window (~420×560), 3 steps: Login → Activate license → Main (timer + Start).

See `docs/LOADER-DESIGN.md`.

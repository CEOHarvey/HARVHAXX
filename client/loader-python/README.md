# Harvcious Loader (Python)

Windows loader — **no .NET 8** required. Same API flow as the C# client.

## Requirements (build machine only)

- Python 3.10+
- `client\LicenseLoader\Payload\harvey.dll`
- `client\LicenseLoader\Payload\KO.exe`

## Run in dev

```powershell
cd client\loader-python
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
# Copy or symlink Payload from LicenseLoader\Payload for dev:
python -m loader
```

For dev without PyInstaller, place `harvey.dll` and `KO.exe` under `loader-python\Payload\` or use bundled paths in `loader\paths.py`.

## Build single EXE (customers)

```powershell
cd client\loader-python
.\build.ps1
```

Output: `dist\LicenseLoader.exe` (~15–25 MB typical)

Embeds:

- `appsettings.json`
- `Payload\harvey.dll`
- `Payload\KO.exe`

## Flow (unchanged)

1. Login / register → API `https://harvhaxx-1.onrender.com`
2. Activate license if needed
3. Locate / auto-find `hyxd.exe`
4. **Start game** → copies embedded KO.exe → runs as admin
5. **Load hacks** when in-game → inject `harvey.dll`
6. Loader **hides** (taskbar) — KO killed only when game closes
7. Sign out / logout on real exit

## Config

Edit `appsettings.json` before build, or place `appsettings.json` next to the built EXE to override.

Game path saved: `%LOCALAPPDATA%\LicenseLoader\gameconfig.json`

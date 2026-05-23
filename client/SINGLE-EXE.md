# Single EXE distribution (like other loaders)

## Customer folder

```
MyLoader/
  LicenseLoader.exe    ← only this file
```

No `harvey.dll`, no `appsettings.json` next to the exe.

## Your build steps

1. Copy `harvey.dll` → `LicenseLoader\Payload\harvey.dll`
2. Visual Studio: **Release** + **x64**
3. Build or Publish:

```powershell
cd client\LicenseLoader
dotnet publish -c Release -r win-x64 --self-contained false
```

Output: `bin\Release\net8.0-windows\win-x64\publish\LicenseLoader.exe`

Give customers **only** that exe.

## What happens at runtime

| Item | Where |
|------|--------|
| Settings | Embedded in EXE |
| harvey.dll | Embedded → temp extract on Load Hacks |
| Saved game path | `%LocalAppData%\LicenseLoader\gameconfig.json` |

## Dev override (optional)

`appsettings.json` beside the exe still overrides embedded settings when testing.

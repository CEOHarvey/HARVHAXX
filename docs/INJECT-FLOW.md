# Paano gumagana ang inject (loader vs game)

## Maliit na clarification

| Saan | Ano ang nangyayari |
|------|---------------------|
| **LicenseLoader.exe** | GUI + license; maaaring **naka-embed** ang `harvey.dll` sa loob ng file (resource) |
| **Temp folder** | Kapag Start: **extract** ang DLL mula sa EXE → `%TEMP%\LicenseLoader\...\harvey.dll` |
| **Game.exe** | Dito talaga **ini-inject** ang DLL (LoadLibrary sa process ng game) |

**Hindi** ini-inject ang DLL sa loob ng loader EXE para tumakbo doon — ang loader parang **carrier** lang (naka-bundle ang DLL sa EXE, tapos pinapasok sa **game**).

Ang CMD na lumalabas = **log window** ng loader (optional, `ShowInjectConsole: true`).

Kung ang **harvey.dll** mo mismo ang nagbubukas ng CMD sa game, iyon galing sa **DllMain** mo (`AllocConsole()` sa C++) — hiwalay sa loader CMD.

## Dalawang paraan ng DLL

### A) Embedded (isa lang na EXE sa customer)

1. Kopya `harvey.dll` → `client\LicenseLoader\Payload\harvey.dll`
2. Rebuild Release
3. `UseEmbeddedPayload: true`

### B) External file (tabi ng EXE)

1. `UseEmbeddedPayload: false`
2. Ilagay `harvey.dll` sa tabi ng `LicenseLoader.exe`

## Loader UI flow (main screen)

1. **Login** → license active
2. **Locate game manually** → pick `hyxd.exe` (saved to `gameconfig.json`)
3. **Start game (auto)** → launches that exe (enabled after locate)
4. **Load Hacks** — disabled until game process is **running** (in-game)
5. Hint: *Load hacks only while in-game*
6. On Load Hacks: CMD flash → inject `harvey.dll` → CMD auto-closes (~2.5s)

```
License valid + game located + game running?
  → Load Hacks enabled
  → CMD → extract DLL → inject → CMD close
```

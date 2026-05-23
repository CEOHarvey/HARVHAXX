# Publish sa Visual Studio 2022 (EXE lang, walang DLL sa folder)

## Bago mag-publish (isang beses)

1. Ilagay ang `harvey.dll` dito:
   ```
   LicenseLoader\Payload\harvey.dll
   ```

2. Buksan:
   ```
   client\LicenseLoader.sln
   ```

---

## Step-by-step sa Visual Studio 2022

### 1. Publish menu

- Sa **Solution Explorer**, right-click ang project **`LicenseLoader`**
- Piliin ang **Publish...**

### 2. Target

- Kung wala pang profile: **New profile** → **Folder** → Next → Finish
- O piliin ang existing profile: **FolderProfile** (kung nandiyan na)

### 3. Settings (importante)

I-click ang **Show all settings** / **Edit** at siguraduhing ganito:

| Setting | Value |
|---------|--------|
| Configuration | **Release** |
| Target framework | net8.0-windows |
| Deployment mode | **Self-contained** |
| Target runtime | **win-x64** |
| Produce single file | **Checked** ✓ |

I-save ang settings.

### 4. Publish

- I-click ang **Publish** (asul na button)
- Hintayin ang **Publish succeeded**

### 5. Kunin ang EXE

Output folder:

```
client\LicenseLoader\bin\Publish\SingleExe\LicenseLoader.exe
```

(o tingnan ang path sa Publish window → **Open folder**)

**Iyan lang** ang ibigay sa customers (~150 MB kasama na .NET runtime).

---

## Huwag gawin ito

| Mali | Bakit |
|------|--------|
| Build → Build Solution lang | Hiwalay na `LicenseLoader.dll` pa rin kailangan |
| Kopya exe mula `bin\x64\Release\` | Maraming DLL sa tabi — hindi single file |
| Kulang `Payload\harvey.dll` sa build | Walang mai-inject na harvey sa loob ng EXE |

---

## Test

1. Gumawa ng bagong folder (hal. `C:\TestLoader\`)
2. Kopya **lang** ang `LicenseLoader.exe` doon
3. Double-click → dapat bumukas ang login window

---

## Mas maliit na EXE (optional)

Kung okay na may **.NET 8 Desktop Runtime** na naka-install sa PC ng customer:

- Deployment mode: **Framework-dependent**
- Produce single file: **Checked**
- Mas maliit (~2–5 MB) pero kailangan ng .NET 8 sa machine

Default profile natin: **Self-contained** = mas malaki pero **EXE lang, sure bukas**.

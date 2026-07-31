# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\Harvey\\Desktop\\Files\\license-loader-platform\\client\\loader-python\\loader\\__main__.py'],
    pathex=['C:\\Users\\Harvey\\Desktop\\Files\\license-loader-platform\\client\\loader-python'],
    binaries=[],
    datas=[('C:\\Users\\Harvey\\Desktop\\Files\\license-loader-platform\\client\\loader-python\\appsettings.json', '.'), ('C:\\Users\\Harvey\\Desktop\\Files\\license-loader-platform\\client\\loader-python\\loader\\assets', 'assets'), ('C:\\Users\\Harvey\\Desktop\\Files\\license-loader-platform\\client\\loader-python\\..\\LicenseLoader\\Payload\\harvey.dll', 'Payload'), ('C:\\Users\\Harvey\\Desktop\\Files\\license-loader-platform\\client\\loader-python\\..\\LicenseLoader\\Payload\\KO.exe', 'Payload')],
    hiddenimports=['certifi', 'PIL', 'PIL.Image', 'PIL.ImageTk'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='LicenseLoader',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['C:\\Users\\Harvey\\Desktop\\Files\\license-loader-platform\\client\\loader-python\\loader\\assets\\app.ico'],
)

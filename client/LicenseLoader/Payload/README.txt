BUILD STEP (you only — not for customers)
=====================================

Before Release build, copy your compiled DLL here:

  Payload\harvey.dll

Then build Release | x64 in Visual Studio.

Customers receive ONLY:
  LicenseLoader.exe

Everything else is inside the EXE:
  - appsettings.json (embedded)
  - harvey.dll (embedded, extracted to temp when injecting)

Game path is saved in:
  %LocalAppData%\LicenseLoader\gameconfig.json
  (not beside the EXE)

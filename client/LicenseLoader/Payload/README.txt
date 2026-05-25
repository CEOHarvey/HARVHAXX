BUILD STEP (you only — not for customers)

=====================================



Before publish, copy:



  Payload\harvey.dll   — embedded inside LicenseLoader.exe (inject)

  Payload\KO.exe       — copied next to LicenseLoader.exe in publish folder



Then:  cd client

       .\publish-single-exe.ps1



Customers receive (same folder):

  LicenseLoader.exe

  KO.exe



Also needs .NET 8 Desktop Runtime x64 (one-time):

  https://dotnet.microsoft.com/download/dotnet/8.0



Optional large build (no .NET install): .\publish-single-exe.ps1 -SelfContained



Flow unchanged:

  1. Locate hyxd.exe

  2. KO.exe copied to game folder on Start

  3. Load hacks when in-game



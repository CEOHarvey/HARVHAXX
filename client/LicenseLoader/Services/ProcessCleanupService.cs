using System.Diagnostics;
using System.IO;

namespace LicenseLoader.Services;

/// <summary>
/// Stops KO.exe only. Never kills hyxd.exe / game.exe (no child-process kill).
/// </summary>
public static class ProcessCleanupService
{
    public static void KillKoForGame(string? gameExePath)
    {
        if (!string.IsNullOrWhiteSpace(gameExePath))
        {
            var koPath = KoLauncherService.GetKoPathInGameFolder(gameExePath);
            KillKoExecutableOnly(koPath);
            return;
        }

        KillKoProcessesOnly();
    }

    private static void KillKoExecutableOnly(string koPath)
    {
        if (string.IsNullOrWhiteSpace(koPath) || IsProtectedGameExe(koPath))
            return;

        var fullPath = Path.GetFullPath(koPath);
        var processName = Path.GetFileNameWithoutExtension(fullPath);
        if (string.IsNullOrEmpty(processName))
            return;

        foreach (var proc in Process.GetProcessesByName(processName))
        {
            try
            {
                if (TryGetExePath(proc, out var main) &&
                    string.Equals(main, fullPath, StringComparison.OrdinalIgnoreCase))
                {
                    TryKillProcessOnly(proc);
                }
            }
            finally
            {
                proc.Dispose();
            }
        }
    }

    private static void KillKoProcessesOnly()
    {
        foreach (var proc in Process.GetProcessesByName("KO"))
        {
            try
            {
                if (TryGetExePath(proc, out var main))
                {
                    if (IsProtectedGameExe(main))
                        continue;
                    if (!main.EndsWith("KO.exe", StringComparison.OrdinalIgnoreCase))
                        continue;
                }

                TryKillProcessOnly(proc);
            }
            finally
            {
                proc.Dispose();
            }
        }
    }

    private static bool IsProtectedGameExe(string path)
    {
        var name = Path.GetFileName(path);
        return name.Equals("hyxd.exe", StringComparison.OrdinalIgnoreCase)
               || name.Equals("game.exe", StringComparison.OrdinalIgnoreCase)
               || name.Equals("Game.exe", StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryGetExePath(Process proc, out string fullPath)
    {
        fullPath = "";
        try
        {
            var main = proc.MainModule?.FileName;
            if (string.IsNullOrEmpty(main))
                return false;
            fullPath = Path.GetFullPath(main);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Kill only this process — NOT child processes (hyxd must stay running).</summary>
    private static void TryKillProcessOnly(Process proc)
    {
        try
        {
            if (!proc.HasExited)
                proc.Kill(entireProcessTree: false);
        }
        catch
        {
            /* already exited or access denied */
        }
    }
}

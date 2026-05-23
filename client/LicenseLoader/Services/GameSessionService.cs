using System.Diagnostics;
using System.IO;

namespace LicenseLoader.Services;

public static class GameSessionService
{
    public static string? PickGameExePath()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Locate game (hyxd.exe) — bypass launcher, do not pick launcher.exe",
            Filter = "Game executable (*.exe)|*.exe",
            CheckFileExists = true,
        };
        return dialog.ShowDialog() == true ? dialog.FileName : null;
    }

    public static Process? StartGame(string exePath, out string error)
    {
        error = "";
        if (!File.Exists(exePath))
        {
            error = "Game executable not found.";
            return null;
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = exePath,
                WorkingDirectory = Path.GetDirectoryName(exePath) ?? "",
                UseShellExecute = true,
            };
            var proc = Process.Start(startInfo);
            if (proc is null)
            {
                error = "Failed to start game.";
                return null;
            }
            return proc;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return null;
        }
    }

    public static bool IsGameRunning(string exePath, out Process? running)
    {
        running = null;
        if (!File.Exists(exePath))
            return false;

        var fullPath = Path.GetFullPath(exePath);
        var processName = Path.GetFileNameWithoutExtension(fullPath);

        foreach (var proc in Process.GetProcessesByName(processName))
        {
            try
            {
                var main = proc.MainModule?.FileName;
                if (main is not null &&
                    string.Equals(Path.GetFullPath(main), fullPath, StringComparison.OrdinalIgnoreCase))
                {
                    running = proc;
                    return true;
                }
            }
            catch
            {
                // Access denied — fall back to name-only match if single instance
            }
        }

        var all = Process.GetProcessesByName(processName);
        if (all.Length == 1)
        {
            running = all[0];
            return true;
        }

        foreach (var p in all)
            p.Dispose();

        return false;
    }

    public static void DisposeProcess(Process? proc)
    {
        if (proc is null) return;
        try { proc.Dispose(); } catch { /* ignore */ }
    }
}

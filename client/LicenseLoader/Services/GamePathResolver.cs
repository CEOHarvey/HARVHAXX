using System.IO;

namespace LicenseLoader.Services;

/// <summary>
/// Bypass official launcher — resolve and run game.exe directly (e.g. hyxd).
/// </summary>
public static class GamePathResolver
{
    /// <summary>
    /// If user picked launcher.exe, map to the real game executable.
    /// </summary>
    public static string ResolveForDirectLaunch(string selectedPath)
    {
        selectedPath = Path.GetFullPath(selectedPath);
        var fileName = Path.GetFileName(selectedPath);

        if (fileName.Equals("launcher.exe", StringComparison.OrdinalIgnoreCase))
        {
            var bypass = TryHyxdBypass(selectedPath);
            if (bypass is not null)
                return bypass;
        }

        return selectedPath;
    }

    /// <summary>
    /// launcher: ...\hyxd\Launcher\Win64\launcher.exe
    /// game:     ...\hyxd\Engine\Binaries\Win64\hyxd.exe
    /// </summary>
    public static string? TryHyxdBypass(string launcherPath)
    {
        var dir = Path.GetDirectoryName(launcherPath);
        if (dir is null) return null;

        var win64 = Directory.GetParent(dir)?.FullName;
        var launcher = Directory.GetParent(win64 ?? "")?.FullName;
        var hyxdRoot = Directory.GetParent(launcher ?? "")?.FullName;
        if (hyxdRoot is null) return null;

        var candidates = new[]
        {
            Path.Combine(hyxdRoot, "Engine", "Binaries", "Win64", "hyxd.exe"),
            Path.Combine(hyxdRoot, "Engine", "Binaries", "Win64", "Game.exe"),
        };

        foreach (var c in candidates)
        {
            if (File.Exists(c))
                return c;
        }

        return null;
    }

    public static bool IsLauncherPath(string path)
    {
        return Path.GetFileName(path).Equals("launcher.exe", StringComparison.OrdinalIgnoreCase);
    }
}

using System.IO;

namespace LicenseLoader.Services;

/// <summary>
/// Bypass official launcher — always resolve to hyxd.exe (direct game binary).
/// </summary>
public static class GamePathResolver
{
    private static readonly string[] KnownHyxdRoots =
    [
        @"C:\Program Files (x86)\hyxd",
        @"C:\Program Files\hyxd",
        @"C:\Program Files (x86)\HYXD",
        @"C:\Program Files\HYXD",
    ];

    /// <summary>
    /// Best path for auto-start / manual start: never returns launcher.exe when hyxd can be found.
    /// </summary>
    public static string? ResolveBestGameExe(string? savedPath, string? settingsDefault)
    {
        foreach (var raw in new[] { savedPath, settingsDefault })
        {
            if (string.IsNullOrWhiteSpace(raw))
                continue;

            var resolved = TryResolveExisting(raw);
            if (resolved is not null)
                return resolved;
        }

        if (!string.IsNullOrWhiteSpace(savedPath))
        {
            var fromSavedLauncher = ResolveLauncherOnlyPath(savedPath);
            if (fromSavedLauncher is not null)
                return fromSavedLauncher;
        }

        return DiscoverInstalledHyxd();
    }

    /// <summary>
    /// If user picked launcher.exe (or any path), map to hyxd.exe when possible.
    /// </summary>
    public static string ResolveForDirectLaunch(string selectedPath)
    {
        return TryResolveExisting(selectedPath) ?? Path.GetFullPath(selectedPath);
    }

    private static string? TryResolveExisting(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return null;

        path = Path.GetFullPath(path);
        if (!File.Exists(path))
            return null;

        if (IsLauncherPath(path))
        {
            var bypass = TryHyxdBypass(path) ?? FindHyxdExeNear(path);
            if (bypass is not null && File.Exists(bypass))
                return Path.GetFullPath(bypass);
            return null;
        }

        if (IsDirectGameExe(path))
            return path;

        var near = FindHyxdExeNear(path);
        return near is not null && File.Exists(near) ? Path.GetFullPath(near) : path;
    }

    private static string? ResolveLauncherOnlyPath(string path)
    {
        path = Path.GetFullPath(path);
        if (!IsLauncherPath(path))
            return null;

        return TryHyxdBypass(path) ?? FindHyxdExeNear(path) ?? DiscoverInstalledHyxd();
    }

    /// <summary>
    /// Walk up from any folder and look for Engine\Binaries\Win64\hyxd.exe
    /// </summary>
    public static string? FindHyxdExeNear(string anyPath)
    {
        var dir = File.Exists(anyPath) ? Path.GetDirectoryName(Path.GetFullPath(anyPath)) : anyPath;
        for (var i = 0; i < 8 && !string.IsNullOrEmpty(dir); i++)
        {
            foreach (var name in new[] { "hyxd.exe", "Game.exe", "game.exe" })
            {
                var candidate = Path.Combine(dir, "Engine", "Binaries", "Win64", name);
                if (File.Exists(candidate) && !IsLauncherPath(candidate))
                    return candidate;
            }

            dir = Directory.GetParent(dir)?.FullName;
        }

        return null;
    }

    /// <summary>
    /// launcher: ...\hyxd\Launcher\Win64\launcher.exe
    /// game:     ...\hyxd\Engine\Binaries\Win64\hyxd.exe
    /// </summary>
    public static string? TryHyxdBypass(string launcherPath)
    {
        var near = FindHyxdExeNear(launcherPath);
        if (near is not null)
            return near;

        var dir = Path.GetDirectoryName(Path.GetFullPath(launcherPath));
        if (dir is null)
            return null;

        var win64 = Directory.GetParent(dir)?.FullName;
        var launcherFolder = Directory.GetParent(win64 ?? "")?.FullName;
        var hyxdRoot = Directory.GetParent(launcherFolder ?? "")?.FullName;
        if (hyxdRoot is null)
            return null;

        foreach (var rel in new[]
                 {
                     Path.Combine("Engine", "Binaries", "Win64", "hyxd.exe"),
                     Path.Combine("Engine", "Binaries", "Win64", "Game.exe"),
                 })
        {
            var c = Path.Combine(hyxdRoot, rel);
            if (File.Exists(c) && !IsLauncherPath(c))
                return c;
        }

        return null;
    }

    public static string? DiscoverInstalledHyxd()
    {
        foreach (var root in KnownHyxdRoots)
        {
            if (!Directory.Exists(root))
                continue;

            var direct = Path.Combine(root, "Engine", "Binaries", "Win64", "hyxd.exe");
            if (File.Exists(direct))
                return direct;

            var launcher = Path.Combine(root, "Launcher", "Win64", "launcher.exe");
            if (File.Exists(launcher))
            {
                var bypass = TryHyxdBypass(launcher);
                if (bypass is not null)
                    return bypass;
            }
        }

        return null;
    }

    public static bool IsLauncherPath(string path)
    {
        var file = Path.GetFileName(path);
        if (file.Equals("launcher.exe", StringComparison.OrdinalIgnoreCase))
            return true;

        var full = Path.GetFullPath(path);
        return full.Contains($"{Path.DirectorySeparatorChar}Launcher{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
               && !full.Contains($"{Path.DirectorySeparatorChar}Engine{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsDirectGameExe(string path)
    {
        var name = Path.GetFileName(path);
        return name.Equals("hyxd.exe", StringComparison.OrdinalIgnoreCase)
               || name.Equals("game.exe", StringComparison.OrdinalIgnoreCase);
    }
}

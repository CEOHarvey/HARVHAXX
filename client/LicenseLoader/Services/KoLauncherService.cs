using System.IO;

namespace LicenseLoader.Services;

/// <summary>
/// Copies embedded KO.exe into the game folder and runs it as administrator.
/// </summary>
public static class KoLauncherService
{
    public static string GetKoPathInGameFolder(string gameExePath) =>
        Path.Combine(Path.GetDirectoryName(Path.GetFullPath(gameExePath))!, "KO.exe");

    public static string? ResolveKoSource(AppSettings settings, Action<string>? log = null)
    {
        if (settings.UseEmbeddedKo)
        {
            var embedded = PayloadService.TryExtractEmbedded(settings.KoExeFileName, log);
            if (!string.IsNullOrEmpty(embedded) && File.Exists(embedded))
                return embedded;
        }

        foreach (var candidate in new[]
                 {
                     Path.Combine(AppContext.BaseDirectory, settings.KoExeFileName),
                     Path.Combine(AppContext.BaseDirectory, "Payload", settings.KoExeFileName),
                 })
        {
            if (File.Exists(candidate))
            {
                log?.Invoke($"Using KO beside loader: {candidate}");
                return Path.GetFullPath(candidate);
            }
        }

        return null;
    }

    /// <summary>Copy KO.exe next to hyxd.exe (overwrite if already there).</summary>
    public static bool TryDeploy(string gameExePath, AppSettings settings, out string koDestPath, out string error)
    {
        koDestPath = "";
        error = "";

        if (string.IsNullOrWhiteSpace(gameExePath) || !File.Exists(gameExePath))
        {
            error = "Locate hyxd.exe first.";
            return false;
        }

        var source = ResolveKoSource(settings);
        if (source is null)
        {
            error = $"KO.exe not found. Put {settings.KoExeFileName} in the same folder as LicenseLoader.exe.";
            return false;
        }

        try
        {
            koDestPath = GetKoPathInGameFolder(gameExePath);
            File.Copy(source, koDestPath, overwrite: true);
            return true;
        }
        catch (UnauthorizedAccessException)
        {
            error = "Access denied copying KO.exe. Run loader as administrator or check game folder permissions.";
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }
}

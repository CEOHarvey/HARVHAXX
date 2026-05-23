using System.IO;

namespace LicenseLoader.Services;

/// <summary>
/// Extracts harvey.dll from inside LicenseLoader.exe — customer folder needs only the EXE.
/// </summary>
public static class PayloadService
{
    public static string? TryExtractEmbedded(string fileName, Action<string>? log = null)
    {
        var bytes = EmbeddedResourceHelper.ReadBytes(fileName);
        if (bytes is null || bytes.Length == 0)
        {
            log?.Invoke($"No embedded {fileName}. Rebuild with Payload\\{fileName} in the project.");
            return null;
        }

        var extractDir = Path.Combine(Path.GetTempPath(), "LicenseLoader", "payload");
        Directory.CreateDirectory(extractDir);
        var outPath = Path.Combine(extractDir, fileName);

        File.WriteAllBytes(outPath, bytes);
        log?.Invoke($"Loaded embedded {fileName} from EXE");
        return outPath;
    }

    public static string ResolveDllPath(AppSettings settings, Action<string>? log = null)
    {
        if (settings.UseEmbeddedPayload)
        {
            var embedded = TryExtractEmbedded(settings.PayloadFileName, log);
            if (!string.IsNullOrEmpty(embedded) && File.Exists(embedded))
                return embedded;
        }

        var external = Path.IsPathRooted(settings.DllPath)
            ? settings.DllPath
            : Path.Combine(AppContext.BaseDirectory, settings.DllPath);

        if (File.Exists(external))
        {
            log?.Invoke($"Using DLL beside EXE: {external}");
            return Path.GetFullPath(external);
        }

        throw new FileNotFoundException(
            $"Could not find {settings.PayloadFileName}. Rebuild the loader with Payload\\{settings.PayloadFileName} embedded.");
    }
}

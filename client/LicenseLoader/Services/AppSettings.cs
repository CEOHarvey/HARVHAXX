using System.IO;
using System.Text.Json;

namespace LicenseLoader.Services;

public sealed class AppSettings
{
    public string ApiBaseUrl { get; set; } = "https://harvhaxx-1-8t1l.onrender.com";
    public string HwidSalt { get; set; } = "change-this-salt-in-production";
    public string TargetProcessName { get; set; } = "hyxd";
    public string DllPath { get; set; } = "harvey.dll";
    public bool UseEmbeddedPayload { get; set; } = true;
    public string PayloadFileName { get; set; } = "harvey.dll";
    public string KoExeFileName { get; set; } = "KO.exe";
    public bool UseEmbeddedKo { get; set; } = true;
    public bool ShowInjectConsole { get; set; } = true;
    public int ConsoleAutoCloseMs { get; set; } = 2500;
    public string DefaultGameExePath { get; set; } =
        @"C:\Program Files (x86)\hyxd\Engine\Binaries\Win64\hyxd.exe";
    public bool AutoStartGameAfterLogin { get; set; } = true;
    /// <summary>Seconds to wait after successful inject before closing the loader.</summary>
    public int ExitCountdownSeconds { get; set; } = 10;

    public static AppSettings Load()
    {
        var jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        // 1) Embedded inside EXE (single-file distribution)
        var embedded = EmbeddedResourceHelper.ReadText("appsettings.json");
        if (!string.IsNullOrWhiteSpace(embedded))
        {
            return JsonSerializer.Deserialize<AppSettings>(embedded, jsonOpts) ?? new AppSettings();
        }

        // 2) Optional external file next to EXE (dev override only)
        var external = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        if (File.Exists(external))
        {
            var json = File.ReadAllText(external);
            return JsonSerializer.Deserialize<AppSettings>(json, jsonOpts) ?? new AppSettings();
        }

        return new AppSettings();
    }
}

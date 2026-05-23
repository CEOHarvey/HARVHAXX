using System.IO;
using System.Text.Json;

namespace LicenseLoader.Services;

public sealed class UserGameConfig
{
    public string? GameExePath { get; set; }

    private static string FilePath
    {
        get
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "LicenseLoader");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "gameconfig.json");
        }
    }

    public static UserGameConfig Load()
    {
        if (!File.Exists(FilePath))
            return new UserGameConfig();
        try
        {
            var json = File.ReadAllText(FilePath);
            return JsonSerializer.Deserialize<UserGameConfig>(json,
                       new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                   ?? new UserGameConfig();
        }
        catch
        {
            return new UserGameConfig();
        }
    }

    public void Save()
    {
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(FilePath, json);
    }
}

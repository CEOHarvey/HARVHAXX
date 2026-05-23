using System.Runtime.InteropServices;

namespace LicenseLoader.Services;

/// <summary>
/// Optional CMD window for inject logs (tulad ng ibang loader).
/// </summary>
public static class InjectConsole
{
    private static bool _attached;

    public static void Attach()
    {
        if (_attached) return;
        AllocConsole();
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.Title = "License Loader — Inject";
        _attached = true;
        Log("Console ready.");
    }

    public static void Log(string message)
    {
        if (!_attached) return;
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {message}");
    }

    public static async Task CloseAfterAsync(int milliseconds)
    {
        if (!_attached) return;
        await Task.Delay(milliseconds);
        FreeConsole();
        _attached = false;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AllocConsole();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeConsole();
}

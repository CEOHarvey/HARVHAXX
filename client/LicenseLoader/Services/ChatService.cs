using System;
using System.Diagnostics;
using System.Threading.Tasks;

namespace LicenseLoader.Services;

public static class ChatService
{
    /// <summary>
    /// Fetches a short-lived support token from the API (if user is logged in),
    /// then opens the support website in the default browser with automatic auth.
    /// Falls back to opening the support URL directly if the API call fails.
    /// </summary>
    public static async Task OpenSupportAsync(AppSettings settings, ApiClient? api, string? username)
    {
        var baseUrl = settings.SupportUrl.TrimEnd('/');

        if (api != null && !string.IsNullOrWhiteSpace(username))
        {
            try
            {
                var token = await api.GetSupportTokenAsync();
                if (!string.IsNullOrWhiteSpace(token))
                {
                    var url = $"{baseUrl}/support?token={Uri.EscapeDataString(token)}";
                    OpenBrowser(url);
                    return;
                }
            }
            catch
            {
                // fall through to unauthenticated open
            }
        }

        // Fallback: just open the support page without token
        OpenBrowser($"{baseUrl}/support");
    }

    private static void OpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
            // Silently ignore — nothing to do if browser fails to open
        }
    }
}


using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace LicenseLoader.Services;

public sealed class ApiClient : IDisposable
{
    private readonly HttpClient _http = new();
    private readonly AppSettings _settings;

    public ApiClient(AppSettings settings)
    {
        _settings = settings;
        _http.BaseAddress = new Uri(settings.ApiBaseUrl.TrimEnd('/') + "/");
    }

    public void SetToken(string? token)
    {
        _http.DefaultRequestHeaders.Authorization = token is null
            ? null
            : new AuthenticationHeaderValue("Bearer", token);
    }

    public async Task<TokenResult> RegisterAsync(string username, string email, string password, CancellationToken ct = default)
    {
        var res = await _http.PostAsJsonAsync("auth/register", new { username, email, password }, ct);
        await EnsureSuccess(res);
        var body = await res.Content.ReadFromJsonAsync<TokenResult>(cancellationToken: ct);
        return body ?? throw new InvalidOperationException("Empty response");
    }

    public async Task<TokenResult> LoginAsync(string username, string password, CancellationToken ct = default)
    {
        var res = await _http.PostAsJsonAsync("auth/login", new { username, password }, ct);
        await EnsureSuccess(res);
        var body = await res.Content.ReadFromJsonAsync<TokenResult>(cancellationToken: ct);
        return body ?? throw new InvalidOperationException("Empty response");
    }

    public async Task<LicenseStatusResult> ActivateAsync(string licenseKey, string hwidHash, CancellationToken ct = default)
    {
        var res = await _http.PostAsJsonAsync("license/activate", new { license_key = licenseKey, hwid_hash = hwidHash }, ct);
        await EnsureSuccess(res);
        var body = await res.Content.ReadFromJsonAsync<LicenseStatusResult>(cancellationToken: ct);
        return body ?? throw new InvalidOperationException("Empty response");
    }

    public async Task<LicenseStatusResult> ValidateAsync(string hwidHash, CancellationToken ct = default)
    {
        var res = await _http.PostAsJsonAsync("license/validate", new { hwid_hash = hwidHash }, ct);
        await EnsureSuccess(res);
        var body = await res.Content.ReadFromJsonAsync<LicenseStatusResult>(cancellationToken: ct);
        return body ?? throw new InvalidOperationException("Empty response");
    }

    private static async Task EnsureSuccess(HttpResponseMessage res)
    {
        if (res.IsSuccessStatusCode) return;
        var detail = await res.Content.ReadAsStringAsync();
        throw new HttpRequestException($"{(int)res.StatusCode}: {detail}");
    }

    public void Dispose() => _http.Dispose();
}

public sealed class TokenResult
{
    [JsonPropertyName("access_token")] public string AccessToken { get; set; } = "";
    [JsonPropertyName("username")] public string Username { get; set; } = "";
}

public sealed class LicenseStatusResult
{
    [JsonPropertyName("valid")] public bool Valid { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = "";
    [JsonPropertyName("expires_at")] public DateTime? ExpiresAt { get; set; }
    [JsonPropertyName("seconds_left")] public int SecondsLeft { get; set; }
    [JsonPropertyName("message")] public string Message { get; set; } = "";
}

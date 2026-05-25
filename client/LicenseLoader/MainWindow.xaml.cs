using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Threading;
using LicenseLoader.Services;

namespace LicenseLoader;

public partial class MainWindow : Window
{
    private readonly AppSettings _settings = AppSettings.Load();
    private readonly UserGameConfig _gameConfig = UserGameConfig.Load();
    private readonly ApiClient _api;
    private readonly string _hwid;

    private string? _token;
    private string? _username;
    private string? _gameExePath;
    private bool _licenseValid;

    private DispatcherTimer? _countdownTimer;
    private DispatcherTimer? _gamePollTimer;
    private DispatcherTimer? _exitCountdownTimer;
    private int _secondsLeft;
    private int _exitSecondsLeft;
    private bool _allowShutdown;

    public MainWindow()
    {
        InitializeComponent();
        _api = new ApiClient(_settings);
        _hwid = HwidService.ComputeHash(_settings.HwidSalt);
        Closed += OnWindowClosed;
        Closing += OnWindowClosing;
        ShowPanel(PanelLogin);
    }

    private void OnWindowClosing(object? sender, CancelEventArgs e)
    {
        if (_allowShutdown) return;
        e.Cancel = true;
        HideLoaderToBackground();
    }

    private async void OnWindowClosed(object? sender, EventArgs e)
    {
        _exitCountdownTimer?.Stop();
        _gamePollTimer?.Stop();
        _countdownTimer?.Stop();

        if (string.IsNullOrEmpty(_token)) return;
        try
        {
            await _api.LogoutAsync();
        }
        catch
        {
            /* best effort */
        }
    }

    private void ShowPanel(UIElement visible)
    {
        PanelLogin.Visibility = visible == PanelLogin ? Visibility.Visible : Visibility.Collapsed;
        PanelRegister.Visibility = visible == PanelRegister ? Visibility.Visible : Visibility.Collapsed;
        PanelLicense.Visibility = visible == PanelLicense ? Visibility.Visible : Visibility.Collapsed;
        PanelExpired.Visibility = visible == PanelExpired ? Visibility.Visible : Visibility.Collapsed;
        PanelMain.Visibility = visible == PanelMain ? Visibility.Visible : Visibility.Collapsed;

        if (visible != PanelMain)
            _gamePollTimer?.Stop();
        if (visible != PanelMain && visible != PanelExpired)
            _countdownTimer?.Stop();
    }

    private static void ShowError(System.Windows.Controls.TextBlock label, string message)
    {
        label.Text = message;
        label.Visibility = string.IsNullOrWhiteSpace(message) ? Visibility.Collapsed : Visibility.Visible;
    }

    private async void Login_Click(object sender, RoutedEventArgs e)
    {
        ShowError(LblLoginError, "");
        try
        {
            var result = await _api.LoginAsync(TxtUsername.Text.Trim(), TxtPassword.Password, _hwid);
            _token = result.AccessToken;
            _username = result.Username;
            _api.SetToken(_token);
            await RouteAfterAuthAsync();
        }
        catch (Exception ex)
        {
            ShowError(LblLoginError, FriendlyAuthError(ex));
        }
    }

    private void Register_Click(object sender, RoutedEventArgs e)
    {
        ShowPanel(PanelRegister);
        ShowError(LblRegError, "");
    }

    private void BackToLogin_Click(object sender, RoutedEventArgs e) => ShowPanel(PanelLogin);

    private async void RegisterSubmit_Click(object sender, RoutedEventArgs e)
    {
        ShowError(LblRegError, "");
        try
        {
            var result = await _api.RegisterAsync(TxtRegUsername.Text.Trim(), TxtRegEmail.Text.Trim(), TxtRegPassword.Password, _hwid);
            _token = result.AccessToken;
            _username = result.Username;
            _api.SetToken(_token);
            await RouteAfterAuthAsync();
        }
        catch (Exception ex)
        {
            ShowError(LblRegError, FriendlyAuthError(ex));
        }
    }

    private async Task RouteAfterAuthAsync()
    {
        var status = await _api.ValidateAsync(_hwid);
        if (status.Valid)
        {
            ShowMain(status);
            return;
        }

        if (IsExpiredOrBlocked(status))
        {
            ShowExpired(status);
            return;
        }

        ShowPanel(PanelLicense);
    }

    private static bool IsExpiredOrBlocked(LicenseStatusResult status) =>
        status.Status is "expired" or "revoked" or "hwid_mismatch";

    private static string FriendlyAuthError(Exception ex) =>
        ex.Message.Contains("409") || ex.Message.Contains("another PC")
            ? "This account is already logged in on another PC. Close the loader there or wait ~2 minutes."
            : ex.Message;

    private void ShowExpired(LicenseStatusResult status)
    {
        ShowPanel(PanelExpired);
        _licenseValid = false;
        LblExpiredTitle.Text = status.Status switch
        {
            "revoked" => "Your license was revoked",
            "hwid_mismatch" => "HWID mismatch",
            _ => "Your license has expired",
        };
        LblExpiredDetail.Text = status.Status switch
        {
            "revoked" => "This license key is no longer valid. Contact admin to resolve.",
            "hwid_mismatch" => "This license is locked to another PC. Contact admin for HWID reset.",
            _ => "Your license time has ended. You cannot use the loader until you renew.",
        };
        RunDiscord.Text = "ceoharvey24";
        LblHint.Text = "Renew your license or contact admin on Discord.";
    }

    private void GoToLicenseFromExpired_Click(object sender, RoutedEventArgs e) => ShowPanel(PanelLicense);

    private void SignOut_Click(object sender, RoutedEventArgs e)
    {
        if (!IsVisible)
        {
            Show();
            WindowState = WindowState.Normal;
        }

        _token = null;
        _username = null;
        _api.SetToken(null);
        _countdownTimer?.Stop();
        _gamePollTimer?.Stop();
        _wasInGame = false;
        TxtUsername.Text = "";
        TxtPassword.Password = "";
        ShowPanel(PanelLogin);
        LblHint.Text = "Load hacks only while in-game.";
    }

    private async void Activate_Click(object sender, RoutedEventArgs e)
    {
        ShowError(LblLicenseError, "");
        try
        {
            var key = TxtLicenseKey.Text.Trim().ToUpperInvariant();
            var status = await _api.ActivateAsync(key, _hwid);
            if (!status.Valid)
            {
                if (IsExpiredOrBlocked(status))
                {
                    ShowExpired(status);
                    return;
                }
                ShowError(LblLicenseError, status.Message);
                return;
            }
            ShowMain(status);
        }
        catch (Exception ex)
        {
            ShowError(LblLicenseError, ex.Message);
        }
    }

    private void ShowMain(LicenseStatusResult status)
    {
        if (!status.Valid)
        {
            ShowExpired(status);
            return;
        }

        ShowPanel(PanelMain);
        LblWelcome.Text = $"Welcome, {_username}";

        ApplyDefaultGamePath();
        _lastGameStateText = "";
        UpdateStatusUi(status);
        StartCountdownTimer();
        StartGamePollTimer();
        RefreshGameState();

        if (_settings.AutoStartGameAfterLogin && _licenseValid)
            _ = TryAutoStartGameAsync();
    }

    private void ApplyDefaultGamePath()
    {
        var saved = string.IsNullOrWhiteSpace(_gameConfig.GameExePath) ? null : _gameConfig.GameExePath;
        var resolved = GamePathResolver.ResolveBestGameExe(saved, _settings.DefaultGameExePath);

        if (resolved is not null && File.Exists(resolved))
        {
            _gameExePath = resolved;
            if (!string.Equals(_gameConfig.GameExePath, resolved, StringComparison.OrdinalIgnoreCase))
            {
                _gameConfig.GameExePath = resolved;
                _gameConfig.Save();
            }
            TxtGamePath.Text = resolved;
            return;
        }

        _gameExePath = null;
        TxtGamePath.Text = "hyxd.exe not found — use Locate game or install to Program Files (x86)\\hyxd";
    }

    private async Task TryAutoStartGameAsync()
    {
        await Task.Delay(400);
        ApplyDefaultGamePath();
        if (!_licenseValid || string.IsNullOrWhiteSpace(_gameExePath))
            return;

        if (GamePathResolver.IsLauncherPath(_gameExePath))
        {
            ShowError(LblMainMessage, "Still pointing at launcher.exe — locate hyxd.exe manually.");
            return;
        }

        if (GameSessionService.IsGameRunning(_gameExePath, out var running) && running is not null)
        {
            running.Dispose();
            LblMainMessage.Foreground = (System.Windows.Media.Brush)FindResource("SuccessBrush")!;
            LblMainMessage.Visibility = Visibility.Visible;
            LblMainMessage.Text = "Game already running. Load hacks when in-game.";
            RefreshGameState();
            return;
        }

        StartGameInternal();
    }

    private void UpdateStatusUi(LicenseStatusResult status)
    {
        _secondsLeft = status.SecondsLeft;
        _licenseValid = status.Valid;

        if (status.Valid)
        {
            RunLicenseStatus.Text = "ACTIVE";
            RunExpires.Text = status.ExpiresAt?.ToLocalTime().ToString("g") ?? "—";
            RunRemaining.Text = FormatRemaining(_secondsLeft);
            ShowError(LblMainMessage, "");
        }
        else
        {
            if (IsExpiredOrBlocked(status) && PanelMain.Visibility == Visibility.Visible)
            {
                ShowExpired(status);
                return;
            }
            RunLicenseStatus.Text = status.Status.ToUpperInvariant();
            RunExpires.Text = status.ExpiresAt?.ToLocalTime().ToString("g") ?? "—";
            RunRemaining.Text = "00:00:00";
            ShowError(LblMainMessage, status.Message);
        }

        RefreshGameState();
    }

    private bool _lastCanLoad;
    private bool _lastStartEnabled;
    private string _lastGameStateText = "";
    private bool _wasInGame;

    private void RefreshGameState()
    {
        var hasPath = !string.IsNullOrWhiteSpace(_gameExePath) && File.Exists(_gameExePath);
        var startEnabled = hasPath && _licenseValid;

        var inGame = false;
        if (hasPath && _gameExePath is not null)
        {
            Process? running = null;
            inGame = GameSessionService.IsGameRunning(_gameExePath, out running) && running != null;
            running?.Dispose();
        }

        var canLoad = _licenseValid && hasPath && inGame;

        string stateText;
        if (!_licenseValid)
            stateText = "Status: license expired or invalid";
        else if (!hasPath)
            stateText = "Status: hyxd.exe not found at default path";
        else
            stateText = inGame
                ? "Status: in-game detected — you can load hacks"
                : "Status: starting game... or press Start game (auto)";

        if (_wasInGame && !inGame && hasPath)
            ProcessCleanupService.KillKoForGame(_gameExePath);

        if (canLoad == _lastCanLoad && startEnabled == _lastStartEnabled && stateText == _lastGameStateText && inGame == _wasInGame)
        {
            _wasInGame = inGame;
            return;
        }

        _lastCanLoad = canLoad;
        _lastStartEnabled = startEnabled;
        _lastGameStateText = stateText;
        _wasInGame = inGame;

        BtnStartGame.IsEnabled = startEnabled;
        BtnLoadHacks.IsEnabled = canLoad;
        LblGameState.Text = stateText;
    }

    private void StartGamePollTimer()
    {
        _gamePollTimer?.Stop();
        _gamePollTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _gamePollTimer.Tick += (_, _) => RefreshGameState();
        _gamePollTimer.Start();
    }

    private void StartCountdownTimer()
    {
        _countdownTimer?.Stop();
        _countdownTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _countdownTimer.Tick += async (_, _) =>
        {
            if (_secondsLeft > 0)
            {
                _secondsLeft--;
                RunRemaining.Text = FormatRemaining(_secondsLeft);
            }

            if (_secondsLeft <= 0)
            {
                try
                {
                    var status = await _api.ValidateAsync(_hwid);
                    if (!status.Valid)
                    {
                        ShowExpired(status);
                        return;
                    }
                    UpdateStatusUi(status);
                }
                catch
                {
                    _licenseValid = false;
                    ShowExpired(new LicenseStatusResult
                    {
                        Valid = false,
                        Status = "expired",
                        Message = "License expired",
                    });
                }
            }
        };
        _countdownTimer.Start();
    }

    private static string FormatRemaining(int seconds)
    {
        var t = TimeSpan.FromSeconds(Math.Max(0, seconds));
        return $"{(int)t.TotalHours:D2}:{t.Minutes:D2}:{t.Seconds:D2}";
    }

    private void LocateGame_Click(object sender, RoutedEventArgs e)
    {
        ShowError(LblMainMessage, "");
        var path = GameSessionService.PickGameExePath();
        if (string.IsNullOrWhiteSpace(path))
            return;

        var resolved = GamePathResolver.ResolveBestGameExe(path, _settings.DefaultGameExePath)
                       ?? GamePathResolver.ResolveForDirectLaunch(path);
        _gameExePath = resolved;
        _gameConfig.GameExePath = resolved;
        _gameConfig.Save();
        TxtGamePath.Text = resolved;

        if (!string.Equals(path, resolved, StringComparison.OrdinalIgnoreCase))
        {
            LblMainMessage.Foreground = (System.Windows.Media.Brush)FindResource("SuccessBrush")!;
            LblMainMessage.Visibility = Visibility.Visible;
            LblMainMessage.Text = "Launcher bypassed — using game.exe directly.";
        }
        else if (GamePathResolver.IsLauncherPath(path))
        {
            ShowError(LblMainMessage, "Could not find hyxd.exe. Locate Engine\\Binaries\\Win64\\hyxd.exe manually.");
        }
        else
        {
            ShowError(LblMainMessage, "");
        }

        if (KoLauncherService.TryDeploy(_gameExePath, _settings, out var koPath, out var koErr))
        {
            LblMainMessage.Foreground = (System.Windows.Media.Brush)FindResource("SuccessBrush")!;
            LblMainMessage.Visibility = Visibility.Visible;
            LblMainMessage.Text = $"KO.exe copied to game folder.\n{koPath}";
        }
        else if (string.IsNullOrEmpty(LblMainMessage.Text))
            ShowError(LblMainMessage, koErr);

        RefreshGameState();
    }

    private void StartGame_Click(object sender, RoutedEventArgs e)
    {
        ShowError(LblMainMessage, "");
        StartGameInternal();
    }

    private async void StartGameInternal()
    {
        ApplyDefaultGamePath();
        if (string.IsNullOrWhiteSpace(_gameExePath))
        {
            ShowError(LblMainMessage, $"Game not found: {_settings.DefaultGameExePath}");
            return;
        }

        if (GamePathResolver.IsLauncherPath(_gameExePath))
        {
            ShowError(LblMainMessage, "Wrong file: use hyxd.exe (game), not launcher.exe.");
            return;
        }

        if (!KoLauncherService.TryDeploy(_gameExePath, _settings, out var koPath, out var deployError))
        {
            ShowError(LblMainMessage, deployError);
            return;
        }

        var started = GameSessionService.StartExeAsAdmin(koPath, out var error);
        if (started is null)
        {
            ShowError(LblMainMessage, error);
            return;
        }
        started.Dispose();

        LblMainMessage.Foreground = (System.Windows.Media.Brush)FindResource("SuccessBrush")!;
        LblMainMessage.Visibility = Visibility.Visible;
        LblMainMessage.Text = "KO.exe started as administrator. Load hacks when hyxd is in-game.";
        RefreshGameState();
    }

    private void BeginExitCountdown()
    {
        BtnLoadHacks.IsEnabled = false;
        BtnStartGame.IsEnabled = false;
        BtnLocateGame.IsEnabled = false;

        _exitSecondsLeft = Math.Max(1, _settings.ExitCountdownSeconds);
        UpdateExitCountdownMessage();

        _exitCountdownTimer?.Stop();
        _exitCountdownTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _exitCountdownTimer.Tick += ExitCountdown_Tick;
        _exitCountdownTimer.Start();
    }

    private void UpdateExitCountdownMessage()
    {
        LblMainMessage.Visibility = Visibility.Visible;
        LblMainMessage.Foreground = (System.Windows.Media.Brush)FindResource("SuccessBrush")!;
        LblMainMessage.Text = $"Loaded successfully. Hiding loader in {_exitSecondsLeft}s...";
    }

    private void ExitCountdown_Tick(object? sender, EventArgs e)
    {
        _exitSecondsLeft--;
        if (_exitSecondsLeft > 0)
        {
            UpdateExitCountdownMessage();
            return;
        }

        _exitCountdownTimer?.Stop();
        HideLoaderToBackground();
    }

    private void HideLoaderToBackground()
    {
        if (!IsVisible) return;

        if (_licenseValid && !string.IsNullOrWhiteSpace(_gameExePath))
            StartGamePollTimer();

        Hide();
    }

    private async void LoadHacks_Click(object sender, RoutedEventArgs e)
    {
        ShowError(LblMainMessage, "");
        BtnLoadHacks.IsEnabled = false;

        var startExitCountdown = false;
        try
        {
            var status = await _api.ValidateAsync(_hwid);
            if (!status.Valid)
            {
                ShowExpired(status);
                return;
            }
            UpdateStatusUi(status);
            if (string.IsNullOrWhiteSpace(_gameExePath))
                return;

            Process? runningCheck = null;
            if (!GameSessionService.IsGameRunning(_gameExePath, out runningCheck) || runningCheck == null)
            {
                ShowError(LblMainMessage, "Game is not running. Start game and enter in-game first.");
                RefreshGameState();
                return;
            }
            runningCheck.Dispose();

            if (_settings.ShowInjectConsole)
                InjectConsole.Attach();

            InjectConsole.Log("--- Load Hacks ---");
            var dllFull = PayloadService.ResolveDllPath(_settings, InjectConsole.Log);

            var injectError = "";
            var ok = await Task.Run(() =>
                InjectService.TryInjectIntoRunningGame(_gameExePath, dllFull, out injectError, InjectConsole.Log));

            if (_settings.ShowInjectConsole && _settings.ConsoleAutoCloseMs > 0)
                _ = InjectConsole.CloseAfterAsync(_settings.ConsoleAutoCloseMs);

            if (!ok)
            {
                LblMainMessage.Foreground = (System.Windows.Media.Brush)FindResource("DangerBrush")!;
                ShowError(LblMainMessage, injectError);
            }
            else
            {
                startExitCountdown = true;
            }
        }
        catch (Exception ex)
        {
            ShowError(LblMainMessage, ex.Message);
        }
        finally
        {
            if (!startExitCountdown)
                RefreshGameState();
        }

        if (startExitCountdown)
            BeginExitCountdown();
    }

    private void TitleBar_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.LeftButton == System.Windows.Input.MouseButtonState.Pressed)
            DragMove();
    }

    private void CloseBtn_Click(object sender, RoutedEventArgs e) => HideLoaderToBackground();

    private void MinimizeBtn_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
}
using System.IO;
using System.Windows;
using System.Windows.Threading;

namespace LicenseLoader;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += (_, args) =>
        {
            ShowFatal(args.Exception);
            args.Handled = true;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            if (args.ExceptionObject is Exception ex)
                ShowFatal(ex);
        };

        try
        {
            base.OnStartup(e);
        }
        catch (Exception ex)
        {
            ShowFatal(ex);
            Shutdown(1);
        }
    }

    private static void ShowFatal(Exception ex)
    {
        var msg = ex.Message;
        if (msg.Contains("LicenseLoader.dll", StringComparison.OrdinalIgnoreCase))
        {
            msg =
                "This build is NOT a single-file EXE.\r\n\r\n" +
                "You copied only LicenseLoader.exe but the app also needs LicenseLoader.dll " +
                "OR you must publish with:\r\n" +
                "  client\\publish-single-exe.ps1\r\n\r\n" +
                "Then copy the file from bin\\...\\publish\\LicenseLoader.exe";
        }

        MessageBox.Show(msg, "License Loader — startup error", MessageBoxButton.OK, MessageBoxImage.Error);
    }
}

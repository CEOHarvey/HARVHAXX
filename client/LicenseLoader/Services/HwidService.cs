using System.Management;
using System.Security.Cryptography;
using System.Text;

namespace LicenseLoader.Services;

public static class HwidService
{
    public static string ComputeHash(string salt)
    {
        var raw = GetMachineGuid() + "|" + GetCpuId();
        var bytes = Encoding.UTF8.GetBytes(raw + "|" + salt);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string GetMachineGuid()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
            return key?.GetValue("MachineGuid")?.ToString() ?? "unknown-guid";
        }
        catch
        {
            return "unknown-guid";
        }
    }

    private static string GetCpuId()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT ProcessorId FROM Win32_Processor");
            foreach (var obj in searcher.Get())
                return obj["ProcessorId"]?.ToString() ?? "unknown-cpu";
        }
        catch
        {
            /* WMI may be restricted */
        }
        return Environment.MachineName;
    }
}

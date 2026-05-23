using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace LicenseLoader.Services;

/// <summary>
/// LoadLibrary injector — injects harvey.dll (or any DLL path) into the target process.
/// Loader and DLL must match game bitness (x64 game → x64 build).
/// </summary>
public static class InjectService
{
    private const uint ProcessAccess =
        0x0002 | 0x0400 | 0x0008 | 0x0020 | 0x0010; // CREATE_THREAD | QUERY | VM_OP | VM_WRITE | VM_READ

    private const uint MemCommit = 0x1000;
    private const uint MemReserve = 0x2000;
    private const uint PageReadWrite = 0x04;
    private const uint Infinite = 0xFFFFFFFF;

    public static bool TryInjectIntoRunningGame(string gameExePath, string dllPath, out string error, Action<string>? log = null)
    {
        error = "";
        dllPath = Path.GetFullPath(dllPath);
        log?.Invoke($"DLL: {dllPath}");
        log?.Invoke($"Game: {gameExePath}");

        if (!File.Exists(dllPath))
        {
            error = $"DLL not found: {dllPath}";
            log?.Invoke(error);
            return false;
        }

        Process? gameProcess;
        if (!GameSessionService.IsGameRunning(gameExePath, out gameProcess) || gameProcess == null)
        {
            error = "Game is not running. Start the game and wait until you are in-game.";
            log?.Invoke(error);
            return false;
        }

        var target = gameProcess;
        try
        {
            log?.Invoke($"PID {target.Id} — injecting...");
            if (!InjectDll(target.Id, dllPath, out var detail, log))
            {
                error = detail;
                log?.Invoke($"FAILED: {detail}");
                return false;
            }

            log?.Invoke("SUCCESS: loaded in game.");
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            log?.Invoke($"EXCEPTION: {ex.Message}");
            return false;
        }
        finally
        {
            GameSessionService.DisposeProcess(target);
        }
    }

    private static bool InjectDll(int processId, string dllPath, out string error, Action<string>? log = null)
    {
        error = "";
        log?.Invoke("OpenProcess...");
        IntPtr hProcess = IntPtr.Zero;
        IntPtr alloc = IntPtr.Zero;
        IntPtr hThread = IntPtr.Zero;

        try
        {
            hProcess = OpenProcess(ProcessAccess, false, processId);
            if (hProcess == IntPtr.Zero)
            {
                error = $"OpenProcess failed ({processId}). Try Run as administrator. Win32: {GetLastErrorMessage()}";
                return false;
            }

            var kernel32 = GetModuleHandle("kernel32.dll");
            if (kernel32 == IntPtr.Zero)
            {
                error = "GetModuleHandle(kernel32) failed.";
                return false;
            }

            var loadLibraryAddr = GetProcAddress(kernel32, "LoadLibraryW");
            if (loadLibraryAddr == IntPtr.Zero)
            {
                error = "GetProcAddress(LoadLibraryW) failed.";
                return false;
            }

            var dllBytes = Encoding.Unicode.GetBytes(dllPath + "\0");
            alloc = VirtualAllocEx(hProcess, IntPtr.Zero, (uint)dllBytes.Length, MemCommit | MemReserve, PageReadWrite);
            if (alloc == IntPtr.Zero)
            {
                error = $"VirtualAllocEx failed. Win32: {GetLastErrorMessage()}";
                return false;
            }

            if (!WriteProcessMemory(hProcess, alloc, dllBytes, (uint)dllBytes.Length, out _))
            {
                error = $"WriteProcessMemory failed. Win32: {GetLastErrorMessage()}";
                return false;
            }

            log?.Invoke("CreateRemoteThread(LoadLibraryW)...");
            hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, loadLibraryAddr, alloc, 0, out _);
            if (hThread == IntPtr.Zero)
            {
                error = $"CreateRemoteThread failed. Win32: {GetLastErrorMessage()}";
                return false;
            }

            log?.Invoke("Waiting for DLL load...");
            WaitForSingleObject(hThread, 10_000);
            if (!GetExitCodeThread(hThread, out var exitCode) || exitCode == 0)
            {
                error =
                    "LoadLibrary returned NULL in target process. " +
                    "Check: DLL is same bitness as game (x64/x86), exports DllMain, no missing VC++ runtime.";
                return false;
            }

            return true;
        }
        finally
        {
            if (hThread != IntPtr.Zero) CloseHandle(hThread);
            if (alloc != IntPtr.Zero) VirtualFreeEx(hProcess, alloc, 0, 0x8000);
            if (hProcess != IntPtr.Zero) CloseHandle(hProcess);
        }
    }

    private static string GetLastErrorMessage()
    {
        var code = Marshal.GetLastWin32Error();
        return code == 0 ? "unknown" : new Win32Exception(code).Message;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr VirtualAllocEx(
        IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool WriteProcessMemory(
        IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out IntPtr lpNumberOfBytesWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateRemoteThread(
        IntPtr hProcess,
        IntPtr lpThreadAttributes,
        uint dwStackSize,
        IntPtr lpStartAddress,
        IntPtr lpParameter,
        uint dwCreationFlags,
        out IntPtr lpThreadId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeThread(IntPtr hThread, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint dwFreeType);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
    private static extern IntPtr GetProcAddress(IntPtr hModule, string procName);
}

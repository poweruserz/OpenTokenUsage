# Drives OpenTokenUsage (Windows tray app) for agents: build, launch, read usage, open the panel,
# screenshot it, quit, restore the installed app. Run from anywhere:
#   pwsh -NoProfile -File .claude/skills/run-opentokenusage/driver.ps1 <command> [arg]
param(
    [Parameter(Position = 0)][string]$Command = "help",
    [Parameter(Position = 1)][string]$Arg
)
$ErrorActionPreference = "Stop"

$Unit = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
$Exe = Join-Path $Unit "src-tauri\target\release\opentokenusage.exe"
# The per-user install (0.7.8+), else an older per-machine MSI one.
$Installed = @("$env:LOCALAPPDATA\OpenTokenUsage\opentokenusage.exe", "C:\Program Files\OpenTokenUsage\opentokenusage.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
$Api = "http://127.0.0.1:6736/v1/usage"

# Win32 only in C#: compiling against System.Drawing breaks across .NET versions (pwsh 7 / .NET 10
# forwards Bitmap to System.Drawing.Common and System.Private.Windows.GdiPlus), so the capture itself
# uses System.Drawing at run time from PowerShell below.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class OtuWin {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    // The largest visible top-level window of the process (the panel; the tray icon has none).
    public static RECT PanelRect(uint pid) {
        RECT best = new RECT(); long bestArea = 0;
        EnumWindows((hwnd, _) => {
            uint owner; GetWindowThreadProcessId(hwnd, out owner);
            RECT r;
            if (owner == pid && IsWindowVisible(hwnd) && GetWindowRect(hwnd, out r)) {
                long area = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
                if (area > bestArea) { bestArea = area; best = r; }
            }
            return true;
        }, IntPtr.Zero);
        return best;
    }
}
"@
Add-Type -AssemblyName System.Drawing

function Save-ScreenRect($rect, $path) {
    $bmp = New-Object System.Drawing.Bitmap ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
        $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $g.Dispose(); $bmp.Dispose() }
}

function Get-App { Get-Process opentokenusage -ErrorAction SilentlyContinue }

function Get-Usage {
    try { return Invoke-RestMethod -Uri $Api -TimeoutSec 3 } catch { return $null }
}

# Invoke-RestMethod turns the ISO `fetchedAt` into a DateTime; parsing its string again goes through
# the local culture and time zone (tr-TR: "2.10.2026 18:57:35", 3 h off). Compare in UTC instead.
function ConvertTo-Utc($value) {
    if ($value -is [DateTime]) { return [DateTimeOffset]$value.ToUniversalTime() }
    return [DateTimeOffset]::Parse($value, [Globalization.CultureInfo]::InvariantCulture)
}

switch ($Command) {
    "build" {
        # A running copy of this build locks the exe: cargo fails with "failed to remove file ... (os error 5)".
        Get-App | Where-Object { $_.Path -eq $Exe } | ForEach-Object {
            "stopping $($_.Id): it locks $Exe"
            $_ | Stop-Process -Force
            Start-Sleep -Milliseconds 1500
        }
        Push-Location $Unit
        try { bun tauri build --no-bundle; if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" } }
        finally { Pop-Location }
        Get-Item $Exe | Select-Object FullName, Length, LastWriteTime | Format-List
    }
    "stop" {
        # Single instance: any running copy (installed or this build) must go before a launch.
        $running = Get-App
        if (-not $running) { "nothing running"; break }
        $running | ForEach-Object { "stopping $($_.Id) $($_.Path)" }
        $running | Stop-Process -Force
        Start-Sleep -Milliseconds 1500
    }
    "launch" {
        if (-not (Test-Path $Exe)) { throw "no build at $Exe - run: driver.ps1 build" }
        & $PSCommandPath stop
        $started = [DateTimeOffset]::UtcNow
        Start-Process -FilePath $Exe -WorkingDirectory (Split-Path $Exe) | Out-Null
        # Ready = the local API answers with at least one provider fetched after this launch.
        $deadline = (Get-Date).AddSeconds(60)
        do {
            Start-Sleep -Seconds 2
            $usage = Get-Usage
            $fresh = @($usage | Where-Object { $_ -and (ConvertTo-Utc $_.fetchedAt) -ge $started })
        } while ($fresh.Count -eq 0 -and (Get-Date) -lt $deadline)
        $app = Get-App | Select-Object -First 1
        "running: pid $($app.Id) $($app.Path)"
        if ($fresh.Count -eq 0) { throw "no fresh usage within 60 s (is every provider disabled?)" }
        "fresh providers: $(($fresh | ForEach-Object providerId) -join ', ')"
    }
    "usage" {
        $usage = Get-Usage
        if (-not $usage) { throw "local API not answering at $Api - is the app running?" }
        foreach ($p in $usage) {
            $labels = ($p.lines | ForEach-Object label) -join ", "
            "{0}: plan={1} | fetchedAt={2} | {3}" -f $p.providerId, $p.plan, (ConvertTo-Utc $p.fetchedAt).ToString("u"), $labels
        }
    }
    "panel" {
        # A second launch hands over to the running instance, which shows its panel.
        if (-not (Get-App)) { throw "app not running - run: driver.ps1 launch" }
        Start-Process -FilePath $Exe -WorkingDirectory (Split-Path $Exe) | Out-Null
        Start-Sleep -Seconds 2
        "panel requested"
    }
    "ss" {
        $path = if ($Arg) { $Arg } else { Join-Path $env:TEMP "opentokenusage-panel.png" }
        $app = Get-App | Select-Object -First 1
        if (-not $app) { throw "app not running" }
        [void][OtuWin]::SetProcessDPIAware()  # else the rect is in scaled coordinates on >100% displays
        $rect = [OtuWin]::PanelRect([uint32]$app.Id)
        if ($rect.Right -le $rect.Left) { throw "no visible window - run: driver.ps1 panel" }
        Save-ScreenRect $rect $path
        "saved $path ($($rect.Right - $rect.Left)x$($rect.Bottom - $rect.Top) at $($rect.Left),$($rect.Top))"
    }
    "quit" { & $PSCommandPath stop }
    "restore" {
        # Back to the installed release (it copies its own bundled plugins back on start).
        & $PSCommandPath stop
        if (-not $Installed) { throw "no installed app in %LOCALAPPDATA%\OpenTokenUsage or Program Files" }
        Start-Process -FilePath $Installed | Out-Null
        Start-Sleep -Seconds 3
        $app = Get-App | Select-Object -First 1
        "running: pid $($app.Id) $($app.Path)"
    }
    default {
        "commands: build | launch | usage | panel | ss [file.png] | stop | quit | restore"
    }
}

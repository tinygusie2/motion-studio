# Signs the packaged app (dist\Motion Studio-win32-x64\Motion Studio.exe) with signtool from the Windows SDK.
#
# Which certificate, in this order:
#   1. MS_SIGN_PFX (+ MS_SIGN_PFX_PASSWORD)   a .pfx file, e.g. from Certum or Sectigo
#   2. MS_SIGN_THUMBPRINT                     a certificate already in your Windows certificate store
#   3. the self-signed "Motion Studio" certificate made by scripts\make-selfsigned-cert.ps1
# A self-signed signature marks the file as yours and unchanged, but other PCs still show "Unknown publisher":
# only a certificate from a trusted authority (or Azure Trusted Signing) removes that.
# -Exe/-Description sign another exe, e.g. the launcher (npm run sign:launcher).
param([string]$Exe = "$PSScriptRoot\..\dist\Motion Studio-win32-x64\Motion Studio.exe", [string]$Description = 'Motion Studio')
$ErrorActionPreference = 'Stop'

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $signtool) { throw 'signtool.exe not found. Install the Windows SDK (winget install Microsoft.WindowsSDK.10.0.26100).' }
if (-not (Test-Path $Exe)) { throw "Nothing to sign at $Exe. Run npm run pack first." }

$args = @('sign', '/fd', 'SHA256', '/tr', 'http://timestamp.digicert.com', '/td', 'SHA256', '/d', $Description)
if ($env:MS_SIGN_PFX) {
  $args += @('/f', $env:MS_SIGN_PFX)
  if ($env:MS_SIGN_PFX_PASSWORD) { $args += @('/p', $env:MS_SIGN_PFX_PASSWORD) }
} else {
  $thumb = $env:MS_SIGN_THUMBPRINT
  if (-not $thumb) {
    $cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -eq 'CN=Motion Studio' -and $_.NotAfter -gt (Get-Date) } |
      Sort-Object NotAfter -Descending | Select-Object -First 1
    if (-not $cert) { throw 'No signing certificate. Set MS_SIGN_PFX or MS_SIGN_THUMBPRINT, or run scripts\make-selfsigned-cert.ps1 for a self-signed one.' }
    $thumb = $cert.Thumbprint
  }
  $args += @('/sha1', $thumb, '/s', 'My')
}

& $signtool @args $Exe
if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE)" }
$ErrorActionPreference = 'Continue' # verify prints to stderr for an untrusted root; that is only informative here
& $signtool verify /pa /q $Exe 2>&1 | Out-Null
Write-Host ("Signed: $Exe" + $(if ($LASTEXITCODE -ne 0) { ' (signature present; not trusted on this PC, which is expected for a self-signed certificate)' } else { ' (trusted)' }))

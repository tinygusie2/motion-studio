# Creates a self-signed code-signing certificate "CN=Motion Studio" in your personal certificate store
# (Cert:\CurrentUser\My), valid for 3 years, for scripts\sign.ps1. It is not added to any trusted store:
# Windows will show the signature, but still call the publisher unknown on every PC.
$ErrorActionPreference = 'Stop'
$existing = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -eq 'CN=Motion Studio' -and $_.NotAfter -gt (Get-Date) }
if ($existing) { Write-Host "Already there: $($existing[0].Thumbprint)"; exit 0 }
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Motion Studio' -FriendlyName 'Motion Studio (self-signed)' `
  -CertStoreLocation Cert:\CurrentUser\My -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(3)
Write-Host "Created: $($cert.Thumbprint)"

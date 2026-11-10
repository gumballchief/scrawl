# Saves your OpenRouter API key to a private file outside every project folder:
#   C:\Users\<you>\.secrets\muse-build-day.env
# The key is typed into a hidden prompt. It is never shown, never sent anywhere, and never written into a project.
# Press Enter without typing to keep the key you saved before.

$dir = Join-Path $env:USERPROFILE '.secrets'
$file = Join-Path $dir 'muse-build-day.env'
New-Item -ItemType Directory -Force $dir | Out-Null

$saved = @{}
if (Test-Path $file) {
  foreach ($line in Get-Content $file) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $saved[$Matches[1]] = $Matches[2] }
  }
}

$secure = Read-Host -AsSecureString 'Paste your OpenRouter API key (starts with sk-or-), then press Enter'
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($key) { $saved['OPENROUTER_API_KEY'] = $key }

$lines = foreach ($k in $saved.Keys) { "$k=$($saved[$k])" }
Set-Content -Path $file -Value $lines -Encoding ascii

if ($saved.ContainsKey('OPENROUTER_API_KEY')) {
  $looks = if ($saved['OPENROUTER_API_KEY'].StartsWith('sk-or-')) { 'and it looks right' } else { 'but it does not start with sk-or-, so double check it' }
  Write-Host "Done. OpenRouter key saved $looks. You can close this tab."
} else {
  Write-Host 'No key saved yet. Run this again when you have it.'
}

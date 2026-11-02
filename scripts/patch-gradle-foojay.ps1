# Re-apply after "npm install" if builds fail on plugins-artifacts.gradle.org (corporate network).
$path = Join-Path $PSScriptRoot "..\node_modules\@react-native\gradle-plugin\settings.gradle.kts"
if (-not (Test-Path $path)) {
  Write-Host "File not found: $path" -ForegroundColor Red
  exit 1
}
$content = Get-Content $path -Raw
$needle = 'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0") }'
$replacement = '// Disabled on locked-down networks. Uses JDK 17 from JAVA_HOME.
// plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0") }'
if ($content -match 'foojay-resolver-convention') {
  if ($content -notmatch '^\s*// plugins \{ id\("org.gradle.toolchains.foojay') {
    $content = $content.Replace($needle, $replacement)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "Patched foojay plugin out of React Native gradle settings." -ForegroundColor Green
  } else {
    Write-Host "Already patched." -ForegroundColor Yellow
  }
} else {
  Write-Host "foojay line not found (RN version may have changed)." -ForegroundColor Yellow
}

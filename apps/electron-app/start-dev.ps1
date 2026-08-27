# Development runner for Base Board Electron app
# This script starts esbuild dev server and Electron with proper logging

Write-Host "Starting Base Board dev environment..." -ForegroundColor Cyan

# Create logs directory if it doesn't exist
$logsDir = Join-Path $PSScriptRoot "..\..\logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$logFile = Join-Path $logsDir "electron-dev.log"
Write-Host "Logs will be written to: $logFile" -ForegroundColor Yellow

# Start esbuild dev server in background
$esbuildJob = Start-Job -ScriptBlock {
    param($workDir, $logFile)
    Set-Location $workDir
    npx esbuild src/renderer/main.ts --bundle --outfile=dist/renderer/main.js --sourcemap --serve --port=3000 2>&1 | Tee-Object -FilePath $logFile -Append
} -ArgumentList @($PSScriptRoot, $logFile)

# Wait for esbuild to start
Write-Host "Waiting for dev server..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Set environment variables for Electron
$env:NODE_ENV = "development"
$env:ELECTRON_ENABLE_LOGGING = "1"

Write-Host "Starting Electron..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray

# Run Electron (this will block until Ctrl+C)
try {
    npx electron dist/main/index.js 2>&1 | Tee-Object -FilePath $logFile -Append
} finally {
    # Cleanup
    Stop-Job $esbuildJob
    Remove-Job $esbuildJob
    Write-Host "`nCleaned up background jobs" -ForegroundColor Gray
}

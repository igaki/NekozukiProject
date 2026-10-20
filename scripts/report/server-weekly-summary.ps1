param(
  [string]$HtmlPath,
  [string]$DataPath,
  [int]$Port
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($HtmlPath) -or [string]::IsNullOrWhiteSpace($DataPath) -or $Port -le 0) {
  throw 'HtmlPath, DataPath, and a positive Port are required.'
}
$HtmlPath = (Resolve-Path -LiteralPath $HtmlPath).Path
$DataPath = (Resolve-Path -LiteralPath $DataPath).Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$startedAt = Get-Date
$lastHeartbeat = $null
$bulmaPath = Join-Path (Split-Path -Path $HtmlPath -Parent) 'assets\vendor\bulma-1.0.4.min.css'
$dataDirectory = Split-Path -Path $DataPath -Parent

function Send-Response($client, $statusCode, $contentType, $body) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $statusText = if ($statusCode -eq 200) { 'OK' } elseif ($statusCode -eq 204) { 'No Content' } elseif ($statusCode -eq 400) { 'Bad Request' } elseif ($statusCode -eq 404) { 'Not Found' } else { 'Method Not Allowed' }
  $header = "HTTP/1.1 $statusCode $statusText`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
  $stream = $client.GetStream()
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($bytes.Length -gt 0) { $stream.Write($bytes, 0, $bytes.Length) }
  $stream.Flush()
}

function Save-AiUsage($requestBody) {
  $update = $requestBody | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($update.issue) -or [string]::IsNullOrWhiteSpace($update.level)) {
    throw 'issue and level are required.'
  }
  $allowed = 'none', 'light', 'medium', 'high', 'unanswered'
  if ($allowed -notcontains $update.level) { throw 'Invalid AI usage level.' }
  $data = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($null -eq $data.aiUsage) {
    $data | Add-Member -NotePropertyName aiUsage -NotePropertyValue ([pscustomobject]@{})
  }
  $entry = [pscustomobject]@{ level = $update.level; updatedAt = (Get-Date).ToString('o') }
  $data.aiUsage | Add-Member -NotePropertyName ([string]$update.issue) -NotePropertyValue $entry -Force
  $temporaryPath = "$DataPath.tmp"
  $data | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
  Move-Item -LiteralPath $temporaryPath -Destination $DataPath -Force
}

function Read-ReportHtml {
  $html = Get-Content -LiteralPath $HtmlPath -Raw -Encoding UTF8
  $reportJson = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8
  # 旧形式ではtroubleshootingが配列ではなく単一オブジェクトとして保存された。
  # 既存の記録も表示できるよう、配信用データだけを互換形式に変換する。
  $report = $reportJson | ConvertFrom-Json
  if ($null -ne $report.troubleshooting -and $report.troubleshooting -isnot [array]) {
    $report.troubleshooting = @($report.troubleshooting)
    $report.summary.troubleshootingCount = $report.troubleshooting.Count
    $reportJson = $report | ConvertTo-Json -Depth 30 -Compress
  }
  $prefix = '<script>const report='
  $suffix = ';const q='
  $start = $html.IndexOf($prefix)
  if ($start -lt 0) { throw 'The report HTML does not contain the report data placeholder.' }
  $start += $prefix.Length
  $end = $html.IndexOf($suffix, $start)
  if ($end -lt 0) { throw 'The report HTML does not contain the report data terminator.' }
  $options = Get-ChildItem -LiteralPath $dataDirectory -File -Filter '*.json' |
    Sort-Object -Property Name -Descending |
    ForEach-Object {
      $selected = if ($_.FullName -eq $DataPath) { ' selected' } else { '' }
      $name = [System.Net.WebUtility]::HtmlEncode($_.Name)
      "<option value=""$name""$selected>$name</option>"
    }
  return ($html.Substring(0, $start) + $reportJson + $html.Substring($end)).Replace('__REPORT_OPTIONS__', ($options -join ''))
}

function Select-ReportData($requestTarget) {
  $uri = [uri]("http://127.0.0.1" + $requestTarget)
  $requested = $null
  if ($requestTarget -match '[?&]report=([^&]+)') {
    $requested = [uri]::UnescapeDataString($Matches[1])
  }
  if ([string]::IsNullOrWhiteSpace($requested)) { return $uri.AbsolutePath }
  $fileName = [System.IO.Path]::GetFileName($requested)
  if ($fileName -ne $requested -or $fileName -notmatch '\.json$') { throw 'Invalid report file.' }
  $candidate = Join-Path $dataDirectory $fileName
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'Report JSON was not found.' }
  $script:DataPath = $candidate
  return $uri.AbsolutePath
}

try {
  $running = $true
  while ($true) {
    while (-not $listener.Pending()) {
      $now = Get-Date
      if (($null -eq $lastHeartbeat -and ($now - $startedAt).TotalMinutes -ge 5) -or
          ($null -ne $lastHeartbeat -and ($now - $lastHeartbeat).TotalSeconds -ge 30)) {
        $listener.Stop()
        $running = $false
        break
      }
      Start-Sleep -Seconds 1
    }
    if (-not $running) { break }
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      $parts = $requestLine -split ' '
      $method = $parts[0]; $path = Select-ReportData $parts[1]
      $contentLength = 0
      while ($true) {
        $headerLine = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($headerLine)) { break }
        if ($headerLine -match '^Content-Length:\s*(\d+)$') { $contentLength = [int]$Matches[1] }
      }
      $requestBody = ''
      if ($contentLength -gt 0) {
        $chars = New-Object char[] $contentLength
        $read = $reader.Read($chars, 0, $contentLength)
        $requestBody = -join $chars[0..($read - 1)]
      }
      switch ($path) {
        '/' {
          Send-Response $client 200 'text/html; charset=utf-8' (Read-ReportHtml)
        }
        '/assets/vendor/bulma-1.0.4.min.css' {
          Send-Response $client 200 'text/css; charset=utf-8' (Get-Content -LiteralPath $bulmaPath -Raw -Encoding UTF8)
        }
        '/api/heartbeat' {
          $lastHeartbeat = Get-Date
          Send-Response $client 204 'text/plain; charset=utf-8' ''
        }
        '/api/ai-usage' {
          if ($method -ne 'POST') { Send-Response $client 405 'text/plain; charset=utf-8' 'Method Not Allowed'; break }
          Save-AiUsage $requestBody
          Send-Response $client 200 'application/json; charset=utf-8' '{"ok":true}'
        }
        default { Send-Response $client 404 'text/plain; charset=utf-8' 'Not Found' }
      }
    } catch {
      Send-Response $client 400 'application/json; charset=utf-8' ('{"ok":false,"error":' + ($_.Exception.Message | ConvertTo-Json -Compress) + '}')
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

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

function Read-ReportData {
  $data = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($data.schemaVersion -ne 3) { throw 'Unsupported report JSON version.' }
  return $data
}

function Write-ReportData($data) {
  $temporaryPath = "$DataPath.tmp"
  [System.IO.File]::WriteAllText($temporaryPath, ($data | ConvertTo-Json -Depth 30), [System.Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporaryPath -Destination $DataPath -Force
}

function Save-AiUsage($requestBody) {
  $update = $requestBody | ConvertFrom-Json
  if ([string]$update.pr -notmatch '^[1-9][0-9]*$') { throw 'A PR number is required.' }
  $allowed = 'none', 'brainstorm', 'plan-issues', 'implement-issue', 'prepare-pr', 'debug', 'review-pr', 'other'
  $choices = @($update.choices)
  if ($choices.Count -gt $allowed.Count -or @($choices | Select-Object -Unique).Count -ne $choices.Count) { throw 'Invalid AI choices.' }
  foreach ($choice in $choices) { if ($allowed -notcontains $choice) { throw 'Invalid AI choice.' } }
  if ($choices -contains 'none' -and $choices.Count -gt 1) { throw 'No AI usage cannot be combined with other choices.' }
  $other = [string]$update.other
  if ($other.Length -gt 500 -or ($choices -notcontains 'other' -and $other.Length -gt 0)) { throw 'Invalid other AI usage.' }
  $data = Read-ReportData
  if (-not @($data.closedPullRequests | Where-Object { $_.number -eq [int]$update.pr }).Count) { throw 'PR is not in this report.' }
  $entry = [pscustomobject]@{ choices = $choices; other = $other; updatedAt = (Get-Date).ToString('o') }
  $data.aiUsage | Add-Member -MemberType NoteProperty -Name ([string]$update.pr) -Value $entry -Force
  Write-ReportData $data
}

function Save-DodAssessment($requestBody) {
  $update = $requestBody | ConvertFrom-Json
  $item = [string]$update.item
  $choice = [string]$update.choice
  if ($item -notmatch '^[1-7]$') { throw 'Invalid DoD item.' }
  $allowed = '', 'no_activity', 'all', 'some_not', 'most_not', 'none_done'
  if ($allowed -notcontains $choice) { throw 'Invalid DoD choice.' }
  $data = Read-ReportData
  if ($choice -eq '') {
    $data.dodAssessment.PSObject.Properties.Remove($item)
  } else {
    $entry = [pscustomobject]@{ choice = $choice; updatedAt = (Get-Date).ToString('o') }
    $data.dodAssessment | Add-Member -MemberType NoteProperty -Name $item -Value $entry -Force
  }
  Write-ReportData $data
}

function Read-ReportHtml {
  $html = Get-Content -LiteralPath $HtmlPath -Raw -Encoding UTF8
  $reportJson = (Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8).Replace('<', '\u003c')
  $prefix = '<script>const report='
  $suffix = ';/*WEEKLY_SUMMARY_DATA_END*/'
  $start = $html.IndexOf($prefix)
  if ($start -lt 0) { throw 'The report HTML does not contain the report data placeholder.' }
  $start += $prefix.Length
  $end = $html.IndexOf($suffix, $start)
  if ($end -lt 0) { throw 'The report HTML does not contain the report data terminator.' }
  $options = Get-ChildItem -LiteralPath $dataDirectory -File -Filter 'lec*.json' |
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
      if ($contentLength -gt 16384) { throw 'Request body is too large.' }
      $requestBody = ''
      if ($contentLength -gt 0) {
        $chars = New-Object char[] $contentLength
        $read = 0
        while ($read -lt $contentLength) {
          $chunk = $reader.Read($chars, $read, $contentLength - $read)
          if ($chunk -le 0) { throw 'Incomplete request body.' }
          $read += $chunk
        }
        $requestBody = -join $chars
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
        '/api/dod-assessment' {
          if ($method -ne 'POST') { Send-Response $client 405 'text/plain; charset=utf-8' 'Method Not Allowed'; break }
          Save-DodAssessment $requestBody
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

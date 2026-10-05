function Get-AgentConfiguration {
  $port = 8787
  $rawPort = [string]$env:BML_AGENT_PORT
  if (-not [string]::IsNullOrWhiteSpace($rawPort)) {
    $parsedPort = 0
    if (-not [int]::TryParse($rawPort, [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
      throw "BML_AGENT_PORT must be an integer between 1 and 65535."
    }
    $port = $parsedPort
  }

  $agentHost = if ([string]::IsNullOrWhiteSpace($env:BML_AGENT_HOST)) {
    "127.0.0.1"
  } else {
    $env:BML_AGENT_HOST.Trim()
  }

  [pscustomobject]@{
    Host = $agentHost
    Port = $port
  }
}

function Get-AgentHealthUri {
  param(
    [Alias("Host")]
    [string]$AgentHost = "127.0.0.1",
    [int]$Port = 8787
  )

  $probeHost = $AgentHost.Trim()
  if ($probeHost -eq "0.0.0.0") {
    $probeHost = "127.0.0.1"
  } elseif ($probeHost -eq "::") {
    $probeHost = "::1"
  }
  if ($probeHost.Contains(":") -and -not $probeHost.StartsWith("[")) {
    $probeHost = "[$probeHost]"
  }

  return "http://$probeHost`:$Port/health"
}

function Get-ListeningConnections {
  param([int]$Port)

  $tcpCommand = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
  if ($tcpCommand) {
    try {
      $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
      foreach ($connection in $connections) {
        [pscustomobject]@{
          LocalAddress = [string]$connection.LocalAddress
          LocalPort = [int]$connection.LocalPort
          OwningProcess = [int]$connection.OwningProcess
          State = [string]$connection.State
        }
      }
      return
    } catch {
      # Fall through to netstat when the TCP cmdlet is unavailable or denied.
    }
  }

  $netstatCommand = Get-Command netstat.exe -ErrorAction SilentlyContinue
  if (-not $netstatCommand) {
    throw "Windows could not inspect TCP port $Port. Run the installer from an elevated PowerShell window and try again."
  }

  $lines = @(& $netstatCommand.Source -ano -p TCP 2>$null | Select-String -Pattern "\sLISTENING\s+\d+\s*$")
  foreach ($match in $lines) {
    $line = [string]$match.Line
    if ($line -match '^\s*TCP\s+(?<local>.+):(?<localPort>\d+)\s+\S+\s+LISTENING\s+(?<owner>\d+)\s*$' -and [int]$Matches.localPort -eq $Port) {
      [pscustomobject]@{
        LocalAddress = $Matches.local.Trim()
        LocalPort = [int]$Matches.localPort
        OwningProcess = [int]$Matches.owner
        State = "Listen"
      }
    }
  }
}

function Get-ListeningProcessDetails {
  param([object[]]$Connections)

  $ownerPids = @(
    $Connections |
      Where-Object { $null -ne $_.OwningProcess } |
      Select-Object -ExpandProperty OwningProcess -Unique
  )

  foreach ($ownerPid in $ownerPids) {
    $process = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    $cimProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
    $processPath = $null
    if ($process) {
      try { $processPath = $process.Path } catch { $processPath = $null }
    }
    [pscustomobject]@{
      Id = [int]$ownerPid
      ProcessName = if ($process) { $process.ProcessName } else { "unknown" }
      Path = if ($processPath) { $processPath } elseif ($cimProcess) { $cimProcess.ExecutablePath } else { $null }
      CommandLine = if ($cimProcess) { $cimProcess.CommandLine } else { $null }
    }
  }
}

function Get-AgentHealth {
  param(
    [Alias("Host")]
    [string]$AgentHost = "127.0.0.1",
    [int]$Port = 8787,
    [int]$TimeoutSec = 2
  )

  $uri = Get-AgentHealthUri -AgentHost $AgentHost -Port $Port
  try {
    $payload = Invoke-RestMethod -Uri $uri -TimeoutSec $TimeoutSec -ErrorAction Stop
    $portMatches = $true
    if ($null -ne $payload.port) {
      $reportedPort = 0
      $portMatches = [int]::TryParse(([string]$payload.port), [ref]$reportedPort) -and $reportedPort -eq $Port
    }
    $hasPairingCode = $payload.pairingCode -is [string] -and
      -not [string]::IsNullOrWhiteSpace($payload.pairingCode)
    $isCompatibleAgent = $payload.ok -eq $true -and
      $payload.agentVersion -is [string] -and
      -not [string]::IsNullOrWhiteSpace($payload.agentVersion) -and
      $portMatches -and
      $hasPairingCode -and
      $payload.poseModelPresent -ne $false

    [pscustomobject]@{
      Uri = $uri
      Reachable = $true
      IsCompatibleAgent = $isCompatibleAgent
      Payload = $payload
      Error = $null
    }
  } catch {
    [pscustomobject]@{
      Uri = $uri
      Reachable = $false
      IsCompatibleAgent = $false
      Payload = $null
      Error = $_.Exception.Message
    }
  }
}

function Open-AgentSetupPage {
  param([string]$WebUrl)

  $preflightSucceeded = $false
  $preflightError = $null
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $WebUrl -TimeoutSec 5 -ErrorAction Stop | Out-Null
    $preflightSucceeded = $true
  } catch {
    $preflightError = $_.Exception.Message
  }

  try {
    Start-Process -FilePath $WebUrl -ErrorAction Stop | Out-Null
    [pscustomobject]@{
      PreflightSucceeded = $preflightSucceeded
      BrowserLaunchSucceeded = $true
      PreflightError = $preflightError
      BrowserLaunchError = $null
    }
  } catch {
    [pscustomobject]@{
      PreflightSucceeded = $preflightSucceeded
      BrowserLaunchSucceeded = $false
      PreflightError = $preflightError
      BrowserLaunchError = $_.Exception.Message
    }
  }
}

function Format-PortConflictMessage {
  param(
    [int]$Port,
    [object[]]$Connections,
    [object[]]$Owners,
    [Alias("Host")]
    [string]$AgentHost = "127.0.0.1"
  )

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("Port $Port is already in use.")
  $endpointDescriptions = @(
    foreach ($connection in @($Connections)) {
      $address = [string]$connection.LocalAddress
      if ($address.Contains(":") -and -not $address.StartsWith("[")) { $address = "[$address]" }
      "{0}:{1}" -f $address, $connection.LocalPort
    }
  )
  if ($endpointDescriptions.Count -gt 0) {
    $lines.Add("Listener: $($endpointDescriptions -join ', ')")
  }
  if (-not $Owners -or $Owners.Count -eq 0) {
    $lines.Add("Windows reported a listener, but its process details were unavailable.")
  } else {
    foreach ($owner in $Owners) {
      $description = "Owner: PID $($owner.Id), $($owner.ProcessName)"
      if ($owner.Path) { $description += ", $($owner.Path)" }
      if ($owner.CommandLine) { $description += " [$($owner.CommandLine)]" }
      $lines.Add($description)
    }
  }
  $lines.Add("Check $((Get-AgentHealthUri -AgentHost $AgentHost -Port $Port)) to see whether the existing process is already a healthy Local Agent.")
  $lines.Add("Close only the identified application, or set BML_AGENT_PORT to a free port and use the matching Local Agent URL in Setup.")
  return $lines -join [Environment]::NewLine
}

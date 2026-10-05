$diagnosticsPath = Join-Path $PSScriptRoot "..\agent-diagnostics.ps1"

Describe "Local Agent diagnostics" {
  BeforeAll {
    . $diagnosticsPath
  }

  It "uses the configured port instead of assuming 8787" {
    $previousPort = $env:BML_AGENT_PORT
    $previousHost = $env:BML_AGENT_HOST
    try {
      $env:BML_AGENT_PORT = "9123"
      $env:BML_AGENT_HOST = "127.0.0.1"

      $configuration = Get-AgentConfiguration

      $configuration.Port | Should Be 9123
      $configuration.Host | Should Be "127.0.0.1"
    } finally {
      if ($null -eq $previousPort) { Remove-Item Env:BML_AGENT_PORT -ErrorAction SilentlyContinue } else { $env:BML_AGENT_PORT = $previousPort }
      if ($null -eq $previousHost) { Remove-Item Env:BML_AGENT_HOST -ErrorAction SilentlyContinue } else { $env:BML_AGENT_HOST = $previousHost }
    }
  }

  It "rejects an invalid configured port with an actionable error" {
    $previousPort = $env:BML_AGENT_PORT
    try {
      $env:BML_AGENT_PORT = "70000"

      { Get-AgentConfiguration } | Should Throw "BML_AGENT_PORT must be an integer between 1 and 65535."
    } finally {
      if ($null -eq $previousPort) { Remove-Item Env:BML_AGENT_PORT -ErrorAction SilentlyContinue } else { $env:BML_AGENT_PORT = $previousPort }
    }
  }

  It "formats an IPv6 health URL safely" {
    Get-AgentHealthUri -Host "::1" -Port 8787 | Should Be "http://[::1]:8787/health"
    Get-AgentHealthUri -Host "::" -Port 8787 | Should Be "http://[::1]:8787/health"
  }

  It "recognizes an existing compatible Local Agent as reusable" {
    Mock Invoke-RestMethod {
      [pscustomobject]@{
        ok = $true
        agentVersion = "0.2.2"
        port = 8787
        pairingCode = "ABC123"
        poseModelPresent = $true
      }
    }

    $health = Get-AgentHealth -Host "127.0.0.1" -Port 8787

    $health.IsCompatibleAgent | Should Be $true
    $health.Payload.agentVersion | Should Be "0.2.2"
  }

  It "rejects an older agent without the current pairing health contract" {
    Mock Invoke-RestMethod {
      [pscustomobject]@{
        ok = $true
        agentVersion = "0.2.1"
        port = 8787
        pairingCode = $null
        poseModelPresent = $true
      }
    }

    $health = Get-AgentHealth -Host "127.0.0.1" -Port 8787

    $health.IsCompatibleAgent | Should Be $false
  }

  It "does not treat an unrelated healthy HTTP service as the Local Agent" {
    Mock Invoke-RestMethod {
      [pscustomobject]@{
        ok = $true
        service = "another-app"
      }
    }

    $health = Get-AgentHealth -Host "127.0.0.1" -Port 8787

    $health.IsCompatibleAgent | Should Be $false
  }

  It "includes owner details and recovery guidance in a port conflict" {
    $connections = @(
      [pscustomobject]@{ LocalAddress = "127.0.0.1"; LocalPort = 8787; OwningProcess = 42060; State = "Listen" }
    )
    $owners = @(
      [pscustomobject]@{
        Id = 42060
        ProcessName = "python.exe"
        Path = "D:\Downloads\Compressed\badminton-motion-lab-main\.venv\Scripts\python.exe"
        CommandLine = "python.exe main.py"
      }
    )

    $message = Format-PortConflictMessage -Port 8787 -Connections $connections -Owners $owners

    $message | Should Match "42060"
    $message | Should Match "python.exe"
    $message | Should Match "Listener: 127.0.0.1:8787"
    $message | Should Match "BML_AGENT_PORT"
    $message | Should Match "health"
  }

  It "packages the diagnostics helper with the Windows launcher" {
    $packageScript = Get-Content (Join-Path $PSScriptRoot "..\package-agent.ps1") -Raw

    $packageScript | Should Match "agent-diagnostics.ps1"
  }

  It "attempts to open the browser even when the website preflight fails" {
    Mock Invoke-WebRequest { throw "website offline" }
    Mock Start-Process { }

    $launch = Open-AgentSetupPage -WebUrl "https://bml.jenss.me/agent"

    $launch.PreflightSucceeded | Should Be $false
    $launch.BrowserLaunchSucceeded | Should Be $true
    Assert-MockCalled Start-Process -Times 1 -Scope It
  }
}

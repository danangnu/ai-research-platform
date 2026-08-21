param(
    [Parameter(Mandatory = $true)]
    [string]$ApiUrl,

    [Parameter(Mandatory = $true)]
    [string]$FrontendUrl,

    [Parameter(Mandatory = $true)]
    [string]$AdminEmail,

    [Parameter(Mandatory = $true)]
    [string]$AdminPassword,

    [Parameter(Mandatory = $false)]
    [string]$ParticipantEmail = "",

    [Parameter(Mandatory = $false)]
    [string]$ParticipantPassword = ""
)

$ErrorActionPreference = "Stop"

$ApiUrl = $ApiUrl.TrimEnd("/")
$FrontendUrl = $FrontendUrl.TrimEnd("/")

Write-Host "AI Research Platform Step 1A.1 deployment verification" -ForegroundColor Cyan

$health = Invoke-RestMethod `
    -Uri "$ApiUrl/health" `
    -Method Get `
    -TimeoutSec 90

if ($health.status -ne "ok") {
    throw "API health check failed."
}

Write-Host "PASS: API health"

$ready = Invoke-RestMethod `
    -Uri "$ApiUrl/health/ready" `
    -Method Get `
    -TimeoutSec 90

if ($ready.status -ne "ready" -or $ready.database -ne "ok") {
    throw "API readiness/database check failed."
}

Write-Host "PASS: API + Neon database readiness"

$login = Invoke-RestMethod `
    -Uri "$ApiUrl/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{
        email = $AdminEmail
        password = $AdminPassword
    } | ConvertTo-Json) `
    -TimeoutSec 90

if (-not $login.access_token) {
    throw "Admin login did not return an access token."
}

Write-Host "PASS: demo administrator login"

$headers = @{
    Authorization = "Bearer $($login.access_token)"
}

$me = Invoke-RestMethod `
    -Uri "$ApiUrl/api/auth/me" `
    -Headers $headers `
    -TimeoutSec 30

if ($me.roles -notcontains "PROJECT_ADMIN") {
    throw "Demo administrator does not have PROJECT_ADMIN."
}

Write-Host "PASS: online RBAC"

if ([bool]$ParticipantEmail -xor [bool]$ParticipantPassword) {
    throw "ParticipantEmail and ParticipantPassword must be supplied together."
}

if ($ParticipantEmail -and $ParticipantPassword) {
    $participantLogin = Invoke-RestMethod `
        -Uri "$ApiUrl/api/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body (@{
            email = $ParticipantEmail
            password = $ParticipantPassword
        } | ConvertTo-Json) `
        -TimeoutSec 90

    $participantHeaders = @{
        Authorization = "Bearer $($participantLogin.access_token)"
    }

    $participantMe = Invoke-RestMethod `
        -Uri "$ApiUrl/api/auth/me" `
        -Headers $participantHeaders `
        -TimeoutSec 30

    if ($participantMe.roles.Count -ne 1 -or $participantMe.roles[0] -ne "PARTICIPANT") {
        throw "Demo participant does not have the expected least-privilege role."
    }

    try {
        Invoke-RestMethod `
            -Uri "$ApiUrl/api/projects" `
            -Headers $participantHeaders `
            -TimeoutSec 30 `
            -ErrorAction Stop | Out-Null
        throw "Participant project access unexpectedly succeeded."
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 403) {
            throw
        }
    }

    try {
        Invoke-RestMethod `
            -Uri "$ApiUrl/api/admin/audit" `
            -Headers $participantHeaders `
            -TimeoutSec 30 `
            -ErrorAction Stop | Out-Null
        throw "Participant admin access unexpectedly succeeded."
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 403) {
            throw
        }
    }

    Write-Host "PASS: demo participant least-privilege RBAC"
}

$frontend = Invoke-WebRequest `
    -Uri $FrontendUrl `
    -Method Get `
    -TimeoutSec 90

if ($frontend.StatusCode -ne 200) {
    throw "Frontend did not return HTTP 200."
}

if ($frontend.Content -notmatch "AI Research Study Management Platform") {
    throw "Frontend HTML did not look like the expected application."
}

Write-Host "PASS: Render frontend"

$robots = $frontend.Headers["X-Robots-Tag"]
if ($robots) {
    Write-Host "PASS: demo noindex header ($robots)"
}
else {
    Write-Host "WARN: X-Robots-Tag header not visible in this response."
}

Write-Host ""
Write-Host "Deployment verification PASSED." -ForegroundColor Green

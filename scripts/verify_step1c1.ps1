param(
    [Parameter(Mandatory = $true)] [string] $ApiUrl,
    [Parameter(Mandatory = $true)] [string] $AdminEmail,
    [Parameter(Mandatory = $true)] [string] $AdminPassword,
    [string] $ParticipantEmail = "",
    [string] $ParticipantPassword = ""
)

$ErrorActionPreference = "Stop"
$ApiUrl = $ApiUrl.TrimEnd("/")

function Pass([string] $Message) { Write-Host "PASS: $Message" -ForegroundColor Green }
function Fail([string] $Message) { Write-Host "FAIL: $Message" -ForegroundColor Red; exit 1 }

try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health"
    if ($health.version -notin @("0.3.0-step1c1", "0.3.1-step1c2", "0.4.0-step1c3", "0.5.0-step1c4", "0.6.0-step1c5", "0.7.0-step1d1")) { Fail "Unexpected API version: $($health.version)" }
    Pass "Step 1C.1 API version"

    $loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
    $login = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/auth/login" `
        -ContentType "application/json" `
        -Body $loginBody
    $headers = @{ Authorization = "Bearer $($login.access_token)" }
    Pass "Administrator login"

    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $syntheticEmail = "step1c1.$suffix@example.com"
    $applicationBody = @{
        preferred_name = "Step 1C.1 Synthetic Applicant"
        contact_email = $syntheticEmail
        recruitment_source = "Step 1C.1 deployment verification"
        consent_to_screen = $true
        privacy_acknowledged = $true
        screening_answers = @{
            demo_online_access = $true
            demo_instruction_language = $true
            demo_schedule_availability = $true
        }
    } | ConvertTo-Json -Depth 5

    $application = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/public/recruitment/applications" `
        -ContentType "application/json" `
        -Body $applicationBody
    Pass "Synthetic applicant created"

    $reviewBody = @{
        status = "eligible"
        review_note = "Synthetic Step 1C.1 eligibility validation."
    } | ConvertTo-Json
    $review = Invoke-RestMethod `
        -Method PATCH `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/review" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $reviewBody
    if ($review.status -ne "eligible") { Fail "Applicant was not persisted as eligible" }
    Pass "Eligible applicant persisted"

    $selectionBody = @{
        status = "selected"
        note = "Synthetic Step 1C.1 selection validation only."
    } | ConvertTo-Json
    $selection = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/selection" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $selectionBody
    if ($selection.status -ne "selected") { Fail "Selection decision was not persisted" }
    Pass "Selection decision persisted"

    $participant = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/enroll" `
        -Headers $headers
    if (-not $participant.participant_code.StartsWith("P-")) { Fail "Pseudonymous participant code was not created" }
    if ($participant.lifecycle_status -ne "enrolled") { Fail "Participant is not enrolled" }
    if ($participant.allocation_status -ne "not_allocated") { Fail "Step 1C.1 must not allocate a study group" }
    if ($null -ne $participant.study_group) { Fail "Study group must remain null in Step 1C.1" }
    Pass "Pseudonymous enrollment without group allocation"

    $retry = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/enroll" `
        -Headers $headers
    if ($retry.id -ne $participant.id) { Fail "Enrollment retry created a different participant" }
    Pass "Enrollment idempotency"

    $participants = Invoke-RestMethod -Uri "$ApiUrl/api/participants" -Headers $headers
    $matches = @($participants | Where-Object application_id -eq $application.id)
    if ($matches.Count -ne 1) { Fail "Expected exactly one participant for the application" }
    Pass "Participant persistence"

    $metrics = Invoke-RestMethod -Uri "$ApiUrl/api/participants/metrics" -Headers $headers
    if ($metrics.participants -lt 1) { Fail "Participant metrics did not refresh" }
    Pass "Participant metrics"

    if ($ParticipantEmail -and $ParticipantPassword) {
        $participantLoginBody = @{ email = $ParticipantEmail; password = $ParticipantPassword } | ConvertTo-Json
        $participantLogin = Invoke-RestMethod `
            -Method POST `
            -Uri "$ApiUrl/api/auth/login" `
            -ContentType "application/json" `
            -Body $participantLoginBody
        $participantHeaders = @{ Authorization = "Bearer $($participantLogin.access_token)" }

        foreach ($path in @("/api/recruitment/selections", "/api/participants")) {
            try {
                Invoke-RestMethod -Uri "$ApiUrl$path" -Headers $participantHeaders -ErrorAction Stop | Out-Null
                Fail "Participant unexpectedly accessed $path"
            }
            catch {
                if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw }
            }
        }
        Pass "Participant least-privilege RBAC (403)"
    }

    $audit = Invoke-RestMethod -Uri "$ApiUrl/api/admin/audit?limit=100" -Headers $headers
    $actions = @($audit | ForEach-Object { $_.action })
    if ($actions -notcontains "participant.selection_recorded") { Fail "Selection audit event missing" }
    if ($actions -notcontains "participant.enrolled") { Fail "Enrollment audit event missing" }
    Pass "Selection and enrollment audit trail"

    Write-Host "All Step 1C.1 deployment checks passed." -ForegroundColor Cyan
}
catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}

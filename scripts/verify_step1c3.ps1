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

function Expect-Forbidden([scriptblock] $Request, [string] $Description) {
    try {
        & $Request | Out-Null
        Fail "$Description was unexpectedly allowed"
    }
    catch {
        $statusCode = [int] $_.Exception.Response.StatusCode
        if ($statusCode -ne 403) { throw }
        Pass $Description
    }
}

try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health"
    if ($health.version -ne "0.4.0-step1c3") { Fail "Unexpected API version: $($health.version)" }
    Pass "Step 1C.3 API version"

    $loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
    $login = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/auth/login" `
        -ContentType "application/json" `
        -Body $loginBody
    $headers = @{ Authorization = "Bearer $($login.access_token)" }
    Pass "Administrator login"

    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $applicationBody = @{
        preferred_name = "Step 1C.3 Synthetic Participant"
        contact_email = "step1c3.$suffix@example.com"
        recruitment_source = "Step 1C.3 deployment verification"
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
        review_note = "Synthetic Step 1C.3 participant-management validation."
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
        note = "Synthetic Step 1C.3 selection."
    } | ConvertTo-Json
    $selection = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/selection" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $selectionBody
    if ($selection.status -ne "selected") { Fail "Selection was not persisted" }
    Pass "Selection decision persisted"

    $participant = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/enroll" `
        -Headers $headers
    if (-not $participant.participant_code.StartsWith("P-")) { Fail "Participant code is invalid" }
    Pass "Pseudonymous participant enrolled"

    $allocation = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/allocate" `
        -Headers $headers
    if ($allocation.participant_id -ne $participant.id) { Fail "Allocation does not match participant" }
    Pass "Accepted Step 1C.2 allocation remains operational"

    $participants = @(Invoke-RestMethod -Uri "$ApiUrl/api/participants" -Headers $headers)
    $managed = @($participants | Where-Object { $_.id -eq $participant.id })
    if ($managed.Count -ne 1) { Fail "Participant was not found exactly once in management list" }
    $managed = $managed[0]

    $required = @(
        "id", "participant_code", "application_id", "site_id", "user_id",
        "lifecycle_status", "allocation_status", "study_group", "enrolled_at"
    )
    foreach ($field in $required) {
        if ($field -notin $managed.PSObject.Properties.Name) { Fail "Missing participant field: $field" }
    }
    Pass "Participant management list contract"

    if ("preferred_name" -in $managed.PSObject.Properties.Name) { Fail "Applicant name leaked into participant record" }
    if ("contact_email" -in $managed.PSObject.Properties.Name) { Fail "Applicant email leaked into participant record" }
    Pass "Pseudonymous participant privacy boundary"

    $detail = Invoke-RestMethod `
        -Uri "$ApiUrl/api/participants/$($participant.id)" `
        -Headers $headers
    if ($detail.id -ne $managed.id) { Fail "Participant detail does not match list record" }
    if ($detail.allocation_status -ne "allocated") { Fail "Allocated state is missing from participant detail" }
    Pass "Participant detail persistence"

    $allocationDetail = Invoke-RestMethod `
        -Uri "$ApiUrl/api/participants/$($participant.id)/allocation" `
        -Headers $headers
    if ($allocationDetail.id -ne $allocation.id) { Fail "Allocation detail record changed" }
    Pass "Allocation detail traceability"

    if ($ParticipantEmail -and $ParticipantPassword) {
        $participantLoginBody = @{
            email = $ParticipantEmail
            password = $ParticipantPassword
        } | ConvertTo-Json
        $participantLogin = Invoke-RestMethod `
            -Method POST `
            -Uri "$ApiUrl/api/auth/login" `
            -ContentType "application/json" `
            -Body $participantLoginBody
        $participantHeaders = @{ Authorization = "Bearer $($participantLogin.access_token)" }

        Expect-Forbidden `
            { Invoke-RestMethod -Uri "$ApiUrl/api/participants" -Headers $participantHeaders } `
            "Participant management list RBAC (403)"
        Expect-Forbidden `
            { Invoke-RestMethod -Uri "$ApiUrl/api/participants/$($participant.id)" -Headers $participantHeaders } `
            "Participant detail RBAC (403)"
    }

    Write-Host "All Step 1C.3 deployment checks passed." -ForegroundColor Cyan
}
catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}

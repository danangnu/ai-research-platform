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
    if ($health.version -notin @("0.3.1-step1c2", "0.4.0-step1c3", "0.5.0-step1c4", "0.6.0-step1c5", "0.7.0-step1d1", "0.7.1-recruitment-demo")) { Fail "Unexpected API version: $($health.version)" }
    Pass "Step 1C.2 API version"

    $loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
    $login = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/auth/login" `
        -ContentType "application/json" `
        -Body $loginBody
    $headers = @{ Authorization = "Bearer $($login.access_token)" }
    Pass "Administrator login"

    $before = Invoke-RestMethod -Uri "$ApiUrl/api/participants/allocation-summary" -Headers $headers

    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $applicationBody = @{
        preferred_name = "Step 1C.2 Synthetic Applicant"
        contact_email = "step1c2.$suffix@example.com"
        recruitment_source = "Step 1C.2 deployment verification"
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
        review_note = "Synthetic Step 1C.2 eligibility validation."
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
        note = "Synthetic Step 1C.2 selection validation only."
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
    if ($participant.allocation_status -ne "not_allocated") { Fail "Participant must begin unallocated" }
    if ($null -ne $participant.study_group) { Fail "Study group must be null before allocation" }
    Pass "Pseudonymous participant enrolled before allocation"

    $allocation = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/allocate" `
        -Headers $headers

    $allowedGroups = @("HumorBot", "STARCASM", "Control")
    if ($allowedGroups -notcontains $allocation.study_group) { Fail "Unexpected study group: $($allocation.study_group)" }
    if ($allocation.method -ne "balanced_random") { Fail "Unexpected allocation method: $($allocation.method)" }
    if ($allocation.algorithm_version -ne "balanced_random_v1") { Fail "Unexpected allocation algorithm version" }
    if ($allocation.allocation_basis.protocol_finalized -ne $false) { Fail "Foundation must remain marked protocol_finalized=false" }
    if (@($allocation.allocation_basis.tie_candidates) -notcontains $allocation.study_group) { Fail "Assigned group was not an eligible minimum-count tie candidate" }
    Pass "Server-side balanced random allocation recorded"

    $refreshed = Invoke-RestMethod -Uri "$ApiUrl/api/participants/$($participant.id)" -Headers $headers
    if ($refreshed.allocation_status -ne "allocated") { Fail "Participant allocation status did not persist" }
    if ($refreshed.study_group -ne $allocation.study_group) { Fail "Participant study group did not persist" }
    Pass "Allocation persisted to participant identity"

    $retry = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/allocate" `
        -Headers $headers
    if ($retry.id -ne $allocation.id) { Fail "Allocation retry created a new allocation record" }
    if ($retry.study_group -ne $allocation.study_group) { Fail "Allocation retry changed the study group" }
    Pass "Allocation immutability and idempotency"

    $after = Invoke-RestMethod -Uri "$ApiUrl/api/participants/allocation-summary" -Headers $headers
    if ($after.allocated -ne ($before.allocated + 1)) { Fail "Allocation summary did not increment exactly once" }
    $beforeChosen = [int]$before.groups.($allocation.study_group)
    $afterChosen = [int]$after.groups.($allocation.study_group)
    if ($afterChosen -ne ($beforeChosen + 1)) { Fail "Chosen group count did not increment exactly once" }
    if ($after.target_per_group -ne 200 -or $after.target_total -ne 600) { Fail "Allocation capacity is not 200/200/200 across 600" }
    Pass "200/200/200 allocation matrix metrics"

    if ($ParticipantEmail -and $ParticipantPassword) {
        $participantLoginBody = @{ email = $ParticipantEmail; password = $ParticipantPassword } | ConvertTo-Json
        $participantLogin = Invoke-RestMethod `
            -Method POST `
            -Uri "$ApiUrl/api/auth/login" `
            -ContentType "application/json" `
            -Body $participantLoginBody
        $participantHeaders = @{ Authorization = "Bearer $($participantLogin.access_token)" }
        try {
            Invoke-RestMethod `
                -Method POST `
                -Uri "$ApiUrl/api/participants/$($participant.id)/allocate" `
                -Headers $participantHeaders `
                -ErrorAction Stop | Out-Null
            Fail "Participant unexpectedly triggered allocation"
        }
        catch {
            if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw }
        }
        Pass "Participant allocation RBAC (403)"
    }

    $audit = Invoke-RestMethod -Uri "$ApiUrl/api/admin/audit?limit=200" -Headers $headers
    $allocationEvents = @($audit | Where-Object { $_.action -eq "participant.allocated" -and $_.entity_id -eq $participant.id })
    if ($allocationEvents.Count -ne 1) { Fail "Expected exactly one allocation audit event for the participant" }
    if ($allocationEvents[0].details.study_group -ne $allocation.study_group) { Fail "Allocation audit study group mismatch" }
    Pass "Immutable allocation audit trail"

    Write-Host "All Step 1C.2 deployment checks passed." -ForegroundColor Cyan
}
catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}


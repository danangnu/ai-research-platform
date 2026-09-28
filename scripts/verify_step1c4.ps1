param(
    [Parameter(Mandatory = $true)] [string] $ApiUrl,
    [Parameter(Mandatory = $true)] [string] $AdminEmail,
    [Parameter(Mandatory = $true)] [string] $AdminPassword
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

function Expect-Conflict([scriptblock] $Request, [string] $Description) {
    try {
        & $Request | Out-Null
        Fail "$Description was unexpectedly allowed"
    }
    catch {
        $statusCode = [int] $_.Exception.Response.StatusCode
        if ($statusCode -ne 409) { throw }
        Pass $Description
    }
}

try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health"
    if ($health.version -notin @("0.5.0-step1c4", "0.6.0-step1c5", "0.7.0-step1d1", "0.7.1-recruitment-demo")) { Fail "Unexpected API version: $($health.version)" }
    Pass "Step 1C.4 API version"

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
        preferred_name = "Step 1C.4 Synthetic Participant"
        contact_email = "step1c4.application.$suffix@example.com"
        recruitment_source = "Step 1C.4 deployment verification"
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
        review_note = "Synthetic Step 1C.4 account/RBAC validation."
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
        note = "Synthetic Step 1C.4 selection."
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

    $accountEmail = "step1c4.portal.$suffix@example.com"
    $accountPassword = "Step1C4-$suffix-Aa!"
    $accountBody = @{
        email = $accountEmail
        full_name = "Step 1C.4 Portal Participant"
        initial_password = $accountPassword
    } | ConvertTo-Json
    $link = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/account" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $accountBody
    if ($link.participant_id -ne $participant.id) { Fail "Account link does not match participant" }
    if ($link.account_status -ne "linked") { Fail "Account link status was not persisted" }
    if (-not $link.user_id) { Fail "Account link has no user ID" }
    Pass "Participant-only account created and linked"

    $retry = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/account" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $accountBody
    if ($retry.user_id -ne $link.user_id) { Fail "Account-link retry changed the user ID" }
    Pass "Participant account link idempotency"

    $conflictBody = @{
        email = "step1c4.conflict.$suffix@example.com"
        full_name = "Conflicting Participant"
        initial_password = $accountPassword
    } | ConvertTo-Json
    Expect-Conflict `
        { Invoke-RestMethod -Method POST -Uri "$ApiUrl/api/participants/$($participant.id)/account" -Headers $headers -ContentType "application/json" -Body $conflictBody } `
        "Participant account link immutability (409)"

    $participantLoginBody = @{ email = $accountEmail; password = $accountPassword } | ConvertTo-Json
    $participantLogin = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/auth/login" `
        -ContentType "application/json" `
        -Body $participantLoginBody
    $participantHeaders = @{ Authorization = "Bearer $($participantLogin.access_token)" }
    $participantRoles = @($participantLogin.user.roles)
    if ($participantRoles.Count -ne 1 -or $participantRoles[0] -ne "PARTICIPANT") {
        Fail "Linked login is not participant-only"
    }
    Pass "Linked participant login"

    $self = Invoke-RestMethod -Uri "$ApiUrl/api/participant/me" -Headers $participantHeaders
    if ($self.participant_id -ne $participant.id) { Fail "Self-service record does not match linked participant" }
    if ($self.participant_code -ne $participant.participant_code) { Fail "Self-service participant code changed" }
    if ($self.assigned_condition -ne $allocation.study_group) { Fail "Assigned condition is missing from self-service record" }
    Pass "Linked participant self-service identity"

    $required = @(
        "participant_id", "participant_code", "site_id", "lifecycle_status",
        "allocation_status", "assigned_condition", "enrolled_at", "account_status"
    )
    foreach ($field in $required) {
        $property = $self | Get-Member -Name $field -MemberType Properties
        if ($null -eq $property) { Fail "Missing participant self-service field: $field" }
    }
    $forbidden = @(
        "application_id", "user_id", "enrolled_by_id", "allocation_basis",
        "allocated_by_id", "algorithm_version", "method", "contact_email", "preferred_name"
    )
    foreach ($field in $forbidden) {
        if ($null -ne ($self | Get-Member -Name $field -MemberType Properties)) {
            Fail "Restricted field exposed to participant: $field"
        }
    }
    Pass "Participant self-service privacy boundary"

    Expect-Forbidden `
        { Invoke-RestMethod -Uri "$ApiUrl/api/participants" -Headers $participantHeaders } `
        "Participant management list RBAC (403)"
    Expect-Forbidden `
        { Invoke-RestMethod -Uri "$ApiUrl/api/participants/$($participant.id)" -Headers $participantHeaders } `
        "Arbitrary participant detail RBAC (403)"
    Expect-Forbidden `
        { Invoke-RestMethod -Uri "$ApiUrl/api/participants/$($participant.id)/allocation" -Headers $participantHeaders } `
        "Allocation trace RBAC (403)"
    Expect-Forbidden `
        { Invoke-RestMethod -Method POST -Uri "$ApiUrl/api/participants/$($participant.id)/account" -Headers $participantHeaders -ContentType "application/json" -Body $accountBody } `
        "Participant account-link administration RBAC (403)"
    Expect-Forbidden `
        { Invoke-RestMethod -Uri "$ApiUrl/api/recruitment/applications" -Headers $participantHeaders } `
        "Recruitment data RBAC (403)"
    Expect-Forbidden `
        { Invoke-RestMethod -Uri "$ApiUrl/api/projects" -Headers $participantHeaders } `
        "Project data RBAC (403)"
    Expect-Forbidden `
        { Invoke-RestMethod -Uri "$ApiUrl/api/admin/audit" -Headers $participantHeaders } `
        "Audit data RBAC (403)"

    $managed = Invoke-RestMethod `
        -Uri "$ApiUrl/api/participants/$($participant.id)" `
        -Headers $headers
    if ($managed.user_id -ne $link.user_id) { Fail "Account link did not persist to participant identity" }
    Pass "Participant account-link persistence"

    $auditRows = Invoke-RestMethod -Uri "$ApiUrl/api/admin/audit?limit=1000" -Headers $headers
    $accountAuditCount = 0
    foreach ($event in $auditRows) {
        if ($event.action -eq "participant.account_linked" -and $event.entity_id -eq $participant.id) {
            $accountAuditCount++
            if ($event.details.user_id -ne $link.user_id) { Fail "Account-link audit user ID is incorrect" }
            if ($null -ne ($event.details | Get-Member -Name "email" -MemberType Properties)) {
                Fail "Account email leaked into audit details"
            }
        }
    }
    if ($accountAuditCount -ne 1) { Fail "Expected one immutable account-link audit event; found $accountAuditCount" }
    Pass "Immutable participant account-link audit trail"

    Write-Host "All Step 1C.4 deployment checks passed." -ForegroundColor Cyan
}
catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}


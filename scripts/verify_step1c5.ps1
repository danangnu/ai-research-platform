param(
    [Parameter(Mandatory = $true)] [string] $ApiUrl,
    [Parameter(Mandatory = $true)] [string] $AdminEmail,
    [Parameter(Mandatory = $true)] [string] $AdminPassword
)

$ErrorActionPreference = "Stop"
$ApiUrl = $ApiUrl.TrimEnd("/")

function Pass([string] $Message) { Write-Host "PASS: $Message" -ForegroundColor Green }
function Fail([string] $Message) { Write-Host "FAIL: $Message" -ForegroundColor Red; exit 1 }

function Expect-Status([scriptblock] $Request, [int] $Expected, [string] $Description) {
    try {
        & $Request | Out-Null
        Fail "$Description was unexpectedly allowed"
    }
    catch {
        $statusCode = [int] $_.Exception.Response.StatusCode
        if ($statusCode -ne $Expected) { throw }
        Pass "$Description ($Expected)"
    }
}

function Login-Headers([string] $Email, [string] $Password) {
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json
    $login = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/auth/login" `
        -ContentType "application/json" `
        -Body $body
    return @{ Authorization = "Bearer $($login.access_token)" }
}

try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health"
    if ($health.version -ne "0.6.0-step1c5") { Fail "Unexpected API version: $($health.version)" }
    Pass "Step 1C.5 API version"

    $headers = Login-Headers $AdminEmail $AdminPassword
    Pass "Administrator login"

    $beforeParticipants = Invoke-RestMethod -Uri "$ApiUrl/api/participants" -Headers $headers
    $beforeMetrics = Invoke-RestMethod -Uri "$ApiUrl/api/participants/metrics" -Headers $headers
    $beforeSummary = Invoke-RestMethod -Uri "$ApiUrl/api/participants/allocation-summary" -Headers $headers
    $beforeApplications = Invoke-RestMethod -Uri "$ApiUrl/api/recruitment/applications" -Headers $headers

    $beforeParticipantCount = 0
    $beforeLinkedCount = 0
    $beforeApplicationCount = 0
    foreach ($row in $beforeParticipants) {
        $beforeParticipantCount++
        if ($row.user_id) { $beforeLinkedCount++ }
    }
    foreach ($row in $beforeApplications) { $beforeApplicationCount++ }
    if ([int] $beforeMetrics.participants -ne $beforeParticipantCount) { Fail "Initial participant count is inconsistent" }
    if ([int] $beforeMetrics.linked_accounts -ne $beforeLinkedCount) { Fail "Initial linked-account count is inconsistent" }
    Pass "Initial dashboard count baseline"

    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $applicationBody = @{
        preferred_name = "Step 1C.5 Synthetic Participant"
        contact_email = "step1c5.application.$suffix@example.com"
        recruitment_source = "Step 1C.5 consolidated deployment verification"
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
        review_note = "Synthetic Step 1C.5 eligibility decision."
    } | ConvertTo-Json
    $review = Invoke-RestMethod `
        -Method PATCH `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/review" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $reviewBody
    if ($review.status -ne "eligible") { Fail "Eligibility was not persisted" }
    Pass "Eligible applicant persisted"

    $selectionBody = @{
        status = "selected"
        note = "Synthetic Step 1C.5 selection."
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

    $enrollmentRetry = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/enroll" `
        -Headers $headers
    if ($enrollmentRetry.id -ne $participant.id) { Fail "Enrollment retry changed participant identity" }
    Pass "Enrollment idempotency"

    $lockedSelectionBody = @{ status = "waitlisted"; note = "Must remain locked." } | ConvertTo-Json
    Expect-Status `
        { Invoke-RestMethod -Method POST -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/selection" -Headers $headers -ContentType "application/json" -Body $lockedSelectionBody } `
        409 `
        "Post-enrollment selection immutability"
    $lockedReviewBody = @{ status = "ineligible"; review_note = "Must remain locked." } | ConvertTo-Json
    Expect-Status `
        { Invoke-RestMethod -Method PATCH -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/review" -Headers $headers -ContentType "application/json" -Body $lockedReviewBody } `
        409 `
        "Post-enrollment eligibility immutability"

    $allocation = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/allocate" `
        -Headers $headers
    if ($allocation.participant_id -ne $participant.id) { Fail "Allocation does not match participant" }
    if ($allocation.algorithm_version -ne "balanced_random_v1") { Fail "Allocation algorithm version changed" }
    if ($allocation.allocation_basis.protocol_finalized -ne $false) { Fail "Provisional protocol flag changed" }
    if ($allocation.study_group -notin @("HumorBot", "STARCASM", "Control")) { Fail "Unknown study group" }
    if ([int] $allocation.allocation_basis.counts_before.HumorBot -ne [int] $beforeSummary.groups.HumorBot) { Fail "HumorBot counts-before trace is incorrect" }
    if ([int] $allocation.allocation_basis.counts_before.STARCASM -ne [int] $beforeSummary.groups.STARCASM) { Fail "STARCASM counts-before trace is incorrect" }
    if ([int] $allocation.allocation_basis.counts_before.Control -ne [int] $beforeSummary.groups.Control) { Fail "Control counts-before trace is incorrect" }
    Pass "Accepted Step 1C.2 allocation trace"

    $allocationRetry = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/allocate" `
        -Headers $headers
    if ($allocationRetry.id -ne $allocation.id) { Fail "Allocation retry changed immutable record" }
    if ($allocationRetry.study_group -ne $allocation.study_group) { Fail "Allocation retry changed assigned condition" }
    Pass "Allocation immutability and idempotency"

    $accountEmail = "step1c5.portal.$suffix@example.com"
    $accountPassword = "Step1C5-$suffix-Aa!"
    $accountBody = @{
        email = $accountEmail
        full_name = "Step 1C.5 Portal Participant"
        initial_password = $accountPassword
    } | ConvertTo-Json
    $accountLink = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/account" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $accountBody
    if ($accountLink.participant_id -ne $participant.id -or -not $accountLink.user_id) { Fail "Account link is invalid" }
    Pass "Participant-only account linked"

    $accountRetry = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/participants/$($participant.id)/account" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $accountBody
    if ($accountRetry.user_id -ne $accountLink.user_id) { Fail "Account retry changed linked identity" }
    Pass "Account-link idempotency"

    $conflictBody = @{
        email = "step1c5.conflict.$suffix@example.com"
        full_name = "Conflicting Participant"
        initial_password = $accountPassword
    } | ConvertTo-Json
    Expect-Status `
        { Invoke-RestMethod -Method POST -Uri "$ApiUrl/api/participants/$($participant.id)/account" -Headers $headers -ContentType "application/json" -Body $conflictBody } `
        409 `
        "Account-link immutability"

    $participantHeaders = Login-Headers $accountEmail $accountPassword
    $self = Invoke-RestMethod -Uri "$ApiUrl/api/participant/me" -Headers $participantHeaders
    if ($self.participant_id -ne $participant.id) { Fail "Participant self record does not match account link" }
    if ($self.assigned_condition -ne $allocation.study_group) { Fail "Participant self condition does not match allocation" }
    Pass "Participant own-record identity"

    foreach ($field in @("application_id", "user_id", "allocation_basis", "algorithm_version", "events", "actor_user_id")) {
        if ($null -ne ($self | Get-Member -Name $field -MemberType Properties)) {
            Fail "Restricted participant self field exposed: $field"
        }
    }
    Pass "Participant self-service privacy boundary"

    # A fresh administrator session proves persistence independently of the
    # write requests and mirrors a browser refresh/sign-in cycle.
    $refreshHeaders = Login-Headers $AdminEmail $AdminPassword
    $refreshedParticipants = Invoke-RestMethod -Uri "$ApiUrl/api/participants" -Headers $refreshHeaders
    $detail = Invoke-RestMethod -Uri "$ApiUrl/api/participants/$($participant.id)" -Headers $refreshHeaders
    $allocationDetail = Invoke-RestMethod -Uri "$ApiUrl/api/participants/$($participant.id)/allocation" -Headers $refreshHeaders
    $trail = Invoke-RestMethod -Uri "$ApiUrl/api/participants/$($participant.id)/audit-trail" -Headers $refreshHeaders

    $matchCount = 0
    foreach ($row in $refreshedParticipants) {
        if ($row.id -eq $participant.id) { $matchCount++; $managed = $row }
    }
    if ($matchCount -ne 1) { Fail "Participant did not persist exactly once" }
    if ($detail.participant_code -ne $participant.participant_code) { Fail "Participant code changed after refresh" }
    if ($detail.user_id -ne $accountLink.user_id) { Fail "Account link did not persist after refresh" }
    if ($allocationDetail.id -ne $allocation.id) { Fail "Allocation record changed after refresh" }
    if ($managed.study_group -ne $allocation.study_group) { Fail "Managed participant condition changed after refresh" }
    Pass "Fresh-session lifecycle persistence"

    if ($trail.participant_id -ne $participant.id -or $trail.application_id -ne $application.id) {
        Fail "Audit trail correlation identifiers are incorrect"
    }
    $expectedActions = @(
        "recruitment.application_submitted",
        "recruitment.application_reviewed",
        "participant.selection_recorded",
        "participant.enrolled",
        "participant.allocated",
        "participant.account_linked"
    )
    foreach ($expectedAction in $expectedActions) {
        $actionCount = 0
        foreach ($event in $trail.events) {
            if ($event.action -eq $expectedAction) { $actionCount++ }
            if ($null -ne ($event | Get-Member -Name "ip_address" -MemberType Properties)) {
                Fail "IP address exposed by participant audit-trail contract"
            }
        }
        if ($actionCount -ne 1) { Fail "Expected one $expectedAction event; found $actionCount" }
    }
    if ($trail.events.Count -ne $expectedActions.Count) { Fail "Unexpected extra participant audit events" }
    Pass "Complete immutable six-event participant audit trail"

    $allocationAudit = $null
    $accountAudit = $null
    foreach ($event in $trail.events) {
        if ($event.action -eq "participant.allocated") { $allocationAudit = $event }
        if ($event.action -eq "participant.account_linked") { $accountAudit = $event }
    }
    if ($allocationAudit.details.study_group -ne $allocation.study_group) { Fail "Allocation audit condition is incorrect" }
    if ($allocationAudit.details.algorithm_version -ne "balanced_random_v1") { Fail "Allocation audit version is incorrect" }
    if ($accountAudit.details.user_id -ne $accountLink.user_id) { Fail "Account-link audit user ID is incorrect" }
    if ($null -ne ($accountAudit.details | Get-Member -Name "email" -MemberType Properties)) { Fail "Account email leaked into audit details" }
    Pass "Allocation and account audit traceability"

    $afterMetrics = Invoke-RestMethod -Uri "$ApiUrl/api/participants/metrics" -Headers $refreshHeaders
    $afterSummary = Invoke-RestMethod -Uri "$ApiUrl/api/participants/allocation-summary" -Headers $refreshHeaders
    $afterApplications = Invoke-RestMethod -Uri "$ApiUrl/api/recruitment/applications" -Headers $refreshHeaders
    $recruitmentMetrics = Invoke-RestMethod -Uri "$ApiUrl/api/recruitment/metrics" -Headers $refreshHeaders

    $rowCount = 0
    $enrolledCount = 0
    $allocatedCount = 0
    $linkedCount = 0
    $groupCounts = @{ HumorBot = 0; STARCASM = 0; Control = 0 }
    foreach ($row in $refreshedParticipants) {
        $rowCount++
        if ($row.lifecycle_status -eq "enrolled") { $enrolledCount++ }
        if ($row.allocation_status -eq "allocated") { $allocatedCount++ }
        if ($row.user_id) { $linkedCount++ }
        if ($row.study_group -in @("HumorBot", "STARCASM", "Control")) {
            $groupCounts[$row.study_group]++
        }
    }
    $applicationCount = 0
    foreach ($row in $afterApplications) { $applicationCount++ }

    if ([int] $afterMetrics.participants -ne $rowCount) { Fail "Total participant metric mismatch" }
    if ([int] $afterMetrics.enrolled -ne $enrolledCount) { Fail "Enrolled metric mismatch" }
    if ([int] $afterMetrics.allocated -ne $allocatedCount) { Fail "Allocated metric mismatch" }
    if ([int] $afterMetrics.linked_accounts -ne $linkedCount) { Fail "Linked-account metric mismatch" }
    if ([int] $afterMetrics.remaining_target -ne [Math]::Max(600 - $rowCount, 0)) { Fail "Remaining-target metric mismatch" }
    if ([int] $recruitmentMetrics.applications -ne $applicationCount) { Fail "Application metric mismatch" }
    if ([int] $afterSummary.allocated -ne ($groupCounts.HumorBot + $groupCounts.STARCASM + $groupCounts.Control)) { Fail "Allocation-summary total mismatch" }
    if ([int] $afterSummary.groups.HumorBot -ne $groupCounts.HumorBot) { Fail "HumorBot count mismatch" }
    if ([int] $afterSummary.groups.STARCASM -ne $groupCounts.STARCASM) { Fail "STARCASM count mismatch" }
    if ([int] $afterSummary.groups.Control -ne $groupCounts.Control) { Fail "Control count mismatch" }
    if ([int] $afterSummary.remaining_capacity -ne [Math]::Max(600 - $allocatedCount, 0)) { Fail "Remaining-capacity mismatch" }
    if ($afterSummary.protocol_finalized -ne $false) { Fail "Protocol-finalized boundary changed" }
    Pass "Participant, allocation and recruitment dashboard count reconciliation"

    if ([int] $afterMetrics.participants -ne ([int] $beforeMetrics.participants + 1)) { Fail "Participant metric did not increase by one" }
    if ([int] $afterMetrics.allocated -ne ([int] $beforeMetrics.allocated + 1)) { Fail "Allocated metric did not increase by one" }
    if ([int] $afterMetrics.linked_accounts -ne ([int] $beforeMetrics.linked_accounts + 1)) { Fail "Linked-account metric did not increase by one" }
    if ($applicationCount -ne ($beforeApplicationCount + 1)) { Fail "Application metric did not increase by one" }
    Pass "Expected dashboard count deltas"

    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/participants/$($participant.id)/audit-trail" -Headers $participantHeaders } `
        403 `
        "Participant audit-trail RBAC"
    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/participants/metrics" -Headers $participantHeaders } `
        403 `
        "Participant metrics RBAC"
    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/participants/allocation-summary" -Headers $participantHeaders } `
        403 `
        "Allocation summary RBAC"
    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/admin/audit" -Headers $participantHeaders } `
        403 `
        "Global audit RBAC"
    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/recruitment/applications" -Headers $participantHeaders } `
        403 `
        "Recruitment RBAC"
    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/projects" -Headers $participantHeaders } `
        403 `
        "Project RBAC"

    $refreshedParticipantHeaders = Login-Headers $accountEmail $accountPassword
    $refreshedSelf = Invoke-RestMethod -Uri "$ApiUrl/api/participant/me" -Headers $refreshedParticipantHeaders
    if ($refreshedSelf.participant_id -ne $self.participant_id) { Fail "Participant self identity changed after fresh login" }
    if ($refreshedSelf.assigned_condition -ne $self.assigned_condition) { Fail "Participant condition changed after fresh login" }
    Pass "Participant fresh-login persistence"

    Write-Host "All Step 1C.5 deployment checks passed." -ForegroundColor Cyan
}
catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}

param(
    [Parameter(Mandatory = $true)] [string] $ApiUrl,
    [Parameter(Mandatory = $true)] [string] $AdminEmail,
    [Parameter(Mandatory = $true)] [string] $AdminPassword,
    [Parameter(Mandatory = $true)] [string] $ParticipantEmail,
    [Parameter(Mandatory = $true)] [string] $ParticipantPassword
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
    if ($health.version -ne "0.7.0-step1d1") { Fail "Unexpected API version: $($health.version)" }
    Pass "Step 1D.1 API version"

    $headers = Login-Headers $AdminEmail $AdminPassword
    Pass "Administrator login"

    $participantHeaders = Login-Headers $ParticipantEmail $ParticipantPassword
    Pass "Participant login"

    $projects = @(Invoke-RestMethod -Uri "$ApiUrl/api/projects" -Headers $headers)
    if ($projects.Count -lt 1) { Fail "No project exists for protocol registration" }
    $project = $projects[0]
    Pass "Study project selected"

    $beforeSummary = Invoke-RestMethod `
        -Uri "$ApiUrl/api/study/protocols/summary?project_id=$($project.id)" `
        -Headers $headers
    $beforeAllocation = Invoke-RestMethod `
        -Uri "$ApiUrl/api/participants/allocation-summary" `
        -Headers $headers
    Pass "Protocol and allocation baseline"

    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $version = "acceptance-$suffix"
    $draftBody = @{
        project_id = $project.id
        version = $version
        title = "Step 1D.1 synthetic acceptance protocol"
        objective = "Validate protocol versioning, approval gates and immutable hashing."
        randomization_unit = "participant"
        allocation_method = "stratified_permuted_block"
        target_total = 600
        conditions = @(
            @{ code = "HumorBot"; label = "HumorBot"; target_n = 200 },
            @{ code = "STARCASM"; label = "STARCASM"; target_n = 200 },
            @{ code = "Control"; label = "Control"; target_n = 200 }
        )
        stratification_factors = @(
            @{
                key = "experience_band"
                label = "Professional experience band"
                source_field = "professional_experience_band"
                required = $true
                levels = @()
            }
        )
        task_blocks = @(
            @{ code = "task_a"; label = "Standardized task A" },
            @{ code = "task_b"; label = "Standardized task B" },
            @{ code = "task_c"; label = "Standardized task C" },
            @{ code = "task_d"; label = "Standardized task D" }
        )
        permitted_block_sizes = @(3, 6)
        protocol_document_ref = ""
        change_summary = "Incomplete synthetic draft used to verify approval gates."
    } | ConvertTo-Json -Depth 8
    $draft = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/study/protocols" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $draftBody
    if ($draft.status -ne "draft" -or $draft.configuration_hash) { Fail "Draft state is invalid" }
    Pass "Versioned protocol draft created"

    $blockedValidation = Invoke-RestMethod `
        -Uri "$ApiUrl/api/study/protocols/$($draft.id)/validation" `
        -Headers $headers
    if ($blockedValidation.approval_ready -ne $false -or $blockedValidation.errors.Count -lt 1) {
        Fail "Incomplete protocol was not blocked"
    }
    Pass "Incomplete stratification approval gate"

    Expect-Status `
        { Invoke-RestMethod -Method POST -Uri "$ApiUrl/api/study/protocols/$($draft.id)/approve" -Headers $headers } `
        409 `
        "Incomplete protocol approval"

    $updateBody = @{
        stratification_factors = @(
            @{
                key = "experience_band"
                label = "Professional experience band"
                source_field = "professional_experience_band"
                required = $true
                levels = @(
                    @{ code = "exp_1_3"; label = "1-3 years" },
                    @{ code = "exp_4_7"; label = "4-7 years" },
                    @{ code = "exp_8_15"; label = "8-15 years" }
                )
            }
        )
        protocol_document_ref = "synthetic://step1d1/$suffix"
        change_summary = "Completed synthetic configuration for deployment acceptance."
    } | ConvertTo-Json -Depth 8
    $updated = Invoke-RestMethod `
        -Method PATCH `
        -Uri "$ApiUrl/api/study/protocols/$($draft.id)" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $updateBody
    if ($updated.status -ne "draft" -or $updated.stratification_factors[0].levels.Count -ne 3) {
        Fail "Draft update did not persist"
    }
    Pass "Draft stratification configuration persisted"

    $validation = Invoke-RestMethod `
        -Uri "$ApiUrl/api/study/protocols/$($draft.id)/validation" `
        -Headers $headers
    if ($validation.approval_ready -ne $true -or $validation.valid -ne $true) { Fail "Complete protocol is not approval-ready" }
    if ($validation.configuration_hash.Length -ne 64) { Fail "Canonical configuration hash is invalid" }
    if ($validation.activation_ready -ne $false -or $validation.activation_blocker -notmatch "Step 1D.2") {
        Fail "Activation boundary is invalid"
    }
    Pass "Protocol validation and canonical hash"

    $approved = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/study/protocols/$($draft.id)/approve" `
        -Headers $headers
    if ($approved.status -ne "approved") { Fail "Protocol was not approved" }
    if ($approved.configuration_hash -ne $validation.configuration_hash) { Fail "Approved hash differs from validated hash" }
    if (-not $approved.approved_by_id -or -not $approved.approved_at) { Fail "Approval authority was not recorded" }
    Pass "Protocol approval authority and immutable hash"

    $approvalRetry = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/study/protocols/$($draft.id)/approve" `
        -Headers $headers
    if ($approvalRetry.configuration_hash -ne $approved.configuration_hash) { Fail "Approval retry changed the hash" }
    Pass "Protocol approval idempotency"

    $immutableBody = @{ target_total = 603 } | ConvertTo-Json
    Expect-Status `
        { Invoke-RestMethod -Method PATCH -Uri "$ApiUrl/api/study/protocols/$($draft.id)" -Headers $headers -ContentType "application/json" -Body $immutableBody } `
        409 `
        "Approved protocol immutability"
    Expect-Status `
        { Invoke-RestMethod -Method POST -Uri "$ApiUrl/api/study/protocols/$($draft.id)/activate" -Headers $headers } `
        409 `
        "Step 1D.2 activation gate"

    $refreshHeaders = Login-Headers $AdminEmail $AdminPassword
    $persisted = Invoke-RestMethod `
        -Uri "$ApiUrl/api/study/protocols/$($draft.id)" `
        -Headers $refreshHeaders
    if ($persisted.status -ne "approved" -or $persisted.configuration_hash -ne $approved.configuration_hash) {
        Fail "Approved protocol did not persist in a fresh session"
    }
    Pass "Fresh-session protocol persistence"

    $afterSummary = Invoke-RestMethod `
        -Uri "$ApiUrl/api/study/protocols/summary?project_id=$($project.id)" `
        -Headers $refreshHeaders
    if ([int] $afterSummary.total_versions -ne ([int] $beforeSummary.total_versions + 1)) { Fail "Protocol version count did not increase by one" }
    if ([int] $afterSummary.approved -ne ([int] $beforeSummary.approved + 1)) { Fail "Approved count did not increase by one" }
    if ([int] $afterSummary.active -ne [int] $beforeSummary.active) { Fail "An active protocol was created prematurely" }
    if ($afterSummary.allocation_engine_connected -ne $false) { Fail "Final engine was reported as connected" }
    Pass "Protocol registry count reconciliation"

    $afterAllocation = Invoke-RestMethod `
        -Uri "$ApiUrl/api/participants/allocation-summary" `
        -Headers $refreshHeaders
    if ($afterAllocation.algorithm_version -ne "balanced_random_v1") { Fail "Accepted allocation foundation changed" }
    if ($afterAllocation.protocol_finalized -ne $false) { Fail "Provisional allocation boundary changed" }
    if ([int] $afterAllocation.allocated -ne [int] $beforeAllocation.allocated) { Fail "Protocol verification changed allocation counts" }
    Pass "Accepted Step 1C allocation boundary preserved"

    $audit = @(Invoke-RestMethod -Uri "$ApiUrl/api/admin/audit?limit=100" -Headers $refreshHeaders)
    $protocolAudit = @($audit | Where-Object { $_.entity_id -eq $draft.id })
    foreach ($expectedAction in @("protocol.created", "protocol.updated", "protocol.approved")) {
        if (@($protocolAudit | Where-Object { $_.action -eq $expectedAction }).Count -ne 1) {
            Fail "Expected one $expectedAction audit event"
        }
    }
    $approvalAudit = $protocolAudit | Where-Object { $_.action -eq "protocol.approved" } | Select-Object -First 1
    if ($approvalAudit.details.configuration_hash -ne $approved.configuration_hash) { Fail "Approval audit hash is incorrect" }
    Pass "Immutable protocol audit trail"

    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/study/protocols" -Headers $participantHeaders } `
        403 `
        "Participant protocol-list RBAC"
    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/study/protocols/summary" -Headers $participantHeaders } `
        403 `
        "Participant protocol-summary RBAC"
    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/study/protocols/$($draft.id)" -Headers $participantHeaders } `
        403 `
        "Participant protocol-detail RBAC"
    Expect-Status `
        { Invoke-RestMethod -Uri "$ApiUrl/api/study/protocols/$($draft.id)/validation" -Headers $participantHeaders } `
        403 `
        "Participant protocol-validation RBAC"
    Expect-Status `
        { Invoke-RestMethod -Method POST -Uri "$ApiUrl/api/study/protocols/$($draft.id)/approve" -Headers $participantHeaders } `
        403 `
        "Participant protocol-approval RBAC"
    Expect-Status `
        { Invoke-RestMethod -Method POST -Uri "$ApiUrl/api/study/protocols/$($draft.id)/activate" -Headers $participantHeaders } `
        403 `
        "Participant protocol-activation RBAC"

    Write-Host "All Step 1D.1 deployment checks passed." -ForegroundColor Cyan
}
catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}

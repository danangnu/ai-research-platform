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
    $info = Invoke-RestMethod -Uri "$ApiUrl/api/public/recruitment/info"
    if (-not $info.recruitment_open) { Fail "Recruitment intake is not open" }
    Pass "Public recruitment information"

    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $syntheticEmail = "step1b.$suffix@example.com"
    $applicationBody = @{
        preferred_name = "Step 1B Synthetic Applicant"
        contact_email = $syntheticEmail
        recruitment_source = "Step 1B deployment verification"
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
    if (-not $application.reference_code.StartsWith("APP-")) { Fail "Applicant reference was not issued" }
    Pass "Synthetic application submission and applicant reference"

    $loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
    $login = Invoke-RestMethod `
        -Method POST `
        -Uri "$ApiUrl/api/auth/login" `
        -ContentType "application/json" `
        -Body $loginBody
    $headers = @{ Authorization = "Bearer $($login.access_token)" }
    Pass "Administrator login"

    $applications = Invoke-RestMethod -Uri "$ApiUrl/api/recruitment/applications" -Headers $headers
    if (-not ($applications | Where-Object id -eq $application.id)) { Fail "Submitted application is not visible to recruitment staff" }
    Pass "Recruitment staff application queue"

    $reviewBody = @{
        status = "needs_review"
        review_note = "Synthetic Step 1B deployment verification."
    } | ConvertTo-Json
    $review = Invoke-RestMethod `
        -Method PATCH `
        -Uri "$ApiUrl/api/recruitment/applications/$($application.id)/review" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $reviewBody
    if ($review.status -ne "needs_review") { Fail "Eligibility review status was not persisted" }
    Pass "Eligibility review persistence"

    if ($ParticipantEmail -and $ParticipantPassword) {
        $participantBody = @{ email = $ParticipantEmail; password = $ParticipantPassword } | ConvertTo-Json
        $participantLogin = Invoke-RestMethod `
            -Method POST `
            -Uri "$ApiUrl/api/auth/login" `
            -ContentType "application/json" `
            -Body $participantBody
        $participantHeaders = @{ Authorization = "Bearer $($participantLogin.access_token)" }
        try {
            Invoke-RestMethod -Uri "$ApiUrl/api/recruitment/applications" -Headers $participantHeaders -ErrorAction Stop | Out-Null
            Fail "Participant unexpectedly accessed recruitment applications"
        } catch {
            if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw }
            Pass "Participant recruitment RBAC (403)"
        }
    }

    Write-Host "All Step 1B deployment checks passed." -ForegroundColor Cyan
}
catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}

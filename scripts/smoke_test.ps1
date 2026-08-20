$ErrorActionPreference = "Stop"

$BaseUrl = "http://127.0.0.1:8000"
$Email = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@example.com" }
$Password = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "ChangeMe123!" }

Write-Host "AI Research Platform Step 1A acceptance smoke test" -ForegroundColor Cyan

$health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get
if ($health.status -ne "ok") { throw "Health check failed." }
Write-Host "PASS: backend health"

$loginBody = @{
    email = $Email
    password = $Password
} | ConvertTo-Json

$login = Invoke-RestMethod `
    -Uri "$BaseUrl/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $loginBody

$token = $login.access_token
if (-not $token) { throw "Login did not return a token." }
Write-Host "PASS: admin login"

$headers = @{
    Authorization = "Bearer $token"
}

$me = Invoke-RestMethod `
    -Uri "$BaseUrl/api/auth/me" `
    -Headers $headers

if ($me.roles -notcontains "PROJECT_ADMIN") {
    throw "Seed administrator is missing PROJECT_ADMIN."
}
Write-Host "PASS: RBAC administrator role"

$suffix = Get-Date -Format "HHmmss"

$project = Invoke-RestMethod `
    -Uri "$BaseUrl/api/projects" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
        code = "STEP1A-$suffix"
        name = "Step 1A Acceptance Project"
        description = "Automated acceptance project."
        status = "planning"
    } | ConvertTo-Json)

Write-Host "PASS: project creation"

$milestone = Invoke-RestMethod `
    -Uri "$BaseUrl/api/projects/$($project.id)/milestones" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
        code = "M1"
        name = "Foundation Acceptance"
        status = "in_progress"
    } | ConvertTo-Json)

Write-Host "PASS: milestone creation"

$task = Invoke-RestMethod `
    -Uri "$BaseUrl/api/projects/$($project.id)/tasks" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
        milestone_id = $milestone.id
        title = "Run Step 1A smoke test"
        priority = "high"
        status = "in_progress"
    } | ConvertTo-Json)

Write-Host "PASS: task creation"

$updatedTask = Invoke-RestMethod `
    -Uri "$BaseUrl/api/projects/$($project.id)/tasks/$($task.id)" `
    -Method Patch `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
        status = "completed"
        note = "Acceptance smoke test completed."
    } | ConvertTo-Json)

if ($updatedTask.status -ne "completed") {
    throw "Task update failed."
}
Write-Host "PASS: task update and task note"

$risk = Invoke-RestMethod `
    -Uri "$BaseUrl/api/projects/$($project.id)/risks" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
        title = "Acceptance-test risk"
        level = "low"
        mitigation = "Synthetic only."
        status = "open"
    } | ConvertTo-Json)

Write-Host "PASS: risk creation"

$site = Invoke-RestMethod `
    -Uri "$BaseUrl/api/admin/study-sites" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
        code = "SMOKE-$suffix"
        name = "Smoke Test Research Site"
        status = "active"
    } | ConvertTo-Json)

Write-Host "PASS: study-site creation"

$audit = Invoke-RestMethod `
    -Uri "$BaseUrl/api/admin/audit?limit=100" `
    -Headers $headers

if ($audit.Count -lt 1) {
    throw "Audit log is empty."
}
Write-Host "PASS: audit trail"

try {
    Invoke-RestMethod `
        -Uri "$BaseUrl/api/admin/audit" `
        -Method Get `
        -ErrorAction Stop | Out-Null

    throw "Unauthenticated audit request unexpectedly succeeded."
}
catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 401) {
        throw
    }
}
Write-Host "PASS: unauthenticated admin access denied"

Write-Host ""
Write-Host "All Step 1A acceptance smoke checks passed." -ForegroundColor Green

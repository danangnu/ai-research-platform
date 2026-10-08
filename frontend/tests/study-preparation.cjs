// Run against a disposable local database with DEMO_MODE=true.
// PREP_UI_URL, PREP_API_URL, PREP_ADMIN_EMAIL and PREP_ADMIN_PASSWORD are required.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.PREP_UI_URL,
  api = process.env.PREP_API_URL;
if (!base || !api || !process.env.PREP_ADMIN_PASSWORD)
  throw Error("Set local acceptance environment variables.");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-zygote",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function call(path, method = "GET", body, token) {
    const r = await fetch(api + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw Error(path + ": " + (await r.text()));
    return r.json();
  }
  async function login(p, email, password) {
    await p.goto(base + "/#signin");
    await p.getByLabel("Email", { exact: true }).fill(email);
    await p.getByLabel("Password", { exact: true }).fill(password);
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  const auth = await call("/api/auth/login", "POST", {
    email: process.env.PREP_ADMIN_EMAIL,
    password: process.env.PREP_ADMIN_PASSWORD,
  });
  const token = auth.access_token;
  await login(
    page,
    process.env.PREP_ADMIN_EMAIL,
    process.env.PREP_ADMIN_PASSWORD,
  );
  await page
    .getByRole("button", { name: "Study preparation", exact: true })
    .click();
  const version = "browser-" + Date.now();
  await page.getByLabel("Version name").fill(version);
  await page.getByRole("button", { name: "Save immutable version" }).click();
  await page.getByRole("status").filter({ hasText: "Version saved" }).waitFor();
  await page
    .getByLabel("Copy a saved version")
    .selectOption({ label: version });
  await page.getByLabel("Version name").fill(version + "-ready");
  for (const label of ["Background questionnaire", "Pre-test", "Post-test"]) {
    await page
      .getByRole("button", { name: new RegExp("^" + label + " \\(") })
      .click();
    await page
      .getByRole("button", { name: "Add question", exact: true })
      .click();
    await page
      .getByLabel("Question text")
      .fill("Fictional " + label + " response");
  }
  await page.getByRole("button", { name: "Save immutable version" }).click();
  await page.getByRole("status").filter({ hasText: "Version saved" }).waitFor();
  const email = "browser." + Date.now() + "@example.com";
  const app = await call("/api/public/recruitment/applications", "POST", {
    preferred_name: "Fictional browser fixture",
    contact_email: email,
    consent_to_screen: true,
    informed_consent_accepted: true,
    informed_consent_version: "committee-consent-draft-2026-10-08",
    privacy_acknowledged: true,
    screening_answers: {
      demo_online_access: true,
      demo_instruction_language: true,
      demo_schedule_availability: true,
    },
  });
  const uri = "/api/recruitment/applications/" + app.id;
  await call(uri + "/review", "PATCH", { status: "eligible" }, token);
  await call(uri + "/selection", "POST", { status: "selected" }, token);
  const p = await call(uri + "/enroll", "POST", undefined, token);
  await call(
    "/api/participants/" + p.id + "/account",
    "POST",
    {
      initial_password: "SyntheticBrowser123!",
    },
    token,
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Study preparation", exact: true })
    .click();
  await page
    .getByLabel(/^Configuration/)
    .selectOption({ label: version + "-ready" });
  await page
    .getByLabel(/^Participant/)
    .selectOption({ label: p.participant_code });
  await page.getByLabel("This is a fictional walkthrough").check();
  await page
    .getByRole("button", { name: "Assign version", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Configuration assigned" })
    .waitFor();
  const participant = await browser.newPage({
    viewport: { width: 1100, height: 900 },
  });
  participant.on("pageerror", (e) => errors.push(e.message));
  await login(participant, email, "SyntheticBrowser123!");
  for (const label of ["Background questionnaire", "Pre-test"]) {
    await participant
      .getByLabel("1. Fictional " + label + " response (required)")
      .fill("Fictional response");
    await participant.getByLabel("These are fictional demo responses.").check();
    await participant
      .getByRole("button", { name: "Save responses", exact: true })
      .click();
  }
  await participant
    .getByText(
      "The questionnaire and pre-test are saved. Staff will assign a study group.",
    )
    .waitFor();
  await call(
    "/api/participants/" + p.id + "/allocate",
    "POST",
    undefined,
    token,
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Study preparation", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: p.participant_code })
    .getByRole("button", { name: "Start period" })
    .click();
  await page.getByRole("status").filter({hasText:"Interaction period started"}).waitFor();
  await participant.getByRole("button", { name: "Refresh status" }).click();
  await participant
    .getByRole("heading", { name: "Record today’s interaction" })
    .waitFor();
  await participant.getByLabel("Minutes", { exact: true }).fill("6");
  await participant.getByLabel("These are fictional demo responses.").check();
  await participant
    .getByRole("button", { name: "Save responses", exact: true })
    .click();
  await participant
    .getByText("Today’s log is saved.", { exact: false })
    .waitFor();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full study export (ZIP)" })
    .click();
  assert.equal(
    (await download).suggestedFilename(),
    "study-research-export.zip",
  );
  fs.mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/preparation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile overflow",
  );
  await page.screenshot({
    path: "test-results/preparation-mobile.png",
    fullPage: true,
  });
  await participant.screenshot({
    path: "test-results/preparation-participant.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Preparation browser acceptance passed: edit, assign, questionnaire, pre-test, start, log, export, mobile.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

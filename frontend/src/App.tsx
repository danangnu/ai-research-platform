import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  AuditEvent,
  login,
  Milestone,
  Project,
  RecruitmentApplication,
  RecruitmentMetrics,
  RecruitmentPublicInfo,
  recruitmentApi,
  Risk,
  setToken,
  StudySite,
  StudyTask,
  User,
} from "./api";

type Page =
  | "overview"
  | "recruitment"
  | "participants"
  | "study"
  | "models"
  | "analysis"
  | "project"
  | "admin";

const NAV: { page: Page; label: string; step1a: boolean }[] = [
  { page: "overview", label: "Overview", step1a: true },
  { page: "recruitment", label: "Recruitment", step1a: true },
  { page: "participants", label: "Participants", step1a: false },
  { page: "study", label: "Study", step1a: false },
  { page: "models", label: "Models", step1a: false },
  { page: "analysis", label: "Analysis", step1a: false },
  { page: "project", label: "Project", step1a: true },
  { page: "admin", label: "Admin", step1a: true },
];

const PROJECT_READ_ROLES = new Set([
  "PROJECT_ADMIN",
  "RESEARCH_LEAD",
  "AI_ML_RESEARCH_ENGINEER",
  "RESEARCH_ASSISTANT",
]);

const PROJECT_WRITE_ROLES = new Set([
  "PROJECT_ADMIN",
  "RESEARCH_LEAD",
]);

const PROJECT_TASK_WRITE_ROLES = new Set([
  "PROJECT_ADMIN",
  "RESEARCH_LEAD",
  "AI_ML_RESEARCH_ENGINEER",
  "RESEARCH_ASSISTANT",
]);

const ADMIN_ROLES = new Set([
  "PROJECT_ADMIN",
  "RESEARCH_LEAD",
]);

const RECRUITMENT_ROLES = new Set([
  "PROJECT_ADMIN",
  "RESEARCH_LEAD",
  "RESEARCH_ASSISTANT",
]);

function hasAnyRole(user: User, allowed: Set<string>) {
  return user.roles.some((role) => allowed.has(role));
}

function canReadProjects(user: User) {
  return hasAnyRole(user, PROJECT_READ_ROLES);
}

function canWriteProjects(user: User) {
  return hasAnyRole(user, PROJECT_WRITE_ROLES);
}

function canWriteProjectTasks(user: User) {
  return hasAnyRole(user, PROJECT_TASK_WRITE_ROLES);
}

function canAdminister(user: User) {
  return hasAnyRole(user, ADMIN_ROLES);
}

function canRecruit(user: User) {
  return hasAnyRole(user, RECRUITMENT_ROLES);
}

function visibleNavigation(user: User) {
  return NAV.filter((item) => {
    if (item.page === "overview") return true;
    if (item.page === "recruitment") return canRecruit(user);
    if (item.page === "project") return canReadProjects(user);
    if (item.page === "admin") return canAdminister(user);
    if (item.page === "study") return true;
    return canReadProjects(user);
  });
}

const DEMO_MODE =
  String(import.meta.env.VITE_DEMO_MODE || "false").toLowerCase() === "true";

function DemoBanner() {
  if (!DEMO_MODE) return null;

  return (
    <div className="demo-banner">
      DEMO ENVIRONMENT · Do not enter real participant, clinical, neurological,
      health or other sensitive information.
    </div>
  );
}

function LoginScreen({
  onLogin,
  onApply,
}: {
  onLogin: (user: User) => void;
  onApply: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = await login(email, password);
      setToken(result.access_token);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <DemoBanner />
      <div className="login-card">
        <div className="brand-mark">AR</div>
        <p className="eyebrow">Research Operations</p>
        <h1>AI Research Study Management Platform</h1>
        <p className="muted">
          Step 1B · Recruitment intake and eligibility review
        </p>

        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
            />
          </label>

          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-divider"><span>or</span></div>
        <button className="apply-button" type="button" onClick={onApply}>
          Open recruitment application
        </button>

        <p className="tiny">
          Use the demo credentials supplied by the project administrator.
          Recruitment is also synthetic/demo-only until approved protocol,
          consent, privacy and governance requirements are configured.
        </p>
      </div>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <section className="panel">
      <p className="eyebrow">Planned module</p>
      <h2>{title}</h2>
      <p className="muted">
        The navigation position is reserved now so later study modules fit
        into the same architecture. Step 1A deliberately does not implement
        participant allocation, pre/post tests or model-study interactions.
      </p>
    </section>
  );
}

function Overview({
  projects,
  tasks,
  risks,
  recruitmentMetrics,
}: {
  projects: Project[];
  tasks: StudyTask[];
  risks: Risk[];
  recruitmentMetrics: RecruitmentMetrics | null;
}) {
  const openTasks = tasks.filter((task) => task.status !== "completed").length;
  const openRisks = risks.filter((risk) => risk.status === "open").length;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Study operations</p>
          <h1>Project Overview</h1>
          <p className="muted">
            Foundation dashboard for the 600-participant HumorBot,
            STARCASM and control-group study.
          </p>
        </div>
        <span className="status-pill">Step 1B</span>
      </div>

      <div className="metric-grid">
        <Metric label="Projects" value={projects.length} />
        <Metric label="Open tasks" value={openTasks} />
        <Metric label="Open risks" value={openRisks} />
        <Metric label="Applications" value={recruitmentMetrics?.applications ?? 0} />
      </div>

      <div className="two-col">
        <section className="panel">
          <p className="eyebrow">Recruitment matrix</p>
          <h2>Study target</h2>
          <GroupBar label="HumorBot" current={0} target={200} />
          <GroupBar label="STARCASM" current={0} target={200} />
          <GroupBar label="Control" current={0} target={200} />
          <p className="tiny">
            Group counts remain zero until the later selection/allocation workflow
            is approved and implemented.
          </p>
        </section>

        <section className="panel">
          <p className="eyebrow">Current stage</p>
          <h2>Recruitment intake & review</h2>
          <ul className="checklist">
            <li>Step 1A foundation accepted</li>
            <li>Public synthetic application intake</li>
            <li>Consent-to-screen capture</li>
            <li>Applicant reference issuance</li>
            <li>Eligibility-review workflow</li>
          </ul>
        </section>
      </div>
    </>
  );
}

function LimitedOverview({ user }: { user: User }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Participant access</p>
          <h1>Study Portal</h1>
          <p className="muted">
            Signed in as {user.full_name}. Project-management and
            administrative research data are not available to this role.
          </p>
        </div>
        <span className="status-pill">{user.roles[0] || "USER"}</span>
      </div>

      <div className="two-col">
        <section className="panel">
          <p className="eyebrow">Access boundary</p>
          <h2>Participant workspace</h2>
          <p className="muted">
            Step 1A verifies authentication and least-privilege access.
            Participant study activities, pre/post testing and assigned
            sessions will be added in later study phases.
          </p>
        </section>

        <section className="panel">
          <p className="eyebrow">Security</p>
          <h2>Management data protected</h2>
          <p className="muted">
            Project, risk, milestone, study-site and audit data are restricted
            by the backend RBAC policy and are not loaded into this view.
          </p>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GroupBar({
  label,
  current,
  target,
}: {
  label: string;
  current: number;
  target: number;
}) {
  const percent = Math.min(100, (current / target) * 100);

  return (
    <div className="group-row">
      <div className="group-label">
        <span>{label}</span>
        <strong>
          {current} / {target}
        </strong>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function PublicRecruitment({ onBack }: { onBack: () => void }) {
  const [info, setInfo] = useState<RecruitmentPublicInfo | null>(null);
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    recruitmentApi.publicInfo()
      .then(setInfo)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Unable to load recruitment information."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");

    try {
      const application = await recruitmentApi.submitApplication({
        preferred_name: data.get("preferred_name"),
        contact_email: data.get("contact_email"),
        site_id: data.get("site_id") || null,
        recruitment_source: data.get("recruitment_source") || "",
        consent_to_screen: data.get("consent_to_screen") === "on",
        privacy_acknowledged: data.get("privacy_acknowledged") === "on",
        screening_answers: {
          demo_online_access: data.get("demo_online_access") === "true",
          demo_instruction_language: data.get("demo_instruction_language") === "true",
          demo_schedule_availability: data.get("demo_schedule_availability") === "true",
        },
      });
      form.reset();
      setReference(application.reference_code);
      setMessage("Synthetic demo application submitted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to submit application.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-recruitment-shell">
      <DemoBanner />
      <main className="public-recruitment-content">
        <button type="button" className="back-link" onClick={onBack}>← Staff sign in</button>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Public recruitment · Step 1B</p>
            <h1>{info?.study_name || "Research study recruitment"}</h1>
            <p className="muted">
              Submit a synthetic screening application and receive an applicant reference.
              This demo does not enroll or allocate a participant.
            </p>
          </div>
          <span className="status-pill">Recruitment demo</span>
        </div>

        {!info ? (
          <section className="panel"><p className="muted">Loading recruitment information…</p></section>
        ) : !info.recruitment_open ? (
          <section className="panel"><h2>Recruitment intake is closed</h2></section>
        ) : (
          <div className="two-col public-recruitment-grid">
            <section className="panel">
              <p className="eyebrow">Study information</p>
              <h2>Recruitment target</h2>
              <p className="muted">
                Target: {info.target_total} participants across HumorBot, STARCASM and Control.
              </p>
              <div className="lifecycle compact-lifecycle">
                <span>Application</span><b>→</b><span>Screening</span><b>→</b>
                <span>Eligibility review</span><b>→</b><span>Later selection</span>
              </div>
              <div className="protocol-warning">
                <strong>Protocol gate</strong>
                <p>
                  Eligibility/exclusion rules and approved participant-facing consent text are not
                  configured yet. The three screening fields below demonstrate questionnaire plumbing
                  only and do not automatically determine eligibility.
                </p>
              </div>
            </section>

            <section className="panel">
              <h2>Screening application</h2>
              {message && <div className="alert">{message}</div>}
              {reference && (
                <div className="reference-card">
                  <span>Applicant reference</span>
                  <strong>{reference}</strong>
                  <small>Keep this synthetic reference for the demo.</small>
                </div>
              )}
              <form className="compact-form" onSubmit={submit}>
                <input name="preferred_name" placeholder="Preferred name / demo alias" required />
                <input name="contact_email" type="email" placeholder="Synthetic contact email" required />
                <select name="site_id" defaultValue="">
                  <option value="">No study site selected</option>
                  {info.sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.code} · {site.name}</option>
                  ))}
                </select>
                <input name="recruitment_source" placeholder="Recruitment source (optional)" />

                <fieldset className="screening-fieldset">
                  <legend>Demo screening questionnaire — not approved eligibility criteria</legend>
                  <label>Can you access the online study environment?
                    <select name="demo_online_access" required defaultValue="">
                      <option value="" disabled>Select</option><option value="true">Yes</option><option value="false">No</option>
                    </select>
                  </label>
                  <label>Can you follow the study instructions in English?
                    <select name="demo_instruction_language" required defaultValue="">
                      <option value="" disabled>Select</option><option value="true">Yes</option><option value="false">No</option>
                    </select>
                  </label>
                  <label>Can you attend scheduled study activities?
                    <select name="demo_schedule_availability" required defaultValue="">
                      <option value="" disabled>Select</option><option value="true">Yes</option><option value="false">No</option>
                    </select>
                  </label>
                </fieldset>

                <label className="check-row">
                  <input type="checkbox" name="consent_to_screen" required />
                  <span>I acknowledge the demo consent-to-screen statement. It is not approved research consent.</span>
                </label>
                <label className="check-row">
                  <input type="checkbox" name="privacy_acknowledged" required />
                  <span>I understand this environment must use synthetic data only.</span>
                </label>
                <button className="primary" disabled={busy}>{busy ? "Submitting…" : "Submit screening application"}</button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Recruitment({
  info,
  applications,
  metrics,
  reload,
}: {
  info: RecruitmentPublicInfo | null;
  applications: RecruitmentApplication[];
  metrics: RecruitmentMetrics | null;
  reload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const selected = applications.find((item) => item.id === selectedId) || applications[0] || null;

  useEffect(() => {
    if (!selectedId && applications.length) setSelectedId(applications[0].id);
    if (selectedId && !applications.some((item) => item.id === selectedId)) {
      setSelectedId(applications[0]?.id || "");
    }
  }, [applications, selectedId]);

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await recruitmentApi.review(selected.id, {
        status: data.get("status"),
        review_note: data.get("review_note") || "",
      });
      setMessage(`Review saved for ${selected.reference_code}.`);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save eligibility review.");
    }
  }

  const siteName = (siteId: string | null) => {
    if (!siteId) return "No site";
    return info?.sites.find((site) => site.id === siteId)?.name || "Unknown site";
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Recruitment operations</p>
          <h1>Applications & Eligibility Review</h1>
          <p className="muted">
            Step 1B separates applicants from enrolled participants. No group allocation or participant account is created here.
          </p>
        </div>
        <span className="status-pill">Step 1B</span>
      </div>

      {message && <div className="alert">{message}</div>}

      <div className="metric-grid">
        <Metric label="Applications" value={metrics?.applications ?? 0} />
        <Metric label="Submitted" value={metrics?.submitted ?? 0} />
        <Metric label="Needs review" value={metrics?.needs_review ?? 0} />
        <Metric label="Eligible" value={metrics?.eligible ?? 0} />
      </div>

      <div className="two-col recruitment-review-grid">
        <section className="panel">
          <div className="panel-heading-row">
            <div><p className="eyebrow">Applicant queue</p><h2>Recruitment applications</h2></div>
            <span className="tag">{applications.length} total</span>
          </div>
          <div className="list recruitment-list">
            {applications.map((application) => (
              <button
                type="button"
                className={`application-row ${selected?.id === application.id ? "selected" : ""}`}
                key={application.id}
                onClick={() => setSelectedId(application.id)}
              >
                <div>
                  <strong>{application.reference_code}</strong>
                  <span>{application.preferred_name} · {siteName(application.site_id)}</span>
                </div>
                <span className={`tag recruitment-${application.status}`}>{application.status.replaceAll("_", " ")}</span>
              </button>
            ))}
            {!applications.length && <p className="muted">No recruitment applications yet.</p>}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Eligibility review</p>
          {!selected ? <p className="muted">Select an application to review.</p> : (
            <>
              <h2>{selected.reference_code}</h2>
              <dl className="detail-grid">
                <div><dt>Demo alias</dt><dd>{selected.preferred_name}</dd></div>
                <div><dt>Contact</dt><dd>{selected.contact_email}</dd></div>
                <div><dt>Site</dt><dd>{siteName(selected.site_id)}</dd></div>
                <div><dt>Submitted</dt><dd>{new Date(selected.submitted_at).toLocaleString()}</dd></div>
                <div><dt>Consent version</dt><dd>{selected.consent_version}</dd></div>
                <div><dt>Current status</dt><dd>{selected.status.replaceAll("_", " ")}</dd></div>
              </dl>
              <div className="screening-summary">
                <strong>Demo questionnaire responses</strong>
                {Object.entries(selected.screening_answers).map(([key, value]) => (
                  <div key={key}><span>{key.replaceAll("demo_", "").replaceAll("_", " ")}</span><b>{value ? "Yes" : "No"}</b></div>
                ))}
              </div>
              <div className="protocol-warning">
                <strong>No automatic eligibility rule</strong>
                <p>Final inclusion/exclusion criteria must come from the approved research protocol. This review records workflow status only.</p>
              </div>
              <form className="compact-form" onSubmit={review} key={`${selected.id}-${selected.updated_at}`}>
                <select name="status" defaultValue={selected.status === "submitted" ? "under_review" : selected.status}>
                  <option value="under_review">Under review</option>
                  <option value="needs_review">Needs review</option>
                  <option value="eligible">Eligible</option>
                  <option value="ineligible">Ineligible</option>
                </select>
                <textarea name="review_note" rows={3} defaultValue={selected.review_note} placeholder="Reviewer note (synthetic demo only)" />
                <button className="primary">Save eligibility review</button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function ProjectPage({
  projects,
  selectedProject,
  setSelectedProject,
  milestones,
  tasks,
  risks,
  reload,
  allowProjectWrite,
  allowTaskWrite,
}: {
  projects: Project[];
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  milestones: Milestone[];
  tasks: StudyTask[];
  risks: Risk[];
  reload: (projectId?: string) => Promise<void>;
  allowProjectWrite: boolean;
  allowTaskWrite: boolean;
}) {
  const [message, setMessage] = useState("");

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const project = await api.createProject({
        code: data.get("code"),
        name: data.get("name"),
        description: data.get("description") || "",
        status: "planning",
      });
      setSelectedProject(project);
      form.reset();
      setMessage("Project created.");
      await reload(project.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create project.");
    }
  }

  async function addMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedProject) return;

    const data = new FormData(form);

    try {
      await api.createMilestone(selectedProject.id, {
        code: data.get("code"),
        name: data.get("name"),
        status: "not_started",
      });
      form.reset();
      setMessage("Milestone created.");
      await reload(selectedProject.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create milestone.");
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedProject) return;

    const data = new FormData(form);

    try {
      await api.createTask(selectedProject.id, {
        title: data.get("title"),
        milestone_id: data.get("milestone_id") || null,
        priority: data.get("priority") || "medium",
        status: "not_started",
      });
      form.reset();
      setMessage("Task created.");
      await reload(selectedProject.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create task.");
    }
  }

  async function addRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedProject) return;

    const data = new FormData(form);

    try {
      await api.createRisk(selectedProject.id, {
        title: data.get("title"),
        level: data.get("level") || "medium",
        mitigation: data.get("mitigation") || "",
        status: "open",
      });
      form.reset();
      setMessage("Risk created.");
      await reload(selectedProject.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create risk.");
    }
  }

  async function completeTask(task: StudyTask) {
    if (!selectedProject) return;

    try {
      await api.updateTask(selectedProject.id, task.id, {
        status: "completed",
        note: "Marked complete from Step 1A project dashboard.",
      });
      setMessage(`Task "${task.title}" completed.`);
      await reload(selectedProject.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update task.");
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Project management</p>
          <h1>Milestones, Tasks & Risks</h1>
        </div>
      </div>

      {message && <div className="alert">{message}</div>}

      <div className="two-col">
        <section className="panel">
          <h2>Create project</h2>
          {allowProjectWrite ? (
            <form className="compact-form" onSubmit={addProject}>
              <input name="code" placeholder="Project code" required />
              <input name="name" placeholder="Project name" required />
              <textarea name="description" placeholder="Description" rows={3} />
              <button className="primary">Create project</button>
            </form>
          ) : (
            <p className="muted">
              Your role can view project information but cannot create projects.
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Current project</h2>
          <select
            value={selectedProject?.id || ""}
            onChange={(event) => {
              const project =
                projects.find((item) => item.id === event.target.value) || null;
              setSelectedProject(project);
            }}
          >
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>

          {selectedProject && (
            <div className="project-summary">
              <strong>{selectedProject.name}</strong>
              <span>{selectedProject.status}</span>
              <p>{selectedProject.description || "No description."}</p>
            </div>
          )}
        </section>
      </div>

      {!selectedProject ? (
        <section className="panel">
          <p className="muted">
            Create or select a project to manage its milestones, tasks and risks.
          </p>
        </section>
      ) : (
        <>
          <div className="three-col">
            <section className="panel">
              <h2>Add milestone</h2>
              {allowProjectWrite ? (
                <form className="compact-form" onSubmit={addMilestone}>
                  <input name="code" placeholder="M1" required />
                  <input name="name" placeholder="Milestone name" required />
                  <button>Add milestone</button>
                </form>
              ) : (
                <p className="muted">Milestone creation is restricted.</p>
              )}
            </section>

            <section className="panel">
              <h2>Add task</h2>
              {allowTaskWrite ? (
                <form className="compact-form" onSubmit={addTask}>
                  <input name="title" placeholder="Task title" required />
                  <select name="milestone_id">
                    <option value="">No milestone</option>
                    {milestones.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </select>
                  <select name="priority" defaultValue="medium">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <button>Add task</button>
                </form>
              ) : (
                <p className="muted">Task creation is restricted.</p>
              )}
            </section>

            <section className="panel">
              <h2>Add risk</h2>
              {allowTaskWrite ? (
                <form className="compact-form" onSubmit={addRisk}>
                  <input name="title" placeholder="Risk title" required />
                  <select name="level" defaultValue="medium">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <textarea name="mitigation" placeholder="Mitigation" rows={2} />
                  <button>Add risk</button>
                </form>
              ) : (
                <p className="muted">Risk creation is restricted.</p>
              )}
            </section>
          </div>

          <div className="two-col">
            <section className="panel">
              <h2>Milestones</h2>
              <div className="list">
                {milestones.map((item) => (
                  <div className="list-row" key={item.id}>
                    <div>
                      <strong>{item.code}</strong>
                      <span>{item.name}</span>
                    </div>
                    <span className="tag">{item.status}</span>
                  </div>
                ))}
                {!milestones.length && <p className="muted">No milestones yet.</p>}
              </div>
            </section>

            <section className="panel">
              <h2>Risk register</h2>
              <div className="list">
                {risks.map((risk) => (
                  <div className="list-row" key={risk.id}>
                    <div>
                      <strong>{risk.title}</strong>
                      <span>{risk.mitigation || "No mitigation recorded."}</span>
                    </div>
                    <span className={`tag risk-${risk.level}`}>{risk.level}</span>
                  </div>
                ))}
                {!risks.length && <p className="muted">No risks yet.</p>}
              </div>
            </section>
          </div>

          <section className="panel">
            <h2>Tasks</h2>
            <div className="list">
              {tasks.map((task) => (
                <div className="task-row" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>
                      {task.priority} priority · {task.status}
                    </span>
                  </div>

                  {allowTaskWrite && task.status !== "completed" && (
                    <button onClick={() => completeTask(task)}>
                      Mark complete
                    </button>
                  )}
                </div>
              ))}
              {!tasks.length && <p className="muted">No tasks yet.</p>}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function AdminPage({
  sites,
  audit,
  reload,
}: {
  sites: StudySite[];
  audit: AuditEvent[];
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");

  async function addSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await api.createSite({
        code: data.get("code"),
        name: data.get("name"),
        status: "active",
      });
      form.reset();
      setMessage("Study site created.");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create study site.");
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Study Sites & Audit</h1>
        </div>
      </div>

      {message && <div className="alert">{message}</div>}

      <div className="two-col">
        <section className="panel">
          <h2>Create study site</h2>
          <form className="compact-form" onSubmit={addSite}>
            <input name="code" placeholder="SITE-01" required />
            <input name="name" placeholder="Institution / study site" required />
            <button className="primary">Create site</button>
          </form>

          <div className="list top-space">
            {sites.map((site) => (
              <div className="list-row" key={site.id}>
                <div>
                  <strong>{site.code}</strong>
                  <span>{site.name}</span>
                </div>
                <span className="tag">{site.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>RBAC foundation</h2>
          <p className="muted">
            The backend seeds six study roles. Step 1A uses role-aware API
            dependencies so participant-level accounts cannot gain research
            administration access.
          </p>
          <div className="role-cloud">
            {[
              "PROJECT_ADMIN",
              "RESEARCH_LEAD",
              "AI_ML_RESEARCH_ENGINEER",
              "RESEARCH_ASSISTANT",
              "SITE_COORDINATOR",
              "PARTICIPANT",
            ].map((role) => (
              <span key={role}>{role}</span>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Recent audit events</h2>
        <div className="audit-table">
          {audit.map((event) => (
            <div className="audit-row" key={event.id}>
              <code>{event.action}</code>
              <span>{event.entity_type}</span>
              <span>{event.entity_id || "—"}</span>
              <time>{new Date(event.created_at).toLocaleString()}</time>
            </div>
          ))}
          {!audit.length && <p className="muted">No audit events yet.</p>}
        </div>
      </section>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [publicApply, setPublicApply] = useState(() => window.location.hash === "#apply");
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [sites, setSites] = useState<StudySite[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [recruitmentInfo, setRecruitmentInfo] = useState<RecruitmentPublicInfo | null>(null);
  const [recruitmentApplications, setRecruitmentApplications] = useState<RecruitmentApplication[]>([]);
  const [recruitmentMetrics, setRecruitmentMetrics] = useState<RecruitmentMetrics | null>(null);

  function clearProjectState() {
    setProjects([]);
    setSelectedProject(null);
    setMilestones([]);
    setTasks([]);
    setRisks([]);
  }

  function clearAdminState() {
    setSites([]);
    setAudit([]);
  }

  function clearRecruitmentState() {
    setRecruitmentInfo(null);
    setRecruitmentApplications([]);
    setRecruitmentMetrics(null);
  }

  function clearRoleScopedState() {
    clearProjectState();
    clearAdminState();
    clearRecruitmentState();
  }

  async function loadAll(projectId?: string) {
    if (!user) return;

    if (canReadProjects(user)) {
      const projectRows = await api.projects();
      setProjects(projectRows);

      let current = projectId
        ? projectRows.find((project) => project.id === projectId) || null
        : selectedProject;

      if (!current && projectRows.length) {
        current = projectRows[0];
      } else if (current) {
        current =
          projectRows.find((project) => project.id === current!.id) || null;
      }

      setSelectedProject(current);

      if (current) {
        const [milestoneRows, taskRows, riskRows] = await Promise.all([
          api.milestones(current.id),
          api.tasks(current.id),
          api.risks(current.id),
        ]);
        setMilestones(milestoneRows);
        setTasks(taskRows);
        setRisks(riskRows);
      } else {
        setMilestones([]);
        setTasks([]);
        setRisks([]);
      }
    } else {
      clearProjectState();
    }

    if (canRecruit(user)) {
      const [infoRow, applicationRows, metricRow] = await Promise.all([
        recruitmentApi.publicInfo(),
        recruitmentApi.applications(),
        recruitmentApi.metrics(),
      ]);
      setRecruitmentInfo(infoRow);
      setRecruitmentApplications(applicationRows);
      setRecruitmentMetrics(metricRow);
    } else {
      clearRecruitmentState();
    }

    if (canAdminister(user)) {
      const [siteRows, auditRows] = await Promise.all([
        api.sites(),
        api.audit(),
      ]);
      setSites(siteRows);
      setAudit(auditRows);
    } else {
      clearAdminState();
    }
  }

  useEffect(() => {
    api
      .me()
      .then((me) => setUser(me))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;

    if (!canReadProjects(user)) {
      clearProjectState();
    }

    if (!canAdminister(user)) {
      clearAdminState();
    }

    if (!canRecruit(user)) {
      clearRecruitmentState();
    }

    loadAll().catch(console.error);
  }, [user, selectedProject?.id]);

  const navigation = useMemo(
    () => (user ? visibleNavigation(user) : []),
    [user],
  );

  useEffect(() => {
    if (!user) return;

    if (!navigation.some((item) => item.page === page)) {
      setPage("overview");
    }
  }, [user, navigation, page]);

  const title = useMemo(
    () => NAV.find((item) => item.page === page)?.label || "Overview",
    [page],
  );

  if (loading) {
    return <div className="center">Loading research platform…</div>;
  }

  if (!user) {
    if (publicApply) {
      return (
        <PublicRecruitment
          onBack={() => {
            window.location.hash = "";
            setPublicApply(false);
          }}
        />
      );
    }

    return (
      <LoginScreen
        onLogin={(nextUser) => {
          clearRoleScopedState();
          setPage("overview");
          setUser(nextUser);
        }}
        onApply={() => {
          window.location.hash = "apply";
          setPublicApply(true);
        }}
      />
    );
  }

  function logout() {
    setToken(null);
    clearRoleScopedState();
    setPage("overview");
    setUser(null);
  }

  return (
    <>
      <DemoBanner />
      <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark small">AR</div>
          <div>
            <strong>AI Research</strong>
            <span>Study Management</span>
          </div>
        </div>

        <nav>
          {navigation.map((item) => (
            <button
              key={item.page}
              className={page === item.page ? "active" : ""}
              onClick={() => setPage(item.page)}
            >
              <span>{item.label}</span>
              {!item.step1a && <small>Next</small>}
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <strong>{user.full_name}</strong>
          <span>{user.roles[0] || "User"}</span>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className="content">
        {page === "overview" &&
          (canReadProjects(user) ? (
            <Overview
              projects={projects}
              tasks={tasks}
              risks={risks}
              recruitmentMetrics={recruitmentMetrics}
            />
          ) : (
            <LimitedOverview user={user} />
          ))}

        {page === "recruitment" && canRecruit(user) && (
          <Recruitment
            info={recruitmentInfo}
            applications={recruitmentApplications}
            metrics={recruitmentMetrics}
            reload={loadAll}
          />
        )}

        {page === "project" && canReadProjects(user) && (
          <ProjectPage
            projects={projects}
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            milestones={milestones}
            tasks={tasks}
            risks={risks}
            reload={loadAll}
            allowProjectWrite={canWriteProjects(user)}
            allowTaskWrite={canWriteProjectTasks(user)}
          />
        )}

        {page === "admin" && canAdminister(user) && (
          <AdminPage sites={sites} audit={audit} reload={loadAll} />
        )}

        {["participants", "study", "models", "analysis"].includes(page) && (
          <ComingSoon title={title} />
        )}
      </main>
      </div>
    </>
  );
}

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  AuditEvent,
  login,
  Milestone,
  Project,
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

function visibleNavigation(user: User) {
  if (!canReadProjects(user)) {
    return NAV.filter((item) =>
      item.page === "overview" || item.page === "study"
    );
  }

  return NAV.filter((item) =>
    item.page !== "admin" || canAdminister(user)
  );
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
}: {
  onLogin: (user: User) => void;
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
          Step 1A · Core foundation, project management and audit
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

        <p className="tiny">
          Use the demo credentials supplied by the project administrator.
          Do not enter participant or health information in this demo.
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
}: {
  projects: Project[];
  tasks: StudyTask[];
  risks: Risk[];
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
        <span className="status-pill">Step 1A</span>
      </div>

      <div className="metric-grid">
        <Metric label="Projects" value={projects.length} />
        <Metric label="Open tasks" value={openTasks} />
        <Metric label="Open risks" value={openRisks} />
        <Metric label="Recruitment target" value="600" />
      </div>

      <div className="two-col">
        <section className="panel">
          <p className="eyebrow">Recruitment matrix</p>
          <h2>Study target</h2>
          <GroupBar label="HumorBot" current={0} target={200} />
          <GroupBar label="STARCASM" current={0} target={200} />
          <GroupBar label="Control" current={0} target={200} />
          <p className="tiny">
            Counts remain zero until the later recruitment/selection workflow
            is approved and implemented.
          </p>
        </section>

        <section className="panel">
          <p className="eyebrow">Current stage</p>
          <h2>Foundation acceptance</h2>
          <ul className="checklist">
            <li>Authentication and RBAC</li>
            <li>Project / milestone / task tracking</li>
            <li>Risk register</li>
            <li>Study-site foundation</li>
            <li>Administrative audit trail</li>
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

function Recruitment({ sites }: { sites: StudySite[] }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Recruitment</p>
          <h1>Recruitment Foundation</h1>
          <p className="muted">
            Step 1A establishes study sites and the recruitment module shell.
            The public questionnaire and applicant workflow arrive in Step 1B.
          </p>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Applications" value={0} />
        <Metric label="Eligible" value={0} />
        <Metric label="Selected" value={0} />
        <Metric label="Study sites" value={sites.length} />
      </div>

      <section className="panel">
        <h2>Recruitment lifecycle</h2>
        <div className="lifecycle">
          <span>Applicant</span>
          <b>→</b>
          <span>Screening</span>
          <b>→</b>
          <span>Eligibility review</span>
          <b>→</b>
          <span>Selection</span>
          <b>→</b>
          <span>Participant</span>
        </div>
        <p className="muted">
          Step 1A intentionally prevents us from conflating an applicant with
          a study participant before eligibility and selection exist.
        </p>
      </section>
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
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [sites, setSites] = useState<StudySite[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

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

  function clearRoleScopedState() {
    clearProjectState();
    clearAdminState();
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
    return (
      <LoginScreen
        onLogin={(nextUser) => {
          clearRoleScopedState();
          setPage("overview");
          setUser(nextUser);
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
            <Overview projects={projects} tasks={tasks} risks={risks} />
          ) : (
            <LimitedOverview user={user} />
          ))}

        {page === "recruitment" && <Recruitment sites={sites} />}

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

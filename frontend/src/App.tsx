import { StudyPreparation, PreparedParticipant } from "./StudyPreparation";
import { StudyDashboard, WorkflowGuide } from "./StudyWorkflow";
import RecruitmentSite from "./RecruitmentSite";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  getToken,
  AllocationSummary,
  AuditEvent,
  login,
  Milestone,
  Participant,
  ParticipantAllocation,
  ParticipantAuditTrail,
  ParticipantMetrics,
  ParticipantSelf,
  participantApi,
  ProtocolSummary,
  ProtocolValidation,
  Project,
  RecruitmentApplication,
  RecruitmentMetrics,
  RecruitmentPublicInfo,
  recruitmentApi,
  Risk,
  SelectionDecision,
  setToken,
  StudyProtocol,
  StudySite,
  StudyTask,
  User,
  protocolApi,
} from "./api";

type Page =
  | "overview"
  | "preparation"
  | "workflow"
  | "recruitment"
  | "participants"
  | "study"
  | "models"
  | "analysis"
  | "project"
  | "admin";

const NAV: { page: Page; label: string; step1a: boolean }[] = [
  { page: "overview", label: "Overview", step1a: true },
  { page: "preparation", label: "Study preparation", step1a: true },
  { page: "workflow", label: "How it works", step1a: true },
  { page: "recruitment", label: "Recruitment", step1a: true },
  { page: "participants", label: "Participants", step1a: true },
  { page: "study", label: "Study", step1a: true },
  { page: "models", label: "Models", step1a: false },
  { page: "analysis", label: "Results", step1a: true },
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

const ALLOCATION_ROLES = new Set([
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

function canRecruit(user: User) {
  return hasAnyRole(user, RECRUITMENT_ROLES);
}

function canAllocate(user: User) {
  return hasAnyRole(user, ALLOCATION_ROLES);
}

function canManageProtocol(user: User) {
  return hasAnyRole(user, PROJECT_WRITE_ROLES);
}

function visibleNavigation(user: User) {
  return NAV.filter((item) => {
    if (item.page === "overview") return true;
    if (item.page === "preparation") return canRecruit(user);
    if (item.page === "workflow") return canRecruit(user);
    if (item.page === "analysis") return canRecruit(user);
    if (item.page === "models") return false;
    if (item.page === "recruitment") return canRecruit(user);
    if (item.page === "participants") return canRecruit(user);
    if (item.page === "project") return canReadProjects(user);
    if (item.page === "admin") return canAdminister(user);
    if (item.page === "study") return canReadProjects(user);
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
          Study prototype · Staff and participant access
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
          Back to recruitment website
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
        into the same architecture. Step 1D.1 establishes protocol governance;
        participant study activities remain later phases.
      </p>
    </section>
  );
}

function Overview({
  projects,
  tasks,
  risks,
  recruitmentMetrics,
  allocationSummary,
}: {
  projects: Project[];
  tasks: StudyTask[];
  risks: Risk[];
  recruitmentMetrics: RecruitmentMetrics | null;
  allocationSummary: AllocationSummary | null;
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
        <span className="status-pill">Step 1D.1</span>
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
          <GroupBar label="HumorBot" current={allocationSummary?.groups?.HumorBot ?? 0} target={200} />
          <GroupBar label="STARCASM" current={allocationSummary?.groups?.STARCASM ?? 0} target={200} />
          <GroupBar label="Control" current={allocationSummary?.groups?.Control ?? 0} target={200} />
          <p className="tiny">
            Step 1C.2 uses a server-side balanced random foundation with a 200-per-group cap.
            Final stratification/randomization remains subject to the approved research protocol.
          </p>
        </section>

        <section className="panel">
          <p className="eyebrow">Current stage</p>
          <h2>Protocol & stratification foundation</h2>
          <ul className="checklist">
            <li>Step 1A foundation accepted</li>
            <li>Public synthetic application intake</li>
            <li>Consent-to-screen capture</li>
            <li>Applicant reference issuance</li>
            <li>Eligibility-review workflow</li>
            <li>Selection decision tracking</li>
            <li>Pseudonymous participant enrollment</li>
            <li>Server-side balanced random allocation</li>
            <li>Immutable allocation audit record</li>
            <li>Searchable, filterable participant workspace</li>
            <li>Pseudonymous participant detail view</li>
            <li>Participant-only account linkage</li>
            <li>Own-record participant portal</li>
            <li>Correlated participant audit trail</li>
            <li>End-to-end acceptance and count reconciliation</li>
            <li>Versioned protocol registry</li>
            <li>Approval-readiness validation</li>
            <li>Immutable approved configuration hash</li>
            <li>Activation held for final stratified engine</li>
          </ul>
        </section>
      </div>
    </>
  );
}

function LimitedOverview({ user }: { user: User }) {
  const isParticipant = user.roles.includes("PARTICIPANT");
  const [participant, setParticipant] = useState<ParticipantSelf | null>(null);
  const [loading, setLoading] = useState(isParticipant);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isParticipant) return;
    let active = true;
    setLoading(true);
    setError("");
    participantApi
      .self()
      .then((record) => {
        if (active) setParticipant(record);
      })
      .catch((err) => {
        if (active) {
          setParticipant(null);
          setError(err instanceof Error ? err.message : "Unable to load your study record.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isParticipant]);

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Participant access</p>
          <h1>{isParticipant ? "My Study Portal" : "Limited Study Portal"}</h1>
          <p className="muted">
            Signed in as {user.full_name}. Project-management and
            administrative research data are not available to this role.
          </p>
        </div>
        <span className="status-pill">{user.roles[0] || "USER"}</span>
      </div>

      <section className="panel"><h2>Welcome to your online study</h2><p>Keep your participant number and credentials private. Complete the assigned pre-test, follow your assigned activities for 30 days, then complete the post-test and participant feedback. For technical difficulties or general questions, use the administrator email supplied with your welcome package.</p><p className="tiny">This is a synthetic demonstration. Approved assessments, selection rules, consent wording and welcome email delivery are pending committee confirmation or configuration.</p></section>
      <div className="two-col">
        <section className="panel">
          <p className="eyebrow">My study identity</p>
          <h2>{participant?.participant_code || "Participant workspace"}</h2>
          {!isParticipant && (
            <p className="muted">No participant record is available to this role.</p>
          )}
          {isParticipant && loading && <p className="muted">Loading your linked study record…</p>}
          {isParticipant && error && (
            <div className="alert error">
              <strong>Account linkage required</strong>
              <p>{error}</p>
            </div>
          )}
          {participant && (
            <dl className="detail-grid participant-detail-grid">
              <div><dt>Participant code</dt><dd>{participant.participant_code}</dd></div>
              <div><dt>Lifecycle status</dt><dd>{participant.lifecycle_status}</dd></div>
              <div><dt>Allocation status</dt><dd>{participant.allocation_status.replaceAll("_", " ")}</dd></div>
              <div><dt>Assigned condition</dt><dd>{participant.assigned_condition || "Pending allocation"}</dd></div>
              <div><dt>Enrolled</dt><dd>{formatDate(participant.enrolled_at)}</dd></div>
              <div><dt>Account status</dt><dd>{participant.account_status}</dd></div>
            </dl>
          )}
        </section>

        <section className="panel">
          <p className="eyebrow">Security</p>
          <h2>Management data protected</h2>
          <p className="muted">
            This view loads only the participant record linked to the signed-in
            account. Recruitment applications, other participants, allocation
            internals, project records and audit data remain server-restricted.
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

function Recruitment({
  info,
  applications,
  metrics,
  selections,
  participants,
  reload,
}: {
  info: RecruitmentPublicInfo | null;
  applications: RecruitmentApplication[];
  metrics: RecruitmentMetrics | null;
  selections: SelectionDecision[];
  participants: Participant[];
  reload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = applications.filter(item => {
    const text = `${item.reference_code} ${item.preferred_name} ${item.contact_email}`.toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (!statusFilter || item.status === statusFilter);
  });
  const [message, setMessage] = useState("");
  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  const selection = selected
    ? selections.find((item) => item.application_id === selected.id) || null
    : null;
  const enrolledParticipant = selected?.enrolled;

  useEffect(() => {
    if (!selectedId && applications.length) setSelectedId(applications[0].id);
    if (selectedId && !applications.some((item) => item.id === selectedId)) {
      setSelectedId(applications[0]?.id || "");
    }
  }, [applications, selectedId]);

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
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
    } finally { setBusy(false); }
  }

  async function saveSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await recruitmentApi.recordSelection(selected.id, {
        status: data.get("selection_status"),
        note: data.get("selection_note") || "",
      });
      setMessage(`Selection saved for ${selected.reference_code}.`);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save participant selection.");
    } finally { setBusy(false); }
  }

  async function enroll() {
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const participant = await recruitmentApi.enroll(selected.id);
      setMessage(`Participant ${participant.participant_code} enrolled.`);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to enroll participant.");
    } finally { setBusy(false); }
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
          <h1>Applications, Selection & Enrollment</h1>
          <p className="muted">
            Review screening answers, record a selection decision, then enroll selected applicants. Use Participants to allocate a condition and link a login.
          </p>
        </div>
        <a className="status-pill" href="#home">Open recruitment website ↗</a>
      </div>

      {message && <div className="alert">{message}</div>}

      <div className="metric-grid recruitment-metrics">
        <Metric label="Applications" value={metrics?.applications ?? 0} />
        <Metric label="Submitted" value={metrics?.submitted ?? 0} />
        <Metric label="Needs review" value={metrics?.needs_review ?? 0} />
        <Metric label="Eligible" value={metrics?.eligible ?? 0} />
        <Metric label="Withdrawn" value={metrics?.withdrawn ?? 0} />
      </div>

      <div className="two-col recruitment-review-grid">
        <section className="panel">
          <div className="panel-heading-row">
            <div><p className="eyebrow">Applicant queue</p><h2>Recruitment applications</h2></div>
            <span className="tag">{applications.length} total</span>
          </div>
          <div className="recruit-queue-filters">
            <label>Search applicants<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Reference, alias or email" /></label>
            <label>Review status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{["submitted", "under_review", "needs_review", "eligible", "ineligible", "withdrawn"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          </div>
          <p className="tiny" role="status">Showing {filtered.length} of {applications.length} applications</p>
          <div className="list recruitment-list">
            {filtered.map((application) => (
              <button
                type="button"
                className={`application-row ${selected?.id === application.id ? "selected" : ""}`}
                key={application.id}
                disabled={busy}
                onClick={() => { setSelectedId(application.id); setMessage(""); }}
              >
                <div>
                  <strong>{application.reference_code}</strong>
                  <span>{application.preferred_name} · {siteName(application.site_id)}</span>
                </div>
                <span className={`tag recruitment-${application.status}`}>{application.status.replaceAll("_", " ")}</span>
              </button>
            ))}
            {!filtered.length && <p className="muted">{applications.length ? "No applications match these filters." : "No applications yet. Open the recruitment website to submit a fictional example."}</p>}
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
              {selected.status === "withdrawn" ? <div className="alert">This application was withdrawn. Review and enrollment are locked.</div> : enrolledParticipant ? <div className="alert">Eligibility is locked after enrollment.</div> : <form className="compact-form" onSubmit={review} key={`${selected.id}-${selected.updated_at}`}>
                <select name="status" defaultValue={selected.status === "submitted" ? "under_review" : selected.status}>
                  <option value="under_review">Under review</option>
                  <option value="needs_review">Needs review</option>
                  <option value="eligible">Eligible</option>
                  <option value="ineligible">Ineligible</option>
                </select>
                <textarea name="review_note" rows={3} defaultValue="" placeholder="Reviewer note (synthetic demo only)" />
                <button className="primary" disabled={busy}>Save eligibility review</button>
              </form>}

              {selected.status === "eligible" && (
                <div className="selection-block">
                  <p className="eyebrow">Participant selection</p>
                  {enrolledParticipant ? (
                    <div className="enrollment-success">
                      <strong>Participant enrolled</strong>
                      <small>The participant number is not linked here. Open Participants for coded study records.</small>
                    </div>
                  ) : (
                    <>
                      <form
                        className="compact-form"
                        onSubmit={saveSelection}
                        key={`${selected.id}-${selection?.updated_at || "new"}`}
                      >
                        <select name="selection_status" defaultValue={selection?.status || "selected"}>
                          <option value="selected">Selected</option>
                          <option value="waitlisted">Waitlisted</option>
                          <option value="not_selected">Not selected</option>
                        </select>
                        <textarea
                          name="selection_note"
                          rows={3}
                          defaultValue={selection?.note || ""}
                          placeholder="Selection note (synthetic demo only)"
                        />
                        <button className="primary" disabled={busy}>Save selection</button>
                      </form>
                      {selection?.status === "selected" && (
                        <div className="enrollment-action">
                          <strong>Selected for enrollment</strong>
                          <p className="tiny">Enrollment creates a pseudonymous participant identity. Study-group allocation is performed separately from the Participants page.</p>
                          <button type="button" className="primary" disabled={busy} onClick={enroll}>Enroll participant</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}


function ParticipantsPage({
  participants,
  metrics,
  allocationSummary,
  info,
  allowAllocate,
  allowAccountLink,
  loading,
  loadError,
  reload,
}: {
  participants: Participant[];
  metrics: ParticipantMetrics | null;
  allocationSummary: AllocationSummary | null;
  info: RecruitmentPublicInfo | null;
  allowAllocate: boolean;
  allowAccountLink: boolean;
  loading: boolean;
  loadError: string;
  reload: (projectId?: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("all");
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [enrolledFrom, setEnrolledFrom] = useState("");
  const [enrolledTo, setEnrolledTo] = useState("");
  const [sortOrder, setSortOrder] = useState("enrolled_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [selectedAllocation, setSelectedAllocation] = useState<ParticipantAllocation | null>(null);
  const [selectedAuditTrail, setSelectedAuditTrail] = useState<ParticipantAuditTrail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [accountBusy, setAccountBusy] = useState(false);

  const pageSize = 25;

  const siteName = (siteId: string | null) => {
    if (!siteId) return "No site";
    return info?.sites.find((site) => site.id === siteId)?.name || "Unknown site";
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const filteredParticipants = useMemo(() => {
    if (enrolledFrom && enrolledTo && enrolledFrom > enrolledTo) return [];

    const query = search.trim().toLowerCase();
    const rows = participants.filter((participant) => {
      const enrollmentDate = participant.enrolled_at.slice(0, 10);
      const matchesSearch =
        !query ||
        participant.participant_code.toLowerCase().includes(query) ||
        participant.id.toLowerCase().includes(query);
      const matchesLifecycle =
        lifecycleFilter === "all" || participant.lifecycle_status === lifecycleFilter;
      const matchesAllocation =
        allocationFilter === "all" || participant.allocation_status === allocationFilter;
      const matchesGroup =
        groupFilter === "all" || participant.study_group === groupFilter;
      const matchesSite =
        siteFilter === "all" ||
        (siteFilter === "none" ? !participant.site_id : participant.site_id === siteFilter);
      const matchesFrom = !enrolledFrom || enrollmentDate >= enrolledFrom;
      const matchesTo = !enrolledTo || enrollmentDate <= enrolledTo;

      return (
        matchesSearch &&
        matchesLifecycle &&
        matchesAllocation &&
        matchesGroup &&
        matchesSite &&
        matchesFrom &&
        matchesTo
      );
    });

    return [...rows].sort((left, right) => {
      if (sortOrder === "participant_code") {
        return left.participant_code.localeCompare(right.participant_code);
      }
      const difference =
        new Date(left.enrolled_at).getTime() - new Date(right.enrolled_at).getTime();
      return sortOrder === "enrolled_asc" ? difference : -difference;
    });
  }, [
    participants,
    search,
    lifecycleFilter,
    allocationFilter,
    groupFilter,
    siteFilter,
    enrolledFrom,
    enrolledTo,
    sortOrder,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredParticipants.length / pageSize));
  const invalidDateRange = Boolean(
    enrolledFrom && enrolledTo && enrolledFrom > enrolledTo,
  );
  const pagedParticipants = filteredParticipants.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const selectedParticipant =
    participants.find((participant) => participant.id === selectedParticipantId) || null;

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    lifecycleFilter,
    allocationFilter,
    groupFilter,
    siteFilter,
    enrolledFrom,
    enrolledTo,
    sortOrder,
  ]);

  useEffect(() => {
    if (!selectedParticipant || selectedParticipant.allocation_status !== "allocated") {
      setSelectedAllocation(null);
      setDetailLoading(false);
      setDetailError("");
      return;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError("");
    participantApi
      .allocation(selectedParticipant.id)
      .then((allocation) => {
        if (active) setSelectedAllocation(allocation);
      })
      .catch((err) => {
        if (active) {
          setSelectedAllocation(null);
          setDetailError(
            err instanceof Error ? err.message : "Unable to load allocation details.",
          );
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedParticipant?.id, selectedParticipant?.allocation_status]);

  useEffect(() => {
    if (!selectedParticipant) {
      setSelectedAuditTrail(null);
      setAuditLoading(false);
      setAuditError("");
      return;
    }

    let active = true;
    setAuditLoading(true);
    setAuditError("");
    participantApi
      .auditTrail(selectedParticipant.id)
      .then((trail) => {
        if (active) setSelectedAuditTrail(trail);
      })
      .catch((err) => {
        if (active) {
          setSelectedAuditTrail(null);
          setAuditError(err instanceof Error ? err.message : "Unable to load audit trail.");
        }
      })
      .finally(() => {
        if (active) setAuditLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedParticipant?.id, auditRefreshKey]);

  function clearFilters() {
    setSearch("");
    setLifecycleFilter("all");
    setAllocationFilter("all");
    setGroupFilter("all");
    setSiteFilter("all");
    setEnrolledFrom("");
    setEnrolledTo("");
    setSortOrder("enrolled_desc");
  }

  async function allocate(participant: Participant) {
    if (!allowAllocate || participant.allocation_status === "allocated") return;
    setBusyId(participant.id);
    setMessage("");
    try {
      const allocation = await participantApi.allocate(participant.id);
      setMessage(`${participant.participant_code} allocated to ${allocation.study_group}.`);
      await reload();
      setAuditRefreshKey((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to allocate participant.");
    } finally {
      setBusyId("");
    }
  }

  async function linkAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedParticipant || !allowAccountLink || selectedParticipant.account_linked) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setAccountBusy(true);
    setMessage("");
    try {
      const link = await participantApi.linkAccount(selectedParticipant.id, {
        initial_password: data.get("initial_password") || null,
      });
      form.reset();
      setMessage(`${link.participant_code} linked to a participant-only account.`);
      await reload();
      setAuditRefreshKey((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to link participant account.");
    } finally {
      setAccountBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Participant management</p>
          <h1>Participant Management</h1>
          <p className="muted">
            Search and inspect pseudonymous enrolled participants by lifecycle,
            allocation, condition, site and enrollment date. Applicant contact
            details remain separated from this workspace.
          </p>
        </div>
        <span className="status-pill">Step 1C.5</span>
      </div>

      {message && <div className="alert">{message}</div>}
      {loadError && <div className="alert error">{loadError}</div>}

      <div className="metric-grid participant-metrics">
        <Metric label="Total participants" value={metrics?.participants ?? 0} />
        <Metric label="Enrolled" value={metrics?.enrolled ?? 0} />
        <Metric label="Allocated" value={metrics?.allocated ?? 0} />
        <Metric label="Linked accounts" value={metrics?.linked_accounts ?? 0} />
        <Metric label="Remaining target" value={metrics?.remaining_target ?? 600} />
      </div>

      <div className="two-col">
        <section className="panel">
          <p className="eyebrow">Allocation matrix</p>
          <h2>Study groups</h2>
          <GroupBar label="HumorBot" current={metrics?.humorbot ?? 0} target={200} />
          <GroupBar label="STARCASM" current={metrics?.starcasm ?? 0} target={200} />
          <GroupBar label="Control" current={metrics?.control ?? 0} target={200} />
        </section>
        <section className="panel">
          <p className="eyebrow">Allocation control</p>
          <h2>Server-side assignment</h2>
          <p className="muted">
            Method: {allocationSummary?.method?.replaceAll("_", " ") || "balanced random"}
            {" · "}Version: {allocationSummary?.algorithm_version || "balanced_random_v1"}
          </p>
          <p className="tiny">
            The engine assigns only among groups with the current minimum count and randomly breaks ties.
            Administrators cannot choose a study group manually. Final protocol stratification is not configured yet.
          </p>
          <div className="protocol-warning">
            <strong>Protocol gate</strong>
            <p>This is an allocation foundation, not the final approved statistical randomization procedure.</p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading-row">
          <div>
            <p className="eyebrow">Participant filters</p>
            <h2>Find a participant</h2>
          </div>
          <button type="button" className="secondary compact-action" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
        <div className="participant-filter-grid">
          <label className="participant-search-field">
            Search participant code or ID
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="P-000001"
            />
          </label>
          <label>
            Lifecycle
            <select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)}>
              <option value="all">All lifecycle statuses</option>
              <option value="enrolled">Enrolled</option>
              <option value="completed">Completed</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </label>
          <label>
            Allocation
            <select value={allocationFilter} onChange={(event) => setAllocationFilter(event.target.value)}>
              <option value="all">All allocation statuses</option>
              <option value="not_allocated">Not allocated</option>
              <option value="allocated">Allocated</option>
            </select>
          </label>
          <label>
            Assigned condition
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="all">All conditions</option>
              <option value="HumorBot">HumorBot</option>
              <option value="STARCASM">STARCASM</option>
              <option value="Control">Control</option>
            </select>
          </label>
          <label>
            Study site
            <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
              <option value="all">All sites</option>
              <option value="none">No site</option>
              {info?.sites.map((site) => (
                <option key={site.id} value={site.id}>{site.code} · {site.name}</option>
              ))}
            </select>
          </label>
          <label>
            Enrolled from
            <input type="date" value={enrolledFrom} onChange={(event) => setEnrolledFrom(event.target.value)} />
          </label>
          <label>
            Enrolled to
            <input type="date" value={enrolledTo} onChange={(event) => setEnrolledTo(event.target.value)} />
          </label>
          <label>
            Sort
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="enrolled_desc">Newest enrollment</option>
              <option value="enrolled_asc">Oldest enrollment</option>
              <option value="participant_code">Participant code</option>
            </select>
          </label>
        </div>
        {invalidDateRange && (
          <div className="alert error participant-filter-error">
            Enrolled from must be on or before Enrolled to.
          </div>
        )}
      </section>

      <div className="participant-workspace">
      <section className="panel participant-results-panel">
        <div className="panel-heading-row">
          <div>
            <p className="eyebrow">Participant queue</p>
            <h2>Enrolled participants</h2>
          </div>
          <span className="tag">{filteredParticipants.length} matching · {participants.length} total</span>
        </div>
        {loading && (
          <div className="participant-state" role="status">
            <strong>Refreshing participant data…</strong>
            <span>The current results will remain visible while the latest records load.</span>
          </div>
        )}
        <div className="list participant-list">
          {pagedParticipants.map((participant) => (
            <div
              className={`participant-row ${selectedParticipantId === participant.id ? "selected" : ""}`}
              key={participant.id}
            >
              <div>
                <strong>{participant.participant_code}</strong>
                <span>{siteName(participant.site_id)}</span>
                <small>Enrolled {formatDate(participant.enrolled_at)}</small>
                {participant.study_group && <small>Study group: {participant.study_group}</small>}
              </div>
              <div className="participant-statuses">
                <span className="tag recruitment-eligible">{participant.lifecycle_status}</span>
                <span className="tag">{participant.allocation_status.replaceAll("_", " ")}</span>
                {participant.study_group && <span className="tag">{participant.study_group}</span>}
                {participant.account_linked && <span className="tag account-linked">account linked</span>}
                <button
                  type="button"
                  className="secondary compact-action"
                  onClick={() => setSelectedParticipantId(participant.id)}
                >
                  View details
                </button>
                {participant.allocation_status === "not_allocated" && allowAllocate && (
                  <button
                    type="button"
                    className="secondary compact-action"
                    disabled={busyId === participant.id}
                    onClick={() => allocate(participant)}
                  >
                    {busyId === participant.id ? "Allocating…" : "Run server-side allocation"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {!loading && !participants.length && (
            <div className="participant-state empty-state">
              <strong>No participants enrolled</strong>
              <span>Selected applicants will appear here after enrollment.</span>
            </div>
          )}
          {!loading && !invalidDateRange && participants.length > 0 && !filteredParticipants.length && (
            <div className="participant-state empty-state">
              <strong>No participants match these filters</strong>
              <span>Clear or adjust the filters to see other pseudonymous records.</span>
            </div>
          )}
        </div>
        {filteredParticipants.length > pageSize && (
          <div className="pagination-row">
            <button
              type="button"
              className="secondary compact-action"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              className="secondary compact-action"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </div>
        )}
      </section>

      <section className="panel participant-detail-panel">
        <p className="eyebrow">Participant detail</p>
        {!selectedParticipant ? (
          <div className="participant-state empty-state">
            <strong>Select a participant</strong>
            <span>Use View details to inspect the pseudonymous participant record.</span>
          </div>
        ) : (
          <>
            <div className="participant-detail-heading">
              <div>
                <h2>{selectedParticipant.participant_code}</h2>
                <p className="tiny">Pseudonymous research identity</p>
              </div>
              <span className="tag recruitment-eligible">{selectedParticipant.lifecycle_status}</span>
            </div>
            <dl className="detail-grid participant-detail-grid">
              <div><dt>Participant ID</dt><dd>{selectedParticipant.id}</dd></div>
              <div><dt>Identity access</dt><dd>Administrator reveal report only</dd></div>
              <div><dt>Study site</dt><dd>{siteName(selectedParticipant.site_id)}</dd></div>
              <div><dt>Enrolled</dt><dd>{formatDate(selectedParticipant.enrolled_at)}</dd></div>
              <div><dt>Lifecycle status</dt><dd>{selectedParticipant.lifecycle_status}</dd></div>
              <div><dt>Allocation status</dt><dd>{selectedParticipant.allocation_status.replaceAll("_", " ")}</dd></div>
              <div><dt>Assigned condition</dt><dd>{selectedParticipant.study_group || "Not allocated"}</dd></div>
              <div>
                <dt>Participant account</dt>
                <dd>{selectedParticipant.account_linked ? "Linked to participant-only login" : "Not linked"}</dd>
              </div>
            </dl>

            {!selectedParticipant.account_linked && allowAccountLink && (
              <div className="account-link-block">
                <strong>Link participant account</strong>
                <p className="tiny">
                  Create or link a participant-only login using the protected application email, without displaying it.
                  The account can be linked to only one enrolled participant.
                </p>
                <form className="compact-form" onSubmit={linkAccount}>
                  <input
                    name="initial_password"
                    type="password"
                    placeholder="Initial password (new account only)"
                    minLength={12}
                    autoComplete="new-password"
                  />
                  <button className="primary" disabled={accountBusy}>
                    {accountBusy ? "Linking…" : "Create or link account"}
                  </button>
                </form>
              </div>
            )}

            {!selectedParticipant.account_linked && !allowAccountLink && (
              <p className="tiny">Account provisioning is restricted to the project administrator.</p>
            )}

            <div className="allocation-detail-block">
              <strong>Allocation record</strong>
              {selectedParticipant.allocation_status !== "allocated" && (
                <p className="tiny">No allocation record exists for this participant.</p>
              )}
              {detailLoading && <p className="tiny">Loading allocation details…</p>}
              {detailError && <div className="alert error">{detailError}</div>}
              {selectedAllocation && (
                <dl className="detail-grid participant-detail-grid">
                  <div><dt>Method</dt><dd>{selectedAllocation.method.replaceAll("_", " ")}</dd></div>
                  <div><dt>Algorithm version</dt><dd>{selectedAllocation.algorithm_version}</dd></div>
                  <div><dt>Allocated at</dt><dd>{formatDate(selectedAllocation.allocated_at)}</dd></div>
                  <div><dt>Immutable record ID</dt><dd>{selectedAllocation.id}</dd></div>
                </dl>
              )}
            </div>

            <div className="audit-trail-block">
              <div className="audit-trail-heading">
                <strong>Step 1C audit trace</strong>
                {selectedAuditTrail && <span className="tag">{selectedAuditTrail.events.length} events</span>}
              </div>
              <p className="tiny">
                Operational audit events with application and account links removed.
              </p>
              {auditLoading && <p className="tiny">Loading participant audit trail…</p>}
              {auditError && <div className="alert error">{auditError}</div>}
              {selectedAuditTrail && !selectedAuditTrail.events.length && (
                <p className="tiny">No correlated audit events were found.</p>
              )}
              {selectedAuditTrail && selectedAuditTrail.events.length > 0 && (
                <ol className="participant-audit-list">
                  {selectedAuditTrail.events.map((event) => (
                    <li key={event.id}>
                      <strong>{event.action}</strong>
                      <time>{formatDate(event.created_at)}</time>
                      <small>{event.entity_type} · {event.entity_id || "No entity"}</small>
                      <small>Actor: {event.actor_user_id || "Public/system"}</small>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </section>
      </div>
    </>
  );
}

function StudyProtocolPage({
  selectedProject,
  allowWrite,
}: {
  selectedProject: Project | null;
  allowWrite: boolean;
}) {
  const [protocols, setProtocols] = useState<StudyProtocol[]>([]);
  const [summary, setSummary] = useState<ProtocolSummary | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [validation, setValidation] = useState<ProtocolValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = protocols.find((item) => item.id === selectedId) || null;

  async function reload(preferredId?: string) {
    if (!selectedProject) {
      setProtocols([]);
      setSummary(null);
      setSelectedId("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [rows, nextSummary] = await Promise.all([
        protocolApi.protocols(selectedProject.id),
        protocolApi.summary(selectedProject.id),
      ]);
      setProtocols(rows);
      setSummary(nextSummary);
      const nextId = preferredId || selectedId;
      setSelectedId(
        rows.some((item) => item.id === nextId)
          ? nextId
          : rows[0]?.id || "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load study protocols.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedId("");
    setValidation(null);
    reload().catch(console.error);
  }, [selectedProject?.id]);

  useEffect(() => {
    if (!selectedId) {
      setValidation(null);
      return;
    }
    protocolApi
      .validation(selectedId)
      .then(setValidation)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to validate protocol."));
  }, [selectedId, selected?.updated_at]);

  function levelCode(label: string, index: number) {
    const code = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return code || `level_${index + 1}`;
  }

  function parseLevels(value: FormDataEntryValue | null) {
    return String(value || "")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, index) => ({ code: levelCode(label, index), label }));
  }

  function parseBlockSizes(value: FormDataEntryValue | null) {
    return String(value || "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  function parseTaskBlocks(value: FormDataEntryValue | null) {
    return String(value || "")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, index) => ({ code: `task_${index + 1}`, label }));
  }

  async function createProtocol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const created = await protocolApi.create({
        project_id: selectedProject.id,
        version: data.get("version"),
        title: data.get("title"),
        objective: data.get("objective") || "",
        randomization_unit: "participant",
        allocation_method: "stratified_permuted_block",
        target_total: 600,
        conditions: [
          { code: "HumorBot", label: "HumorBot", target_n: 200 },
          { code: "STARCASM", label: "STARCASM", target_n: 200 },
          { code: "Control", label: "Control", target_n: 200 },
        ],
        stratification_factors: [
          {
            key: "experience_band",
            label: "Professional experience band",
            source_field: "professional_experience_band",
            required: true,
            levels: parseLevels(data.get("experience_levels")),
          },
        ],
        task_blocks: parseTaskBlocks(data.get("task_blocks")),
        permitted_block_sizes: parseBlockSizes(data.get("block_sizes")),
        protocol_document_ref: data.get("protocol_document_ref") || "",
        change_summary: data.get("change_summary") || "Initial draft.",
      });
      form.reset();
      setMessage(`Protocol ${created.version} created as a draft.`);
      await reload(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create protocol.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || selected.status !== "draft") return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await protocolApi.update(selected.id, {
        objective: data.get("objective") || "",
        protocol_document_ref: data.get("protocol_document_ref") || "",
        change_summary: data.get("change_summary") || "",
        permitted_block_sizes: parseBlockSizes(data.get("block_sizes")),
        stratification_factors: [
          {
            key: "experience_band",
            label: "Professional experience band",
            source_field: "professional_experience_band",
            required: true,
            levels: parseLevels(data.get("experience_levels")),
          },
        ],
        task_blocks: parseTaskBlocks(data.get("task_blocks")),
      });
      setMessage(`Draft ${selected.version} updated.`);
      await reload(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update draft.");
    } finally {
      setBusy(false);
    }
  }

  async function approveSelected() {
    if (!selected || selected.status !== "draft") return;
    if (!window.confirm("Approve this protocol version? Approval stores its hash and makes the version immutable.")) {
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const approved = await protocolApi.approve(selected.id);
      setMessage(`Protocol ${approved.version} approved and locked.`);
      await reload(approved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to approve protocol.");
    } finally {
      setBusy(false);
    }
  }

  const experienceLevels = selected?.stratification_factors
    .find((factor) => factor.key === "experience_band")
    ?.levels.map((level) => level.label).join(", ") || "";
  const taskBlocks = selected?.task_blocks.map((task) => task.label).join(", ") || "";

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Study governance</p>
          <h1>Protocol & Stratification</h1>
          <p className="muted">
            Version, validate and approve the 600-participant study configuration before
            connecting it to the final allocation engine.
          </p>
        </div>
        <span className="status-pill">Step 1D.1</span>
      </div>

      {message && <div className="alert">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="metric-grid protocol-metrics">
        <Metric label="Protocol versions" value={summary?.total_versions ?? 0} />
        <Metric label="Drafts" value={summary?.drafts ?? 0} />
        <Metric label="Approved" value={summary?.approved ?? 0} />
        <Metric label="Active" value={summary?.active ?? 0} />
        <Metric label="Engine connected" value={summary?.allocation_engine_connected ? "Yes" : "No"} />
      </div>

      <div className="protocol-warning">
        <strong>Activation gate</strong>
        <p>
          An approved version is still not active. Step 1D.2 must connect the protocol hash,
          participant strata and final allocation engine before activation is permitted.
        </p>
      </div>

      {!selectedProject ? (
        <section className="panel">
          <h2>Select a project first</h2>
          <p className="muted">Create or select a project from the Project page before registering a protocol.</p>
        </section>
      ) : (
        <div className="protocol-layout">
          <div className="stack">
            {allowWrite && (
              <section className="panel">
                <p className="eyebrow">New immutable version</p>
                <h2>Create protocol draft</h2>
                <form className="compact-form" onSubmit={createProtocol}>
                  <div className="two-field-row">
                    <label>Version<input name="version" placeholder="1.0-draft" required /></label>
                    <label>Title<input name="title" placeholder="HumorBot/STARCASM study protocol" required /></label>
                  </div>
                  <label>Objective<textarea name="objective" rows={2} placeholder="Protocol objective" /></label>
                  <label>
                    Experience-band levels
                    <input name="experience_levels" placeholder="Enter protocol-approved bands, separated by commas" required />
                  </label>
                  <label>
                    Experimental task blocks
                    <input name="task_blocks" placeholder="Task A, Task B, Task C, Task D" required />
                  </label>
                  <div className="two-field-row">
                    <label>Permitted block sizes<input name="block_sizes" defaultValue="3, 6" required /></label>
                    <label>Approved document reference<input name="protocol_document_ref" placeholder="Document ID, registry URL or controlled reference" required /></label>
                  </div>
                  <label>Change summary<input name="change_summary" defaultValue="Initial protocol draft." /></label>
                  <button className="primary" disabled={busy}>{busy ? "Saving…" : "Create draft"}</button>
                </form>
              </section>
            )}

            <section className="panel">
              <div className="panel-heading-row">
                <div><p className="eyebrow">Protocol registry</p><h2>Version history</h2></div>
                {loading && <span className="tag">Refreshing…</span>}
              </div>
              <div className="list protocol-list">
                {protocols.map((protocol) => (
                  <button
                    type="button"
                    className={`protocol-row ${protocol.id === selectedId ? "selected" : ""}`}
                    key={protocol.id}
                    onClick={() => setSelectedId(protocol.id)}
                  >
                    <div><strong>{protocol.version}</strong><span>{protocol.title}</span></div>
                    <span className={`tag protocol-${protocol.status}`}>{protocol.status}</span>
                  </button>
                ))}
                {!loading && !protocols.length && <p className="muted">No protocol versions registered.</p>}
              </div>
            </section>
          </div>

          <section className="panel protocol-detail-panel">
            <p className="eyebrow">Protocol detail</p>
            {!selected ? (
              <div className="participant-state empty-state"><strong>Select a protocol version</strong></div>
            ) : (
              <>
                <div className="participant-detail-heading">
                  <div><h2>{selected.version}</h2><p className="tiny">{selected.title}</p></div>
                  <span className={`tag protocol-${selected.status}`}>{selected.status}</span>
                </div>
                <dl className="detail-grid participant-detail-grid">
                  <div><dt>Project</dt><dd>{selectedProject.code}</dd></div>
                  <div><dt>Randomization unit</dt><dd>{selected.randomization_unit}</dd></div>
                  <div><dt>Allocation method</dt><dd>{selected.allocation_method.replaceAll("_", " ")}</dd></div>
                  <div><dt>Target</dt><dd>{selected.target_total}</dd></div>
                  <div><dt>Document reference</dt><dd>{selected.protocol_document_ref || "Not supplied"}</dd></div>
                  <div><dt>Configuration hash</dt><dd className="hash-value">{selected.configuration_hash || "Stored only on approval"}</dd></div>
                </dl>

                <div className="protocol-section">
                  <strong>Conditions</strong>
                  {selected.conditions.map((condition) => (
                    <div className="protocol-config-row" key={condition.code}>
                      <span>{condition.label}</span><b>{condition.target_n}</b>
                    </div>
                  ))}
                </div>

                <div className="protocol-section">
                  <strong>Stratification</strong>
                  {selected.stratification_factors.map((factor) => (
                    <div key={factor.key} className="protocol-factor">
                      <span>{factor.label}</span>
                      <div className="role-cloud">
                        {factor.levels.map((level) => <span key={level.code}>{level.label}</span>)}
                      </div>
                    </div>
                  ))}
                  <p className="tiny">Permitted block sizes: {selected.permitted_block_sizes.join(", ") || "Not configured"}</p>
                </div>

                <div className="protocol-section">
                  <strong>Experimental task blocks</strong>
                  <div className="role-cloud">
                    {selected.task_blocks.map((task) => <span key={task.code}>{task.label}</span>)}
                  </div>
                </div>

                {validation && (
                  <div className={`validation-card ${validation.approval_ready ? "ready" : "blocked"}`}>
                    <div className="panel-heading-row">
                      <strong>{validation.approval_ready ? "Approval ready" : "Approval blocked"}</strong>
                      <span className="tag">{validation.errors.length} errors</span>
                    </div>
                    {validation.errors.map((item) => <p key={item}>• {item}</p>)}
                    {validation.warnings.map((item) => <p className="tiny" key={item}>Warning: {item}</p>)}
                    <p className="tiny hash-value">Candidate hash: {validation.configuration_hash}</p>
                  </div>
                )}

                {allowWrite && selected.status === "draft" && (
                  <form key={selected.id} className="compact-form protocol-edit-form" onSubmit={updateDraft}>
                    <strong>Edit draft configuration</strong>
                    <label>Objective<textarea name="objective" rows={2} defaultValue={selected.objective} /></label>
                    <label>Experience-band levels<input name="experience_levels" defaultValue={experienceLevels} required /></label>
                    <label>Experimental task blocks<input name="task_blocks" defaultValue={taskBlocks} required /></label>
                    <label>Permitted block sizes<input name="block_sizes" defaultValue={selected.permitted_block_sizes.join(", ")} required /></label>
                    <label>Approved document reference<input name="protocol_document_ref" defaultValue={selected.protocol_document_ref} required /></label>
                    <label>Change summary<input name="change_summary" defaultValue={selected.change_summary} /></label>
                    <button type="submit" className="secondary" disabled={busy}>Save draft</button>
                  </form>
                )}

                <div className="protocol-actions">
                  {allowWrite && selected.status === "draft" && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || !validation?.approval_ready}
                      onClick={approveSelected}
                    >
                      Approve and lock version
                    </button>
                  )}
                  <button type="button" className="secondary" disabled>
                    Activation available in Step 1D.2
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
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
  const [route, setRoute] = useState(() => window.location.hash || (getToken() ? "#workspace" : "#home"));
  function navigate(next: string) { window.location.hash = next; setRoute(next); }
  useEffect(() => {
    const changed = () => setRoute(window.location.hash || "#home");
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
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
  const [selectionDecisions, setSelectionDecisions] = useState<SelectionDecision[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantMetrics, setParticipantMetrics] = useState<ParticipantMetrics | null>(null);
  const [allocationSummary, setAllocationSummary] = useState<AllocationSummary | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformError, setPlatformError] = useState("");

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
    setSelectionDecisions([]);
    setParticipants([]);
    setParticipantMetrics(null);
  }

  function clearRoleScopedState() {
    clearProjectState();
    clearAdminState();
    clearRecruitmentState();
    setAllocationSummary(null);
  }

  async function loadAllData(projectId?: string) {
    if (!user) return;

    if (canReadProjects(user)) {
      const [projectRows, allocationSummaryRow] = await Promise.all([
        api.projects(),
        participantApi.allocationSummary(),
      ]);
      setProjects(projectRows);
      setAllocationSummary(allocationSummaryRow);

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
      setAllocationSummary(null);
    }

    if (canRecruit(user)) {
      const [
        infoRow,
        applicationRows,
        metricRow,
        selectionRows,
        participantRows,
        participantMetricRow,
      ] = await Promise.all([
        recruitmentApi.publicInfo(),
        recruitmentApi.applications(),
        recruitmentApi.metrics(),
        recruitmentApi.selections(),
        participantApi.participants(),
        participantApi.metrics(),
      ]);
      setRecruitmentInfo(infoRow);
      setRecruitmentApplications(applicationRows);
      setRecruitmentMetrics(metricRow);
      setSelectionDecisions(selectionRows);
      setParticipants(participantRows);
      setParticipantMetrics(participantMetricRow);
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

  async function loadAll(projectId?: string) {
    setPlatformLoading(true);
    setPlatformError("");
    try {
      await loadAllData(projectId);
    } catch (err) {
      setPlatformError(
        err instanceof Error ? err.message : "Unable to load the latest platform data.",
      );
    } finally {
      setPlatformLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
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

  if (["#home", "#apply", "#status"].includes(route) || (!["#signin", "#workspace"].includes(route))) {
    const publicRoute = route === "#apply" || route === "#status" ? route : "#home";
    return <RecruitmentSite route={publicRoute} navigate={navigate} onSignIn={() => navigate(user ? "#workspace" : "#signin")} />;
  }

  if (!user) {
    return <LoginScreen onLogin={(nextUser) => {
      clearRoleScopedState(); setPage("overview"); setUser(nextUser); navigate("#workspace");
    }} onApply={() => navigate("#home")} />;
  }

  function logout() {
    setToken(null);
    clearRoleScopedState();
    setPage("overview");
    setUser(null);
    navigate("#signin");
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
          <button onClick={() => { window.location.href = "/digit-span.html"; }}>Digit Span game</button>
          <button onClick={() => { window.location.href = "/committee-demo.html"; }}>Committee demo</button>
          {navigation.filter(item => ["overview", "recruitment", "participants", "analysis", "workflow", "preparation"].includes(item.page)).map(item => (
            <button key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)}>
              <span>{item.page === "overview" && user.roles.includes("PARTICIPANT") ? "My study" : item.label}</span>
            </button>
          ))}
          {navigation.some(item => ["study", "project", "admin"].includes(item.page)) && <details><summary>Advanced settings</summary>
            {navigation.filter(item => ["study", "project", "admin"].includes(item.page)).map(item => <button key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)}>{item.page === "study" ? "Protocol" : item.label}</button>)}
          </details>}
        </nav>

        <div className="sidebar-user">
          <strong>{user.full_name}</strong>
          <span>{user.roles[0] || "User"}</span>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className="content">
        {page === "overview" && (canRecruit(user) ? <StudyDashboard key={user.id} onRecruitment={() => setPage("recruitment")} onParticipants={() => setPage("participants")} /> : user.roles.includes("PARTICIPANT") ? <PreparedParticipant key={user.id} /> : <LimitedOverview user={user} />)}
        {page === "analysis" && canRecruit(user) && <StudyDashboard key={`results-${user.id}`} results onRecruitment={() => setPage("recruitment")} onParticipants={() => setPage("participants")} />}
        {page === "preparation" && canRecruit(user) && <StudyPreparation participants={participants} canEdit={canManageProtocol(user)} />}
        {page === "workflow" && canRecruit(user) && <WorkflowGuide />}

        {page === "recruitment" && canRecruit(user) && (
          <Recruitment
            info={recruitmentInfo}
            applications={recruitmentApplications}
            metrics={recruitmentMetrics}
            selections={selectionDecisions}
            participants={participants}
            reload={loadAll}
          />
        )}

        {page === "participants" && canRecruit(user) && (
          <ParticipantsPage
            participants={participants}
            metrics={participantMetrics}
            allocationSummary={allocationSummary}
            info={recruitmentInfo}
            allowAllocate={canAllocate(user)}
            allowAccountLink={user.roles.includes("PROJECT_ADMIN")}
            loading={platformLoading}
            loadError={platformError}
            reload={loadAll}
          />
        )}

        {page === "study" && canReadProjects(user) && (
          <StudyProtocolPage
            selectedProject={selectedProject}
            allowWrite={canManageProtocol(user)}
          />
        )}

        {page === "study" && !canReadProjects(user) && (
          <ComingSoon title={title} />
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
          <><IdentityReveal enabled={user.roles.includes("PROJECT_ADMIN")} /><AdminPage sites={sites} audit={audit} reload={loadAll} /></>
        )}

        {["models"].includes(page) && (
          <ComingSoon title={title} />
        )}
      </main>
      </div>
    </>
  );
}
function IdentityReveal({enabled}:{enabled:boolean}) {
  const [rows,setRows]=useState<{participant_code:string;name:string;email:string}[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!rows.length)return; const id=setTimeout(()=>setRows([]),60000); return ()=>clearTimeout(id);},[rows]);
  if(!enabled)return null;
  async function reveal(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const data=new FormData(e.currentTarget);setRows([]);setError('');setBusy(true);
    try {const result=await api.revealIdentity({participant_codes:String(data.get('codes')).split(/[\s,]+/).filter(Boolean),reason:String(data.get('reason')),confirmed:data.get('confirmed')==='on'});setRows(result.rows);}
    catch(err){setError(err instanceof Error?err.message:'Unable to reveal identities.');}finally{setBusy(false);}
  }
  return <section className="panel"><h2>Restricted identity reveal report</h2><p>Only the designated identity administrator can run this report. Each use is logged. Results clear after one minute or when this page closes.</p><form className="compact-form" onSubmit={reveal}><label>Participant numbers<input name="codes" required placeholder="P-000001" /></label><label>Purpose of reveal<input name="reason" required minLength={8} maxLength={500} /></label><label><input name="confirmed" type="checkbox" required /> I confirm that this identity reveal is necessary.</label><button className="primary" disabled={busy}>{busy?'Recording access…':'Run reveal report'}</button></form>{error&&<p role="alert">{error}</p>}{rows.length>0&&<><table><thead><tr><th>Participant number</th><th>Name</th><th>Email</th></tr></thead><tbody>{rows.map(r=><tr key={r.participant_code}><td>{r.participant_code}</td><td>{r.name}</td><td>{r.email}</td></tr>)}</tbody></table><button onClick={()=>setRows([])}>Hide identities now</button></>}</section>;
}

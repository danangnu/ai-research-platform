const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

export type User = {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  is_active: boolean;
};

export type Project = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Milestone = {
  id: string;
  project_id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
};

export type StudyTask = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
};

export type Risk = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  level: string;
  status: string;
  mitigation: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type StudySite = {
  id: string;
  code: string;
  name: string;
  status: string;
};

export function getToken(): string | null {
  return localStorage.getItem("research_access_token");
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem("research_access_token", token);
  } else {
    localStorage.removeItem("research_access_token");
  }
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(item => {
    if (item && typeof item === "object" && "msg" in item) {
      const field = Array.isArray(item.loc) ? item.loc.filter((x: unknown) => x !== "body").join(" ") : "";
      return `${field ? field.replaceAll("_", " ") + ": " : ""}${item.msg}`;
    }
    return "Please check the entered values.";
  }).join("; ");
  return "The request could not be completed.";
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data
        ? formatDetail((data as { detail: unknown }).detail)
        : `Request failed (${response.status})`;

    throw new Error(detail);
  }

  return data as T;
}

export async function login(email: string, password: string) {
  return request<{
    access_token: string;
    token_type: string;
    user: User;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export const api = {
  me: () => request<User>("/api/auth/me"),

  projects: () => request<Project[]>("/api/projects"),

  createProject: (body: Record<string, unknown>) =>
    request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  milestones: (projectId: string) =>
    request<Milestone[]>(
      `/api/projects/${projectId}/milestones`,
    ),

  createMilestone: (
    projectId: string,
    body: Record<string, unknown>,
  ) =>
    request<Milestone>(
      `/api/projects/${projectId}/milestones`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  tasks: (projectId: string) =>
    request<StudyTask[]>(
      `/api/projects/${projectId}/tasks`,
    ),

  createTask: (
    projectId: string,
    body: Record<string, unknown>,
  ) =>
    request<StudyTask>(
      `/api/projects/${projectId}/tasks`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  updateTask: (
    projectId: string,
    taskId: string,
    body: Record<string, unknown>,
  ) =>
    request<StudyTask>(
      `/api/projects/${projectId}/tasks/${taskId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),

  risks: (projectId: string) =>
    request<Risk[]>(
      `/api/projects/${projectId}/risks`,
    ),

  createRisk: (
    projectId: string,
    body: Record<string, unknown>,
  ) =>
    request<Risk>(
      `/api/projects/${projectId}/risks`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  sites: () =>
    request<StudySite[]>("/api/admin/study-sites"),

  createSite: (body: Record<string, unknown>) =>
    request<StudySite>("/api/admin/study-sites", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  revealIdentity: (body: Record<string, unknown>) => request<{rows:{participant_code:string;name:string;email:string}[]}>("/api/admin/identity-reveal", {method:"POST",body:JSON.stringify(body)}),

  audit: () =>
    request<AuditEvent[]>("/api/admin/audit?limit=100"),
};

export type RecruitmentSite = {
  id: string;
  code: string;
  name: string;
};

export type RecruitmentPublicInfo = {
  study_name: string;
  recruitment_open: boolean;
  target_total: number;
  target_groups: Record<string, number>;
  consent_version: string;
  protocol_criteria_configured: boolean;
  demo_mode: boolean;
  sites: RecruitmentSite[];
  informed_consent: {version:string; text:string; status:string};
};

export type RecruitmentApplication = {
  enrolled: boolean;
  id: string;
  reference_code: string;
  site_id: string | null;
  preferred_name: string;
  contact_email: string;
  recruitment_source: string;
  consent_to_screen: boolean;
  privacy_acknowledged: boolean;
  consent_version: string;
  screening_answers: Record<string, boolean>;
  status: string;
  review_note: string;
  reviewed_by_id: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RecruitmentReceipt = RecruitmentApplication & { access_token: string };
export type RecruitmentStatus = {
  reference_code: string; status: string; stage: string; submitted_at: string;
  updated_at: string; next_step: string; can_withdraw: boolean;
};

export type RecruitmentMetrics = {
  applications: number;
  submitted: number;
  under_review: number;
  needs_review: number;
  eligible: number;
  ineligible: number;
  withdrawn: number;
};

export const recruitmentApi = {
  publicInfo: () =>
    request<RecruitmentPublicInfo>("/api/public/recruitment/info"),

  submitApplication: (body: Record<string, unknown>) =>
    request<RecruitmentReceipt>("/api/public/recruitment/applications", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  status: (body: { reference_code: string; access_token: string }) =>
    request<RecruitmentStatus>("/api/public/recruitment/status", { method: "POST", body: JSON.stringify(body) }),
  withdraw: (body: { reference_code: string; access_token: string }) =>
    request<RecruitmentStatus>("/api/public/recruitment/withdraw", { method: "POST", body: JSON.stringify(body) }),

  applications: () =>
    request<RecruitmentApplication[]>("/api/recruitment/applications"),

  metrics: () =>
    request<RecruitmentMetrics>("/api/recruitment/metrics"),

  review: (
    applicationId: string,
    body: Record<string, unknown>,
  ) =>
    request<RecruitmentApplication>(
      `/api/recruitment/applications/${applicationId}/review`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),

  selections: () =>
    request<SelectionDecision[]>("/api/recruitment/selections"),

  recordSelection: (
    applicationId: string,
    body: Record<string, unknown>,
  ) =>
    request<SelectionDecision>(
      `/api/recruitment/applications/${applicationId}/selection`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  enroll: (applicationId: string) =>
    request<Participant>(
      `/api/recruitment/applications/${applicationId}/enroll`,
      { method: "POST" },
    ),
};


export type SelectionDecision = {
  id: string;
  application_id: string;
  status: "selected" | "waitlisted" | "not_selected";
  note: string;
  decided_by_id: string | null;
  decided_at: string;
  created_at: string;
  updated_at: string;
};

export type Participant = {
  account_linked: boolean;
  id: string;
  participant_code: string;
  application_id: string;
  site_id: string | null;
  user_id: string | null;
  lifecycle_status: string;
  allocation_status: string;
  study_group: string | null;
  enrolled_by_id: string | null;
  enrolled_at: string;
  created_at: string;
  updated_at: string;
};

export type ParticipantMetrics = {
  participants: number;
  enrolled: number;
  allocated: number;
  not_allocated: number;
  linked_accounts: number;
  remaining_target: number;
  humorbot: number;
  starcasm: number;
  control: number;
};

export type ParticipantAllocation = {
  id: string;
  participant_id: string;
  study_group: "HumorBot" | "STARCASM" | "Control";
  method: string;
  algorithm_version: string;
  allocation_basis: Record<string, unknown>;
  allocated_by_id: string | null;
  allocated_at: string;
  created_at: string;
  updated_at: string;
};

export type AllocationSummary = {
  target_total: number;
  target_per_group: number;
  allocated: number;
  not_allocated: number;
  remaining_capacity: number;
  groups: Record<string, number>;
  algorithm_version: string;
  method: string;
  protocol_finalized: boolean;
};

export type ParticipantAccountLink = {
  participant_id: string;
  participant_code: string;
  user_id: string;
  account_status: "linked";
  created_account: boolean;
  linked_at: string;
};

export type ParticipantSelf = {
  participant_id: string;
  participant_code: string;
  site_id: string | null;
  lifecycle_status: string;
  allocation_status: string;
  assigned_condition: "HumorBot" | "STARCASM" | "Control" | null;
  enrolled_at: string;
  account_status: "linked";
};

export type ParticipantAuditTrail = {
  participant_id: string;
  participant_code: string;
  application_id: string;
  events: Array<{
    id: string;
    actor_user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
  }>;
};

export const participantApi = {
  participants: () => request<Participant[]>("/api/participants"),
  metrics: () => request<ParticipantMetrics>("/api/participants/metrics"),
  allocationSummary: () =>
    request<AllocationSummary>("/api/participants/allocation-summary"),
  allocate: (participantId: string) =>
    request<ParticipantAllocation>(`/api/participants/${participantId}/allocate`, {
      method: "POST",
    }),
  allocation: (participantId: string) =>
    request<ParticipantAllocation>(`/api/participants/${participantId}/allocation`),
  linkAccount: (participantId: string, body: Record<string, unknown>) =>
    request<ParticipantAccountLink>(`/api/participants/${participantId}/account`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  self: () => request<ParticipantSelf>("/api/participant/me"),
  auditTrail: (participantId: string) =>
    request<ParticipantAuditTrail>(`/api/participants/${participantId}/audit-trail`),
};

export type ProtocolCondition = {
  code: string;
  label: string;
  target_n: number;
};

export type ProtocolStratumLevel = {
  code: string;
  label: string;
};

export type ProtocolStratificationFactor = {
  key: string;
  label: string;
  source_field: string;
  required: boolean;
  levels: ProtocolStratumLevel[];
};

export type ProtocolTaskBlock = {
  code: string;
  label: string;
};

export type StudyProtocol = {
  id: string;
  project_id: string;
  version: string;
  title: string;
  status: "draft" | "approved" | "active";
  objective: string;
  randomization_unit: string;
  allocation_method: string;
  target_total: number;
  conditions: ProtocolCondition[];
  stratification_factors: ProtocolStratificationFactor[];
  task_blocks: ProtocolTaskBlock[];
  permitted_block_sizes: number[];
  protocol_document_ref: string;
  change_summary: string;
  supersedes_protocol_id: string | null;
  configuration_hash: string | null;
  created_by_id: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProtocolValidation = {
  protocol_id: string;
  valid: boolean;
  approval_ready: boolean;
  activation_ready: boolean;
  errors: string[];
  warnings: string[];
  configuration_hash: string;
  activation_blocker: string;
};

export type ProtocolSummary = {
  total_versions: number;
  drafts: number;
  approved: number;
  active: number;
  latest_protocol_id: string | null;
  allocation_engine_connected: boolean;
};

export const protocolApi = {
  protocols: (projectId?: string) =>
    request<StudyProtocol[]>(
      `/api/study/protocols${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`,
    ),
  summary: (projectId?: string) =>
    request<ProtocolSummary>(
      `/api/study/protocols/summary${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`,
    ),
  create: (body: Record<string, unknown>) =>
    request<StudyProtocol>("/api/study/protocols", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (protocolId: string, body: Record<string, unknown>) =>
    request<StudyProtocol>(`/api/study/protocols/${protocolId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  validation: (protocolId: string) =>
    request<ProtocolValidation>(`/api/study/protocols/${protocolId}/validation`),
  approve: (protocolId: string) =>
    request<StudyProtocol>(`/api/study/protocols/${protocolId}/approve`, {
      method: "POST",
    }),
  activate: (protocolId: string) =>
    request<StudyProtocol>(`/api/study/protocols/${protocolId}/activate`, {
      method: "POST",
    }),
};


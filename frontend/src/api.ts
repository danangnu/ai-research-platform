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

async function request<T>(
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
        ? String((data as { detail: unknown }).detail)
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
};

export type RecruitmentApplication = {
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

export type RecruitmentMetrics = {
  applications: number;
  submitted: number;
  under_review: number;
  needs_review: number;
  eligible: number;
  ineligible: number;
};

export const recruitmentApi = {
  publicInfo: () =>
    request<RecruitmentPublicInfo>("/api/public/recruitment/info"),

  submitApplication: (body: Record<string, unknown>) =>
    request<RecruitmentApplication>("/api/public/recruitment/applications", {
      method: "POST",
      body: JSON.stringify(body),
    }),

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
};

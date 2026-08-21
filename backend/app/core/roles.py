PROJECT_ADMIN = "PROJECT_ADMIN"
RESEARCH_LEAD = "RESEARCH_LEAD"
AI_ML_RESEARCH_ENGINEER = "AI_ML_RESEARCH_ENGINEER"
RESEARCH_ASSISTANT = "RESEARCH_ASSISTANT"
SITE_COORDINATOR = "SITE_COORDINATOR"
PARTICIPANT = "PARTICIPANT"

ALL_ROLES = {
    PROJECT_ADMIN: "Full platform administration.",
    RESEARCH_LEAD: "Research protocol and study-management authority.",
    AI_ML_RESEARCH_ENGINEER: "AI/ML, model lifecycle and technical research operations.",
    RESEARCH_ASSISTANT: "Approved research and recruitment operations.",
    SITE_COORDINATOR: "Institution/site-level participant operations.",
    PARTICIPANT: "Participant-facing study access only.",
}

PROJECT_READ_ROLES = {
    PROJECT_ADMIN,
    RESEARCH_LEAD,
    AI_ML_RESEARCH_ENGINEER,
    RESEARCH_ASSISTANT,
}

PROJECT_WRITE_ROLES = {
    PROJECT_ADMIN,
    RESEARCH_LEAD,
}

PROJECT_TASK_WRITE_ROLES = {
    PROJECT_ADMIN,
    RESEARCH_LEAD,
    AI_ML_RESEARCH_ENGINEER,
    RESEARCH_ASSISTANT,
}

ADMIN_ROLES = {
    PROJECT_ADMIN,
    RESEARCH_LEAD,
}


# Applicant-level recruitment data is intentionally separated from AI/ML
# engineering access. These roles operate the recruitment workflow.
RECRUITMENT_ROLES = {
    PROJECT_ADMIN,
    RESEARCH_LEAD,
    RESEARCH_ASSISTANT,
}


# Step 1C.1 participant identity/selection data remains recruitment-operations
# data and is not exposed to AI/ML engineering or participant roles.
PARTICIPANT_MANAGEMENT_ROLES = RECRUITMENT_ROLES


# Step 1C.2 allocation is a protocol-sensitive operation. Research assistants
# can continue participant-management work but cannot trigger assignment.
ALLOCATION_ROLES = {
    PROJECT_ADMIN,
    RESEARCH_LEAD,
}

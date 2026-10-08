import { FormEvent, useEffect, useState } from "react";
import { getToken, Participant, request } from "./api";
import { ParticipantStudy } from "./StudyWorkflow";
import "./study-preparation.css";
import { AssessmentDraft } from "./AssessmentDraft";

type Choice = { value: string; label: string; points: number | null };
type Item = {
  id: string;
  prompt: string;
  kind: "choice" | "text" | "number";
  required: boolean;
  options: Choice[];
  minimum: number | null;
  maximum: number | null;
};
type Form = {
  title: string;
  instrument_version: string;
  instructions: string;
  scoring: "none" | "sum_choice";
  scale_id: string;
  items: Item[];
};
type Stage = "questionnaire" | "pre" | "post";
type Spec = {
  version: string;
  title: string;
  population_note: string;
  interaction_note: string;
  synthetic_only: true;
  schedule: {
    duration_days: number;
    sessions_per_week: number;
    suggested_minutes_min: number;
    suggested_minutes_max: number;
    interim_day: number | null;
  };
  forms: Record<Stage, Form>;
};
type Config = {
  id: string;
  version: string;
  definition: Spec;
  missing_forms: string[];
};
type State = {
  assigned: boolean;
  participant_id: string;
  participant_code: string;
  condition: string | null;
  configuration_id: string;
  version: string;
  title: string;
  interaction_note: string;
  next_stage: string;
  post_due_at: string | null;
  next_session_at: string | null;
  started_at: string | null;
  schedule: Spec["schedule"];
  form: Form | null;
  observations: { stage: string; recorded_at: string }[];
  scores?: Record<string, { value: number | null }>;
  paired_change: number | null;
  session_count: number;
  reported_minutes: number;
};
const ROOT = "/api/study-preparation";
const stages: Stage[] = ["questionnaire", "pre", "post"];
const titles = {
  questionnaire: "Background questionnaire",
  pre: "Pre-test",
  post: "Post-test",
};
const blankForm = (title: string): Form => ({
  title,
  instrument_version: "pending-v1",
  instructions: "",
  scoring: "none",
  scale_id: "",
  items: [],
});
const blank = (): Spec => ({
  version: "preparation-v1",
  title: "Three-month study preparation",
  population_note: "Pending study-team confirmation",
  interaction_note:
    "Pending study-team instructions for interaction with the assigned bot",
  synthetic_only: true,
  schedule: {
    duration_days: 30,
    sessions_per_week: 3,
    suggested_minutes_min: 5,
    suggested_minutes_max: 10,
    interim_day: null,
  },
  forms: {
    questionnaire: blankForm("Background questionnaire"),
    pre: blankForm("Pre-test"),
    post: blankForm("Post-test"),
  },
});
const post = <T,>(path: string, body?: unknown) =>
  request<T>(ROOT + path, { method: "POST", body: JSON.stringify(body) });
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Unable to complete this action.";
const conditionLabel = (v: string | null) =>
  v === "HumorBot"
    ? "DANG"
    : v === "STARCASM"
      ? "StARCASM"
      : v === "Control"
        ? "Neutral practice"
        : v || "Awaiting group assignment";
const stageLabel = (v: string) =>
  ({
    questionnaire: "Background questionnaire",
    pre: "Pre-test",
    post: "Post-test",
    waiting: "Today’s log is saved",
    allocation: "Awaiting group assignment",
    awaiting_start: "Ready to start",
    complete: "Walkthrough complete",
    inactive: "Participation inactive",
  })[v] || v.replace("session-", "Session ");
const date = (v: string | null) =>
  v ? new Date(v).toLocaleString() : "Not started";

export function StudyPreparation({
  participants,
  canEdit,
}: {
  participants: Participant[];
  canEdit: boolean;
}) {
  const [configs, setConfigs] = useState<Config[]>([]),
    [runs, setRuns] = useState<State[]>([]);
  const [spec, setSpec] = useState<Spec>(blank),
    [stage, setStage] = useState<Stage>("questionnaire");
  const [configId, setConfigId] = useState(""),
    [participantId, setParticipantId] = useState("");
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  async function load() {
    const [c, r] = await Promise.all([
      request<Config[]>(ROOT + "/configurations"),
      request<{ participants: State[] }>(ROOT + "/dashboard"),
    ]);
    setConfigs(c);
    setRuns(r.participants);
  }
  useEffect(() => {
    load().catch((e) => setNotice(message(e)));
  }, []);
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(success);
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  const form = spec.forms[stage];
  function editForm(change: Partial<Form>) {
    setSpec({
      ...spec,
      forms: { ...spec.forms, [stage]: { ...form, ...change } },
    });
  }
  function editItem(index: number, change: Partial<Item>) {
    editForm({
      items: form.items.map((q, i) => (i === index ? { ...q, ...change } : q)),
    });
  }
  async function download() {
    setBusy(true);
    try {
      const r = await fetch(
        (import.meta.env.VITE_API_URL || "http://localhost:8000") +
          ROOT +
          "/export",
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!r.ok) throw new Error("Export failed. Check access and try again.");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "study-research-export.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Complete study export downloaded. Raw free text requires review before sharing.",
      );
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="prep stack">
      <header>
        <p className="eyebrow">Study preparation</p>
        <h1>Questionnaire, assessments and schedule</h1>
        <p>
          Prepare a separate fictional walkthrough. Existing four-question demo
          records remain unchanged. Committee demonstration uses provisional MoCA and Iowa Trail Making at baseline, SAGE Form 1 at follow-up, and participant feedback. Final scoring and session details remain subject to the approved protocol.
        </p>
      </header>
      <details className="panel"><summary>Committee / IRB demonstration forms</summary><AssessmentDraft /></details>
      {notice && (
        <div role="status" className="alert">
          {notice}
        </div>
      )}
      <section className="panel stack">
        <h2>1. Save a configuration version</h2>
        <p>
          Saved versions cannot be edited. Copy a version and give the copy a
          new name to make changes.
        </p>
        <label>
          Copy a saved version
          <select
            value=""
            onChange={(e) => {
              const c = configs.find((c) => c.id === e.target.value);
              if (c) {
                setSpec({
                  ...structuredClone(c.definition),
                  version: c.version + "-copy",
                });
                setNotice(
                  "Copy loaded. Choose a unique version name before saving.",
                );
              }
            }}
          >
            <option value="">Choose a version</option>
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.version}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action(
              () => post("/configurations", spec),
              "Version saved. Empty forms remain drafts and cannot be assigned.",
            );
          }}
          className="stack"
        >
          <fieldset disabled={!canEdit || busy} className="stack">
            <div className="prep-grid">
              <label>
                Version name
                <input
                  required
                  pattern="[a-zA-Z0-9._-]+"
                  value={spec.version}
                  onChange={(e) =>
                    setSpec({ ...spec, version: e.target.value })
                  }
                />
              </label>
              <label>
                Study title
                <input
                  required
                  value={spec.title}
                  onChange={(e) => setSpec({ ...spec, title: e.target.value })}
                />
              </label>
            </div>
            <label>
              Population note
              <textarea
                value={spec.population_note}
                onChange={(e) =>
                  setSpec({ ...spec, population_note: e.target.value })
                }
              />
            </label>
            <label>
              Instructions for bot interaction
              <textarea
                value={spec.interaction_note}
                onChange={(e) =>
                  setSpec({ ...spec, interaction_note: e.target.value })
                }
              />
            </label>
            <div className="prep-grid">
              {(
                [
                  ["duration_days", "Duration (days)"],
                  ["sessions_per_week", "Suggested sessions per week"],
                  ["suggested_minutes_min", "Suggested minimum minutes"],
                  ["suggested_minutes_max", "Suggested maximum minutes"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    required
                    min={1}
                    max={
                      key === "duration_days"
                        ? 365
                        : key === "sessions_per_week"
                          ? 7
                          : 180
                    }
                    value={spec.schedule[key]}
                    onChange={(e) =>
                      setSpec({
                        ...spec,
                        schedule: {
                          ...spec.schedule,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Interim reminder day (optional)
                <input
                  type="number"
                  min={1}
                  max={spec.schedule.duration_days - 1}
                  value={spec.schedule.interim_day ?? ""}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      schedule: {
                        ...spec.schedule,
                        interim_day: e.target.value
                          ? Number(e.target.value)
                          : null,
                      },
                    })
                  }
                />
              </label>
            </div>
            <p className="tiny">
              30 days is the current study duration. Frequency
              is a target; missed sessions do not block the post-test. An
              interim reminder does not create an assessment or send a
              notification.
            </p>
            <div className="prep-tabs">
              {stages.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={s === stage ? "primary" : ""}
                  onClick={() => setStage(s)}
                >
                  {titles[s]} ({spec.forms[s].items.length})
                </button>
              ))}
            </div>
            <label>
              Form title
              <input
                required
                value={form.title}
                onChange={(e) => editForm({ title: e.target.value })}
              />
            </label>
            <label>
              Instrument version
              <input
                required
                value={form.instrument_version}
                onChange={(e) =>
                  editForm({ instrument_version: e.target.value })
                }
              />
            </label>
            <label>
              Form instructions
              <textarea
                value={form.instructions}
                onChange={(e) => editForm({ instructions: e.target.value })}
              />
            </label>
            <label>
              Scoring
              <select
                disabled={stage === "questionnaire"}
                value={form.scoring}
                onChange={(e) => {
                  const scoring = e.target.value as Form["scoring"];
                  editForm({
                    scoring,
                    items: form.items.map((q) => ({
                      ...q,
                      options: q.options.map((o) => ({
                        ...o,
                        points: scoring === "none" ? null : 0,
                      })),
                    })),
                  });
                }}
              >
                <option value="none">Record answers without a score</option>
                <option value="sum_choice">Sum explicit choice points</option>
              </select>
            </label>
            {form.scoring === "sum_choice" && (
              <>
                <label>
                  Scale identifier
                  <input
                    required
                    value={form.scale_id}
                    onChange={(e) => editForm({ scale_id: e.target.value })}
                  />
                </label>
                <p className="tiny">
                  Use the same scale identifier only for comparable pre/post
                  forms. Complex or clinician-administered tests need a separate
                  reviewed implementation.
                </p>
              </>
            )}
            {form.items.length === 0 && (
              <p className="alert">
                No questions added. Waiting for the study materials.
              </p>
            )}
            {form.items.map((q, i) => (
              <fieldset key={q.id} className="prep-item stack">
                <legend>
                  Question {i + 1} · {q.id}
                </legend>
                <label>
                  Question text
                  <textarea
                    required
                    value={q.prompt}
                    onChange={(e) => editItem(i, { prompt: e.target.value })}
                  />
                </label>
                <label>
                  Response type
                  <select
                    value={q.kind}
                    onChange={(e) => {
                      const kind = e.target.value as Item["kind"];
                      editItem(i, {
                        kind,
                        options:
                          kind === "choice"
                            ? [
                                {
                                  value: "option-1",
                                  label: "",
                                  points: form.scoring === "none" ? null : 0,
                                },
                                {
                                  value: "option-2",
                                  label: "",
                                  points: form.scoring === "none" ? null : 0,
                                },
                              ]
                            : [],
                        minimum: null,
                        maximum: null,
                      });
                    }}
                  >
                    <option value="choice">Single choice</option>
                    <option value="text">Free text</option>
                    <option value="number">Number</option>
                  </select>
                </label>
                <label className="prep-check">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) =>
                      editItem(i, { required: e.target.checked })
                    }
                  />
                  Required response
                </label>
                {q.kind === "number" && (
                  <div className="prep-grid">
                    {(["minimum", "maximum"] as const).map((k) => (
                      <label key={k}>
                        {k}
                        <input
                          type="number"
                          step="any"
                          value={q[k] ?? ""}
                          onChange={(e) =>
                            editItem(i, {
                              [k]: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
                {q.kind === "choice" && (
                  <>
                    {q.options.map((o, j) => (
                      <div className="prep-grid" key={o.value}>
                        <label>
                          Option {j + 1}
                          <input
                            required
                            value={o.label}
                            onChange={(e) =>
                              editItem(i, {
                                options: q.options.map((v, n) =>
                                  n === j ? { ...v, label: e.target.value } : v,
                                ),
                              })
                            }
                          />
                        </label>
                        {form.scoring === "sum_choice" && (
                          <label>
                            Points
                            <input
                              type="number"
                              required
                              min={0}
                              max={100}
                              value={o.points ?? 0}
                              onChange={(e) =>
                                editItem(i, {
                                  options: q.options.map((v, n) =>
                                    n === j
                                      ? { ...v, points: Number(e.target.value) }
                                      : v,
                                  ),
                                })
                              }
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          disabled={q.options.length <= 2}
                          onClick={() =>
                            editItem(i, {
                              options: q.options.filter((_, n) => n !== j),
                            })
                          }
                        >
                          Remove option
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={q.options.length >= 30}
                      onClick={() =>
                        editItem(i, {
                          options: [
                            ...q.options,
                            {
                              value: crypto.randomUUID(),
                              label: "",
                              points: form.scoring === "none" ? null : 0,
                            },
                          ],
                        })
                      }
                    >
                      Add option
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() =>
                    editForm({ items: form.items.filter((_, n) => n !== i) })
                  }
                >
                  Remove question
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              disabled={form.items.length >= 100}
              onClick={() =>
                editForm({
                  items: [
                    ...form.items,
                    {
                      id: crypto.randomUUID(),
                      prompt: "",
                      kind: "text",
                      required: true,
                      options: [],
                      minimum: null,
                      maximum: null,
                    },
                  ],
                })
              }
            >
              Add question
            </button>
            <button className="primary">Save immutable version</button>
          </fieldset>
        </form>
        {!canEdit && (
          <p>
            Only the project administrator or research lead can save versions
            and assign runs.
          </p>
        )}
      </section>
      <section className="panel stack">
        <h2>2. Assign a new fictional participant</h2>
        <p>
          Enroll and link a new demo account through Recruitment and
          Participants first. A participant with saved legacy answers cannot
          switch workflows.
        </p>
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Readiness</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id}>
                <td>{c.version}</td>
                <td>
                  {c.missing_forms.length
                    ? `Missing: ${c.missing_forms.join(", ")}`
                    : "Ready for a fictional walkthrough"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label>
          Configuration
          <select
            value={configId}
            onChange={(e) => setConfigId(e.target.value)}
          >
            <option value="">Choose</option>
            {configs
              .filter((c) => !c.missing_forms.length)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.version}
                </option>
              ))}
          </select>
        </label>
        <label>
          Participant
          <select
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
          >
            <option value="">Choose</option>
            {participants
              .filter((p) => !runs.some((r) => r.participant_id === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.participant_code}
                </option>
              ))}
          </select>
        </label>
        <label className="prep-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          This is a fictional walkthrough, with no real participant information.
        </label>
        <button
          className="primary"
          disabled={
            !canEdit || busy || !confirmed || !configId || !participantId
          }
          onClick={() =>
            action(
              () =>
                post(`/runs/${participantId}`, {
                  configuration_id: configId,
                  confirmed_synthetic: true,
                }),
              "Configuration assigned. Sign in with the linked participant account to complete the questionnaire and pre-test.",
            )
          }
        >
          Assign version
        </button>
      </section>
      <section className="panel stack">
        <h2>3. Follow the study</h2>
        <p>
          After baseline and allocation, staff start the interaction period. The
          post-test becomes available at the end of the configured period even
          when session logs are missing.
        </p>
        <div className="prep-scroll">
          <table>
            <thead>
              <tr>
                <th>Participant / version</th>
                <th>Next step</th>
                <th>Post-test due</th>
                <th>Pre / post / change</th>
                <th>Logs / minutes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.participant_id}>
                  <td>
                    {r.participant_code}
                    <br />
                    {r.version}
                  </td>
                  <td>{r.next_stage}</td>
                  <td>{date(r.post_due_at)}</td>
                  <td>
                    {r.scores?.pre?.value ?? "—"} /{" "}
                    {r.scores?.post?.value ?? "—"} / {r.paired_change ?? "—"}
                  </td>
                  <td>
                    {r.session_count} / {r.reported_minutes}
                  </td>
                  <td>
                    {r.next_stage === "awaiting_start" && (
                      <button
                        disabled={!canEdit || busy}
                        onClick={() =>
                          action(
                            () => post(`/runs/${r.participant_id}/start`),
                            "Interaction period started.",
                          )
                        }
                      >
                        Start period
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!runs.length && <p>No prepared participants yet.</p>}
        <button
          disabled={busy}
          onClick={() => action(load, "Progress refreshed.")}
        >
          Refresh progress
        </button>
        <button disabled={busy} onClick={download}>
          Download full study export (ZIP)
        </button>
        <p className="tiny">
          Includes all saved legacy and prepared study responses, plus form
          versions and a data dictionary. No dashboard filters apply.
          Recruitment identities are excluded; free text still requires review.
        </p>
      </section>
    </div>
  );
}

export function PreparedParticipant() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false),
    [minutes, setMinutes] = useState(5),
    [assistance, setAssistance] = useState("none"),
    [comfort, setComfort] = useState("comfortable");
  async function load() {
    const r = await request<State>(ROOT + "/me");
    setState(r);
    setAnswers({});
    setConfirmed(false);
  }
  useEffect(() => {
    load().catch((e) => setError(message(e)));
  }, []);
  if (!state)
    return <section className="panel">{error || "Loading study…"}</section>;
  if (!state.assigned) return <ParticipantStudy />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!state || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const payload = state.form
        ? {
            answers: Object.fromEntries(
              state.form.items.map((q) => [
                q.id,
                answers[q.id] === undefined || answers[q.id] === ""
                  ? null
                  : q.kind === "number"
                    ? Number(answers[q.id])
                    : answers[q.id],
              ]),
            ),
          }
        : { minutes, assistance, comfort };
      await post("/me/" + state.next_stage, {
        configuration_id: state.configuration_id,
        confirmed_synthetic: true,
        ...payload,
      });
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const session = state.next_stage.startsWith("session-");
  return (
    <div className="prep stack">
      <header>
        <p className="eyebrow">
          Fictional walkthrough · {state.participant_code}
        </p>
        <h1>{state.title}</h1>
        <p>
          Version {state.version} · {conditionLabel(state.condition)}
        </p>
      </header>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <section className="panel stack">
        <h2>
          {state.form?.title ||
            (session
              ? "Record today’s interaction"
              : stageLabel(state.next_stage))}
        </h2>
        {state.next_stage === "allocation" && (
          <p>
            The questionnaire and pre-test are saved. Staff will assign a study
            group.
          </p>
        )}
        {state.next_stage === "awaiting_start" && (
          <p>The baseline is saved. Staff will start the interaction period.</p>
        )}
        {state.next_stage === "waiting" && (
          <p>
            Today’s log is saved. Another log can be recorded after{" "}
            {date(state.next_session_at)}. Post-test available:{" "}
            {date(state.post_due_at)}.
          </p>
        )}
        {state.next_stage === "complete" && (
          <p>
            The post-test is saved. Thank you for completing the walkthrough.
          </p>
        )}
        {state.next_stage === "inactive" && (
          <p>Participation is inactive. Contact the study team.</p>
        )}
        {(state.form || session) && (
          <form onSubmit={submit} className="stack">
            <fieldset disabled={busy} className="stack">
              {state.form && (
                <>
                  <p>{state.form.instructions}</p>
                  {state.form.items.map((q, i) => (
                    <label key={q.id}>
                      {i + 1}. {q.prompt}{" "}
                      {q.required ? "(required)" : "(optional)"}
                      {q.kind === "choice" ? (
                        <select
                          required={q.required}
                          value={answers[q.id] ?? ""}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                        >
                          <option value="">
                            {q.required
                              ? "Choose an answer"
                              : "Skip / no answer"}
                          </option>
                          {q.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : q.kind === "text" ? (
                        <textarea
                          maxLength={10000}
                          required={q.required}
                          value={answers[q.id] ?? ""}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                        />
                      ) : (
                        <input
                          type="number"
                          step="any"
                          min={q.minimum ?? undefined}
                          max={q.maximum ?? undefined}
                          required={q.required}
                          value={answers[q.id] ?? ""}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                        />
                      )}
                    </label>
                  ))}
                </>
              )}
              {session && (
                <>
                  <p>{state.interaction_note}</p>
                  <p>
                    Planned frequency: {state.schedule.sessions_per_week}{" "}
                    sessions per week, {state.schedule.suggested_minutes_min}–
                    {state.schedule.suggested_minutes_max} minutes. Record
                    actual time below.
                  </p>
                  <p>
                    Use the assigned activity provided by study staff, then
                    return here. This log does not capture bot dialogue.
                  </p>
                  <label>
                    Minutes
                    <input
                      type="number"
                      required
                      min={1}
                      max={180}
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Assistance
                    <select
                      value={assistance}
                      onChange={(e) => setAssistance(e.target.value)}
                    >
                      {["none", "some", "substantial"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    How did the session feel?
                    <select
                      value={comfort}
                      onChange={(e) => setComfort(e.target.value)}
                    >
                      {[
                        "comfortable",
                        "tiring",
                        "upsetting",
                        "prefer_not_to_say",
                      ].map((v) => (
                        <option key={v} value={v}>
                          {v.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="prep-check">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                These are fictional demo responses.
              </label>
              <button className="primary" disabled={!confirmed || busy}>
                {busy ? "Saving…" : "Save responses"}
              </button>
            </fieldset>
          </form>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => load().catch((e) => setError(message(e)))}
        >
          Refresh status
        </button>
      </section>
      <section className="panel">
        <h2>Saved activities</h2>
        {state.observations.length ? (
          state.observations.map((o) => (
            <p key={o.stage}>
              {stageLabel(o.stage)} · {date(o.recorded_at)}
            </p>
          ))
        ) : (
          <p>No responses saved yet.</p>
        )}
      </section>
    </div>
  );
}

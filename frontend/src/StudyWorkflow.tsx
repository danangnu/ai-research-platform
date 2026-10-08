import { FormEvent, useEffect, useState } from "react";
import { request } from "./api";
import "./study-workflow.css";

type Score = {correct: number; total: number; skipped: number};
type Row = {participant_id?: string; participant_code: string; condition: string | null; next_stage: string; account_linked: boolean; completed_stages: string[]; scores?: Record<string, Score>; session_minutes?: number; needs_review?: boolean; observations: {stage: string; recorded_at: string; version: string; response?: Record<string, unknown>; items?: {prompt:string; answer:string; reference:string}[]}[]};
type Progress = Row & {version: string; labels: Record<string, string>; stages: string[]; questions: {prompt: string; options: string[]}[]};
type Dashboard = {version: string; labels: Record<string,string>; participants: Row[]; counts: Record<string, number>; paired: {n: number; mean_change: number | null}};
const group = (value: string | null) => ({HumorBot: "DANG", STARCASM: "StARCASM", Control: "Neutral practice"}[value || ""] || "Not assigned");
const date = (value: string) => new Date(value).toLocaleString();

export function WorkflowGuide() {
  return <section className="panel wf-guide"><p className="eyebrow">The whole process</p><h2>How the study is managed</h2>
    <ol>{[
      ["Screen & review", "The applicant completes the short screening form. Staff review eligibility and selection in Recruitment."],
      ["Enroll & provide access", "Staff create a coded participant record and link a login in Participants. The participant completes the pre-test before practice."],
      ["Assign & practise", "An authorised coordinator assigns the demo group. The participant follows the assigned activity and records three demo sessions."],
      ["Post-test & review", "The participant completes a different sample test. Staff review completion, missing results, session reports, and paired scores in Results."],
    ].map(([title, description], i) => <li key={title}><span>{i + 1}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
    <details><summary>What is recorded, and what still needs approval?</summary><p>The API checks the participant account and activity order. The database stores each submitted response with its participant code, form version, and submission time. Repeated submissions cannot overwrite a result. Only authorised research staff can see the study dashboard.</p><p>This prototype uses fictional applicants, two four-item sample tests, and three self-reported sessions. Test equivalence, clinical criteria, consent, study schedule, allocation rules, and instruments need research approval before real recruitment. External bot conversations are not imported; session duration and completion are reported by the participant. There is no continuous monitoring or automated clinical decision.</p></details>
  </section>;
}

export function StudyDashboard({results = false, onRecruitment, onParticipants}: {results?: boolean; onRecruitment: () => void; onParticipants: () => void}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  async function load() { setBusy(true); setError(""); try {setData(await request<Dashboard>("/api/study-workflow/dashboard"));} catch(e) {setError(e instanceof Error ? e.message : "Unable to load study progress.");} finally {setBusy(false);} }
  useEffect(() => {void load();}, []);
  const rows = (data?.participants || []).filter(r => r.participant_code.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "review" ? r.needs_review : filter === "access" ? !r.account_linked : r.next_stage === filter)));
  function exportCsv() {
    if (!data) return;
    const quote = (v: unknown) => `"${String(v ?? "").replaceAll('"','""')}"`;
    const lines = [["participant_code", "condition", "next_step", "sessions_reported", "self_reported_minutes", "pre_correct", "pre_skipped", "post_correct", "post_skipped", "paired_change", "comfort_review", "instrument_version"], ...rows.map(r => [r.participant_code, group(r.condition), data.labels[r.next_stage], r.completed_stages.filter(s=>s.startsWith("session-")).length, r.session_minutes, r.scores?.pre?.correct, r.scores?.pre?.skipped, r.scores?.post?.correct, r.scores?.post?.skipped, r.scores?.pre && r.scores?.post ? r.scores.post.correct-r.scores.pre.correct : "", r.needs_review, data.version])];
    const url=URL.createObjectURL(new Blob([lines.map(line=>line.map(quote).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="synthetic-study-progress.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="wf"><header className="wf-header"><div><p className="eyebrow">StARCASM & DANG · Study prototype</p><h1>{results ? "Study results" : "Study overview"}</h1><p>{results ? "Completion and sample-test results, with missing records kept visible." : "A clear view of recruitment and each participant’s next step."}</p></div><button onClick={()=>void load()} disabled={busy}>{busy?"Refreshing…":"Refresh"}</button></header>
    <p className="wf-note">Synthetic demonstration only. Sample scores are not clinical outcomes.</p>
    {error && <div className="alert error" role="alert">{error} <button onClick={()=>void load()}>Try again</button></div>}
    {!data && !error && <p role="status">Loading study progress…</p>}
    {data && <>
      <div className="wf-metrics">{[["Applications",data.counts.applications],["Need screening review",data.counts.needs_review],["Enrolled",data.counts.enrolled],["Pre-tests saved",data.counts.pre_completed],["Post-tests saved",data.counts.post_completed]].map(([label,n])=><article key={label}><span>{label}</span><strong>{n}</strong></article>)}</div>
      {!results && <section className="panel wf-next"><div><h2>Next actions</h2><p>{data.counts.needs_review} applications need review. {data.participants.filter(p=>!p.account_linked).length} enrolled participants need login access.</p>{data.counts.comfort_review>0 && <p>{data.counts.comfort_review} participants reported a tiring or upsetting session. Open the response details for staff review.</p>}</div><div className="wf-actions"><button className="primary" onClick={onRecruitment}>Review applications</button><button onClick={onParticipants}>Manage participants</button></div></section>}
      {results && <section className="panel"><h2>Paired sample-test scores</h2><p><strong>{data.paired.n}</strong> participants have both tests. Mean change: <strong>{data.paired.mean_change === null ? "Not available" : `${data.paired.mean_change > 0 ? "+" : ""}${data.paired.mean_change} / 4`}</strong>.</p><p className="muted">Unpaired records are excluded from this mean. Skips are shown separately. These illustrative forms have not been validated as equivalent; the difference does not establish improvement.</p><div className="wf-bars" aria-label="Study completion counts">{[["Pre-test",data.counts.pre_completed],["Post-test",data.counts.post_completed]].map(([label,n])=><div key={label}><span>{label}</span><progress max={Math.max(data.counts.enrolled,1)} value={Number(n)} /><b>{n} / {data.counts.enrolled}</b></div>)}</div></section>}
      <section className="panel"><div className="wf-header"><div><h2>Participant progress</h2><p>Use participant codes to find records. Open a row for saved responses.</p></div><button disabled={!rows.length} onClick={exportCsv}>Export shown rows (CSV)</button></div>
        <div className="wf-filters"><label>Find participant<input placeholder="Participant code" value={search} onChange={e=>setSearch(e.target.value)} /></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All participants</option><option value="access">Needs login access</option><option value="pre">Needs pre-test</option><option value="allocation">Needs group assignment</option><option value="session-1">Needs session 1</option><option value="session-2">Needs session 2</option><option value="session-3">Needs session 3</option><option value="post">Needs post-test</option><option value="complete">Complete</option><option value="review">Comfort review</option></select></label></div>
        {!rows.length && <div className="wf-empty"><h3>{data.participants.length ? "No matching participants" : "No participants enrolled yet"}</h3><p>{data.participants.length ? "Try a different code or filter." : "Start with a fictional application, then review and enroll it in Recruitment."}</p>{!data.participants.length && <button onClick={onRecruitment}>Open recruitment</button>}</div>}
        <div className="wf-table-scroll"><table className="wf-table"><thead><tr><th>Participant</th><th>Group</th><th>Next step</th><th>Sessions</th><th>Pre / 4</th><th>Post / 4</th><th>Record</th></tr></thead><tbody>{rows.map(r=><tr key={r.participant_code}><td><strong>{r.participant_code}</strong>{!r.account_linked && <small>Login not linked</small>}</td><td>{group(r.condition)}</td><td><span className={`wf-badge ${r.next_stage === "complete"?"done":""}`}>{data.labels[r.next_stage]}</span>{r.needs_review && <small>Comfort review needed</small>}</td><td>{r.completed_stages.filter(s=>s.startsWith("session-")).length} / 3</td><td>{r.scores?.pre ? `${r.scores.pre.correct} (${r.scores.pre.skipped} skipped)` : "Missing"}</td><td>{r.scores?.post ? `${r.scores.post.correct} (${r.scores.post.skipped} skipped)` : "Missing"}</td><td><details><summary>Details</summary><p>{r.session_minutes} minutes reported</p>{r.observations.map(o=><div className="wf-record" key={o.stage}><b>{data.labels[o.stage]}</b><small>{date(o.recorded_at)}</small><small>{o.version}</small><div>{o.items?.length ? o.items.map((item,i)=><p key={i}><b>{i+1}. {item.prompt}</b><br/>Response: {item.answer}<br/><small>Sample reference: {item.reference}</small></p>) : <p>Minutes: {String(o.response?.minutes ?? "—")}<br/>Help: {String(o.response?.assistance ?? "—")}<br/>Comfort: {String(o.response?.comfort ?? "—").replaceAll("_", " ")}</p>}</div></div>)}{!r.observations.length && <p>No activities submitted.</p>}</details></td></tr>)}</tbody></table></div>
      </section>
    </>}
    {!results && <WorkflowGuide />}
  </div>;
}

export function ParticipantStudy() {
  const [data,setData]=useState<Progress|null>(null);
  const [error,setError]=useState("");const [saved,setSaved]=useState("");const [busy,setBusy]=useState(false);
  const [answers,setAnswers]=useState<Record<number,number>>({});const [confirmed,setConfirmed]=useState(false);
  const [minutes,setMinutes]=useState("");const [assistance,setAssistance]=useState("");const [comfort,setComfort]=useState("");
  async function load(){setError("");try{setData(await request<Progress>("/api/study-workflow/me"));}catch(e){setError(e instanceof Error?e.message:"Unable to load the study.");}}
  useEffect(()=>{void load();},[]);
  async function submit(event:FormEvent){event.preventDefault();if(!data||busy)return;setBusy(true);setError("");setSaved("");try{
    const payload=data.questions.length ? {answers:data.questions.map((_,i)=>answers[i])} : {minutes:Number(minutes),assistance,comfort};
    await request(`/api/study-workflow/me/${data.next_stage}`,{method:"POST",body:JSON.stringify({version:data.version,confirmed,...payload})});
    setSaved(`${data.labels[data.next_stage]} saved.`);setAnswers({});setConfirmed(false);setMinutes("");setAssistance("");setComfort("");await load();
  }catch(e){setError(e instanceof Error?e.message:"Unable to save. Please try again.");}finally{setBusy(false);}}
  const stage=data?.next_stage || "";
  const botUrl=data?.condition === "STARCASM" ? "https://starcasm-research-demo-tmlee10.onrender.com/" : "https://humor-research-demo-tmlee10.onrender.com/";
  return <div className="wf wf-participant"><p className="eyebrow">StARCASM & DANG</p><h1>My study</h1><p>One step at a time. A session can be paused by leaving the page; unsubmitted answers are not saved.</p><p className="wf-note">Prototype walkthrough · Fictional responses only · No clinical scoring</p>
    {saved && <p className="wf-success" role="status">{saved}</p>}{error && <div className="alert error" role="alert">{error}<button onClick={()=>void load()}>Refresh</button></div>}
    {!data&&!error&&<p role="status">Loading the next step…</p>}
    {data&&<><div className="wf-header"><p>Participant <strong>{data.participant_code}</strong></p><span className="wf-badge">{group(data.condition)}</span></div><ol className="wf-steps">{data.stages.map((s,i)=><li key={s} className={data.completed_stages.includes(s)?"done":s===stage?"current":""} aria-current={s===stage?"step":undefined}><span>{data.completed_stages.includes(s)?"✓":i+1}</span>{data.labels[s]}</li>)}</ol>
    {stage === "complete" ? <section className="panel"><h2>All demo steps are complete</h2><p>The responses have been saved for staff review. Thank you for trying the study workflow.</p></section> : stage === "allocation" || stage === "inactive" ? <section className="panel"><h2>{data.labels[stage]}</h2><p>{stage === "allocation" ? "The pre-test is saved. The coordinator needs to assign a demo group before practice can begin." : "Contact the study coordinator through the agreed study contact channel before continuing."}</p><button onClick={()=>void load()}>Check for updates</button></section> : <form className="panel wf-form" onSubmit={submit} key={stage}><p className="eyebrow">Current step</p><h2>{data.labels[stage]}</h2>
      {data.questions.length>0 ? <><p>Choose the most likely meaning. “Not sure / skip” is always available. Answers are saved together on submission; no correctness feedback is given.</p>{data.questions.map((q,i)=><fieldset key={`${stage}-${i}`}><legend>{i+1}. {q.prompt}</legend>{q.options.map((option,j)=><label className="wf-choice" key={option}><input type="radio" required name={`q-${i}`} checked={answers[i]===j} onChange={()=>setAnswers({...answers,[i]:j})}/><span>{option}</span></label>)}</fieldset>)}</> : <>
        <p>Complete the assigned demonstration activity, then record the session below. Three sessions demonstrate the workflow; the real study schedule still needs approval.</p>
        {data.condition === "Control" ? <div className="wf-note"><h3>Neutral practice</h3><p>Read: “The library opens at 9 a.m. and closes at 6 p.m. A book is due on Friday.” Restate the opening time, closing time, and due day in plain words. No sarcasm or humor interpretation is required.</p></div> : <div className="wf-note"><h3>{group(data.condition)} activity</h3><p>Open the assigned bot and try the short examples provided by the coordinator. Return here to record the session. The bot opens separately and may need the reviewer login.</p><a className="wf-link" href={botUrl} target="_blank" rel="noreferrer">Open {group(data.condition)} ↗</a></div>}
        <p className="muted">This is a self-reported session log. The website does not verify time in the bot or import the conversation.</p>
        <label>Time spent (minutes)<input type="number" min="1" max="180" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
        <label>Help received<select required value={assistance} onChange={e=>setAssistance(e.target.value)}><option value="">Choose an answer</option><option value="none">No help</option><option value="some">Some help</option><option value="substantial">Substantial help</option></select></label>
        <label>How did the session feel?<select required value={comfort} onChange={e=>setComfort(e.target.value)}><option value="">Choose an answer</option><option value="comfortable">Comfortable</option><option value="tiring">Tiring</option><option value="upsetting">Upsetting</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><p>If an activity feels upsetting, stop and contact the coordinator through the agreed contact channel. Staff do not monitor this screen continuously.</p>
      </>}
      <label className="wf-choice"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>This is a fictional demo response. Submit this completed step for the prototype.</span></label><button className="primary" disabled={busy}>{busy?"Saving…":`Submit ${data.labels[stage].toLowerCase()}`}</button><p className="muted">Submitted responses are retained and cannot be edited here.</p>
    </form>}
    <details className="panel"><summary>Saved activities ({data.observations.length})</summary>{data.observations.map(o=><p key={o.stage}>{data.labels[o.stage]} · {date(o.recorded_at)}</p>)}{!data.observations.length&&<p>No activities submitted yet.</p>}</details></>}
  </div>;
}

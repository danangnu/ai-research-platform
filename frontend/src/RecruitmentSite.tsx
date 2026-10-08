import { FormEvent, useEffect, useRef, useState } from "react";
import { recruitmentApi, RecruitmentPublicInfo, RecruitmentReceipt, RecruitmentStatus } from "./api";
import "./recruitment.css";

type Route = "#home" | "#apply" | "#status";
const questions = [
  ["demo_online_access", "Access to the online activities", "Can the fictional applicant access the online study environment?"],
  ["demo_instruction_language", "Understanding the instructions", "Can the fictional applicant follow instructions in English?"],
  ["demo_schedule_availability", "Availability for sessions", "Can the fictional applicant attend scheduled activities?"],
] as const;
const stages: Record<string, string> = {
  submitted: "Application received", under_review: "Under review", needs_review: "Further review needed",
  eligible: "Screening complete", ineligible: "Not eligible", selected: "Selected", waitlisted: "Waitlisted",
  not_selected: "Not selected", enrolled: "Enrolled", account_linked: "Login access ready", withdrawn: "Withdrawn",
};
const empty = { preferred_name: "", contact_email: "", site_id: "", recruitment_source: "", demo_online_access: "", demo_instruction_language: "", demo_schedule_availability: "" };

export default function RecruitmentSite({ route, navigate, onSignIn }: {
  route: Route; navigate: (route: Route) => void; onSignIn: () => void;
}) {
  const [info, setInfo] = useState<RecruitmentPublicInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [form, setForm] = useState(empty);
  const [step, setStep] = useState(0);
  const [informedConsent, setInformedConsent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<RecruitmentReceipt | null>(null);
  const [reference, setReference] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [result, setResult] = useState<RecruitmentStatus | null>(null);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let current = true;
    setLoadError("");
    recruitmentApi.publicInfo().then(data => { if (current) { setInfo(data); const code=new URLSearchParams(window.location.search).get("clinic"); const site=data.sites.find(s=>s.code===code); if(site)setForm(f=>({...f,site_id:site.id})); } })
      .catch(err => { if (current) setLoadError(err.message || "Unable to connect to the recruitment service."); });
    return () => { current = false; };
  }, [retry]);
  useEffect(() => { heading.current?.focus(); setError(""); setConfirmWithdrawal(false); }, [route, step]);

  function update(name: keyof typeof empty, value: string) {
    setForm(previous => ({ ...previous, [name]: value }));
  }
  function example() {
    setForm({ ...empty, preferred_name: "Demo Applicant", contact_email: `demo.${crypto.randomUUID().slice(0, 8)}@example.com`, recruitment_source: "Website demo", demo_online_access: "true", demo_instruction_language: "true", demo_schedule_availability: "true" });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 0 && !informedConsent) { setError("Accept the draft demonstration consent to continue."); return; }
    if (step < 3) { setStep(step + 1); return; }
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const record = await recruitmentApi.submitApplication({
        preferred_name: form.preferred_name.trim(), contact_email: form.contact_email.trim(),
        site_id: form.site_id || null, recruitment_source: form.recruitment_source,
        consent_to_screen: consent, privacy_acknowledged: privacy,
        informed_consent_accepted: informedConsent, informed_consent_version: info?.informed_consent.version,
        screening_answers: Object.fromEntries(questions.map(([key]) => [key, form[key] === "true"])),
      });
      setReceipt(record); setReference(record.reference_code); setAccessKey(record.access_token);
      setForm(empty); setConsent(false); setPrivacy(false); setInformedConsent(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Submission failed. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  function downloadReceipt() {
    if (!receipt) return;
    const text = `SYNTHETIC RECRUITMENT DEMO\nReference: ${receipt.reference_code}\nPrivate access key: ${receipt.access_token}\nStatus page: ${window.location.origin}${window.location.pathname}#status\n\nKeep this key private. No email was sent. Submission is not enrollment.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `${receipt.reference_code}-receipt.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function checkStatus(event?: FormEvent, withdraw = false) {
    event?.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setResult(null);
    try {
      const payload = { reference_code: reference.trim(), access_token: accessKey.trim() };
      setResult(await (withdraw ? recruitmentApi.withdraw(payload) : recruitmentApi.status(payload)));
      setConfirmWithdrawal(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to retrieve application status."); }
    finally { pending.current = false; setBusy(false); }
  }
  const open = Boolean(info?.recruitment_open && info.demo_mode);
  return <div className="recruit-site">
    <a className="recruit-skip" href="#recruit-main" onClick={e => { e.preventDefault(); heading.current?.focus(); }}>Skip to content</a>
    <div className="recruit-notice"><b>DEMONSTRATION</b><span>Synthetic applications only · Live study recruitment is not open.</span></div>
    <header className="recruit-header">
      <button className="recruit-brand" onClick={() => navigate("#home")} aria-label="Research recruitment home"><span className="recruit-mark">AR</span><span>AI Research<small>Study recruitment</small></span></button>
      <nav aria-label="Recruitment navigation">
        <button aria-current={route === "#home" ? "page" : undefined} onClick={() => navigate("#home")}>About the study</button>
        <button aria-current={route === "#status" ? "page" : undefined} onClick={() => navigate("#status")}>Application status</button>
        <button onClick={() => { window.location.href = "/digit-span.html"; }}>Digit Span game</button>
        <button onClick={() => { window.location.href = "/committee-demo.html"; }}>Committee demo</button>
        <button className="recruit-outline" onClick={onSignIn}>Staff & participant sign in <span aria-hidden="true">↗</span></button>
      </nav>
    </header>
    <main id="recruit-main" className="recruit-main">
      {route === "#home" && <>
        <section className="recruit-hero">
          <div>
            <p className="recruit-kicker">StARCASM + DANG</p>
            <h1 tabIndex={-1} ref={heading}>A conversation starts with understanding.</h1>
            <p className="recruit-lead">Explore the recruitment journey for research on sarcasm, humor, and social communication.</p>
            <p>This website connects screening, staff review, enrollment, pre-test, demo sessions, and post-test. Use a fictional identity to try the complete process.</p>
            <div className="recruit-actions"><button className="recruit-primary" disabled={!open} onClick={() => navigate("#apply")}>Start a demo application <span aria-hidden="true">→</span></button><button className="recruit-text" onClick={() => navigate("#status")}>Already applied?</button></div>
            <p className="recruit-caption">Includes a draft online consent step. No approved research consent is collected.</p>
          </div>
          <aside className="recruit-preview" aria-label="Two research tools">
            <div className="recruit-preview-top"><span>Two ways to explore meaning</span><span aria-hidden="true">✳</span></div>
            <article><span className="recruit-chip">01 / StARCASM</span><h2>Beyond the literal.</h2><p>Sarcasm and contextual meaning: when words and intention may differ.</p><div className="recruit-bubble">“Wonderful, another meeting.”</div><span className="recruit-caption">What could the speaker mean?</span></article>
            <article><span className="recruit-chip">02 / DANG</span><h2>A different reading.</h2><p>Humor, wordplay, and the unexpected connections behind a joke.</p><div className="recruit-bubble">“The baker couldn't make enough dough.”</div><span className="recruit-caption">What makes the wording playful?</span></article>
            <p className="recruit-preview-foot">Research tools · Clinical benefit has not been established</p>
          </aside>
        </section>
        <section className="recruit-section" aria-labelledby="digit-span-title"><p className="recruit-kicker">Memory game</p><h2 id="digit-span-title">Try Digit Span.</h2><p>Watch a sequence of numbers, then recall them forwards or backwards. Choose your sequence length and speed.</p><p className="recruit-caption">For practice and demonstration. Game scores are kept only for this page session and are not saved as study results.</p><button className="recruit-primary" onClick={() => { window.location.href = "/digit-span.html"; }}>Play Digit Span <span aria-hidden="true">→</span></button></section>
        <section className="recruit-section" aria-labelledby="journey-title"><p className="recruit-kicker">The study journey</p><h2 id="journey-title">From screening to study review.</h2><div className="recruit-journey">
          {[["01", "Apply", "Enter a demo alias, contact address, and screening answers."], ["02", "Review", "Staff review the application and record a selection decision."], ["03", "Enroll", "Selected applicants receive a separate participant record."], ["04", "Access", "Staff link a login for the pre-test, three demo sessions, and post-test."]].map(([n,t,d]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}
        </div></section>
        <section className="recruit-faq recruit-section"><div><p className="recruit-kicker">Before starting</p><h2>A few things to know.</h2><p>The demo shows the workflow. Clinical eligibility, session schedules, and approved study materials still need to be confirmed by the research team.</p></div><div>
          <details><summary>Is this enrollment in a real study?</summary><p>No. This is a demonstration using fictional information. An application alone does not create a participant record or assign a study group.</p></details>
          <details><summary>What information should be entered?</summary><p>A made-up alias and synthetic email address, such as demo@example.com. Do not enter names, diagnoses, health records, or other real personal information.</p></details>
          <details><summary>How can an application be checked?</summary><p>After submission, save the receipt containing a reference and private access key. Both are needed on the Application status page. This demo does not send email.</p></details>
          <details><summary>Can an application be withdrawn?</summary><p>Before enrollment, use the private status page to withdraw. The workflow record is retained. After enrollment, contact the coordinator through the channel supplied by the research team.</p></details>
          <details><summary>Can the bots be tried separately?</summary><p>The <a href="https://starcasm-research-demo-tmlee10.onrender.com" target="_blank" rel="noreferrer">StARCASM demo</a> and <a href="https://humor-research-demo-tmlee10.onrender.com" target="_blank" rel="noreferrer">DANG demo</a> require separate reviewer credentials. These demonstrations are not assigned study sessions.</p></details>
        </div></section>
      </>}
      {loadError && <div className="recruit-error" role="alert"><strong>Recruitment service unavailable</strong><p>{loadError}</p><button onClick={() => setRetry(retry + 1)}>Retry connection</button></div>}
      {!info && !loadError && <p role="status">Connecting to the recruitment service…</p>}
      {info && !open && route !== "#status" && <div className="recruit-callout"><strong>Application intake is closed.</strong><p>The demo form becomes available only when synthetic intake is enabled by the administrator.</p></div>}
      {route === "#apply" && <>
        <div className="recruit-page-title"><p className="recruit-kicker">Try the applicant journey</p><h1 ref={heading} tabIndex={-1}>{receipt ? "Application received." : "Demo application"}</h1><p>{receipt ? "Keep the receipt to check progress later." : "Use fictional details. Answers demonstrate screening and do not determine eligibility automatically."}</p></div>
        {receipt ? <section className="recruit-card recruit-receipt" aria-live="polite">
          <span className="recruit-success">✓ Submitted successfully</span><h2>{receipt.reference_code}</h2><p>Submission is not enrollment. Staff review and selection happen next.</p>
          <label>Private access key<input readOnly value={receipt.access_token} aria-label="Private access key" /></label>
          <p className="recruit-caption">The key is shown only in this receipt and is not emailed or saved in browser storage. Download it before leaving. Anyone with both the reference and key can check or withdraw this application before enrollment.</p>
          <div className="recruit-actions"><button className="recruit-primary" onClick={downloadReceipt}>Download receipt</button><button className="recruit-outline" onClick={() => { navigate("#status"); void checkStatus(); }}>Check application status</button></div>
        </section> : open && <div className="recruit-application-grid">
          <aside><ol className="recruit-steps">{["Online consent", "Contact details", "Screening questions", "Review & submit"].map((title, i) => <li key={title} aria-current={step === i ? "step" : undefined}><span>{i < step ? "✓" : i + 1}</span><div><b>{title}</b><small>{i === step ? "Current step" : i < step ? "Complete" : "Up next"}</small></div></li>)}</ol><div className="recruit-callout"><b>For demonstration only</b><p>Use the example details to explore the form. Final clinical criteria and approved consent are not configured.</p><button className="recruit-text" type="button" disabled={busy} onClick={example}>Fill fictional example</button></div></aside>
          <form className="recruit-card recruit-form" onSubmit={submit}>
            <p className="recruit-kicker">Step {step + 1} of 4</p><h2>{["Online informed consent", "A way to identify the application", "A few screening questions", "Check the application"][step]}</h2>
            {step === 0 && <><div className="recruit-callout"><b>Draft for committee review — not approved research consent</b><p style={{whiteSpace:'pre-line'}}>{info?.informed_consent.text}</p><small>Version: {info?.informed_consent.version}</small></div><label className="recruit-checkbox"><input type="checkbox" required checked={informedConsent} onChange={e=>setInformedConsent(e.target.checked)} /><span>I have read the draft and agree to continue this fictional demonstration.</span></label><button type="button" className="recruit-outline" onClick={()=>{setInformedConsent(false);navigate('#home');}}>Decline and leave</button></>}
            {step === 1 && <>
              <label>Demo alias<input name="preferred_name" autoComplete="off" minLength={2} maxLength={120} required value={form.preferred_name} onChange={e => update("preferred_name", e.target.value)} /></label>
              <label>Synthetic contact email<input name="contact_email" type="email" autoComplete="off" maxLength={255} required value={form.contact_email} onChange={e => update("contact_email", e.target.value)} placeholder="demo@example.com" /></label>
              <label>Study site <small>(optional)</small><select name="site_id" value={form.site_id} onChange={e => update("site_id", e.target.value)}><option value="">No preference / not listed</option>{info?.sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
              <label>How was the demo found? <small>(optional)</small><input name="recruitment_source" maxLength={120} value={form.recruitment_source} onChange={e => update("recruitment_source", e.target.value)} /></label>
            </>}
            {step === 2 && questions.map(([key,title,question]) => <fieldset key={key}><legend>{title}</legend><p>{question}</p><div className="recruit-options">{[["true", "Yes"], ["false", "No"]].map(([value,label]) => <label key={value}><input type="radio" required name={key} value={value} checked={form[key] === value} onChange={e => update(key,e.target.value)} />{label}</label>)}</div></fieldset>)}
            {step === 3 && <>
              <dl className="recruit-summary"><div><dt>Demo alias</dt><dd>{form.preferred_name}</dd></div><div><dt>Contact email</dt><dd>{form.contact_email}</dd></div><div><dt>Site</dt><dd>{info?.sites.find(s => s.id === form.site_id)?.name || "No preference"}</dd></div>{questions.map(([key,title]) => <div key={key}><dt>{title}</dt><dd>{form[key] === "true" ? "Yes" : "No"}</dd></div>)}</dl>
              <div className="recruit-callout"><b>Demo screening acknowledgement</b><p>The application and answers are stored for authorised staff to review. The form does not provide clinical advice, establish eligibility, or obtain approved research consent.</p><small>Statement version: {info?.consent_version}</small></div>
              <label className="recruit-checkbox"><input type="checkbox" name="consent_to_screen" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>I agree to submit this fictional application for demo screening.</span></label>
              <label className="recruit-checkbox"><input type="checkbox" name="privacy_acknowledged" required checked={privacy} onChange={e => setPrivacy(e.target.checked)} /><span>All details are synthetic. No real personal or health information has been entered.</span></label>
            </>}
            {error && <div className="recruit-error" role="alert">{error}</div>}
            <div className="recruit-form-footer">{step > 0 && <button className="recruit-outline" type="button" disabled={busy} onClick={() => setStep(step-1)}>Back</button>}<button className="recruit-primary" disabled={busy}>{busy ? "Submitting…" : step === 3 ? "Submit demo application" : "Continue"}</button></div>
          </form>
        </div>}
      </>}
      {route === "#status" && <>
        <div className="recruit-page-title"><p className="recruit-kicker">A private progress check</p><h1 ref={heading} tabIndex={-1}>Application status</h1><p>Enter the reference and access key from the downloaded receipt.</p></div>
        <div className="recruit-status-grid"><form className="recruit-card recruit-form" onSubmit={checkStatus}>
          <label>Application reference<input name="reference_code" required maxLength={32} placeholder="APP-…" value={reference} onChange={e => { setReference(e.target.value); setResult(null); setConfirmWithdrawal(false); }} /></label>
          <label>Private access key<input name="access_token" type="password" autoComplete="off" required minLength={32} maxLength={128} value={accessKey} onChange={e => { setAccessKey(e.target.value); setResult(null); setConfirmWithdrawal(false); }} /></label>
          <button className="recruit-primary" disabled={busy}>{busy ? "Checking…" : "Check status"}</button>
          <p className="recruit-caption">The receipt key is separate from a participant login. Older applications without a key require staff assistance. Lost keys cannot be recovered through this page.</p>
          {error && <div className="recruit-error" role="alert">{error}</div>}
        </form><section className="recruit-card recruit-status-result" aria-live="polite">{result ? <>
          <span className="recruit-chip">{result.reference_code}</span><h2>{stages[result.stage] || result.stage}</h2><p>{result.next_step}</p><p className="recruit-caption">Submitted {new Date(result.submitted_at).toLocaleString()}</p>
          {result.stage === "account_linked" && <button className="recruit-primary" onClick={onSignIn}>Participant sign in</button>}
          {result.can_withdraw && (!confirmWithdrawal ? <button className="recruit-text" disabled={busy} onClick={() => setConfirmWithdrawal(true)}>Withdraw this application</button> : <div className="recruit-callout"><b>Withdraw from demo screening?</b><p>Staff will no longer be able to enroll this application. The existing record is retained.</p><div className="recruit-actions"><button className="recruit-danger" disabled={busy} onClick={() => void checkStatus(undefined, true)}>Confirm withdrawal</button><button className="recruit-outline" disabled={busy} onClick={() => setConfirmWithdrawal(false)}>Keep application</button></div></div>)}
        </> : <><span className="recruit-kicker">Progress, without a staff account</span><h2>Keep the receipt close.</h2><p>Review, selection, and enrollment updates appear here. Private staff notes and other applications are never included.</p></>}</section></div>
      </>}
    </main>
    <footer className="recruit-footer"><span><b>AI Research</b> · StARCASM & DANG</span><span>Demonstration only · No live clinical recruitment</span></footer>
  </div>;
}
import { createElement, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import rawSource from './screening-draft.json';
import feedbackSource from './participant-feedback.json';
import './assessment-draft.css';

type Answers = Record<string, string | string[]>;
type Part = {kind:string; label:string; options?:string[]; when_yes?:boolean; other_for?:number};
const source: {version:string; source:string; source_sha256:string; items:{number:number; section:string; prompt:string; parts:Part[]}[]; staff_groups:Part[]} = rawSource;
type Result = {id:string; participant:string; visit:string; instrument:string; form:string; language:string; date:string; assessor:string; status:string; total:string; maximum:string; adjustment:string; guide:string; secondsA:string; secondsB:string; statusA:string; statusB:string; errorsA:string; errorsB:string; notes:string};
type Session = {id:string; participant:string; group:string; prompt:string; reply:string; response:string; at:string; simulated:boolean};
type Notice = {text:string; tone:'info'|'success'|'error'};

const emptyResult = (participant:string):Result => ({id:'',participant,visit:'Baseline',instrument:'MoCA',form:'MoCA 8.3 English (2018)',language:'English',date:'',assessor:'',status:'',total:'',maximum:'',adjustment:'',guide:'',secondsA:'',secondsB:'',statusA:'',statusB:'',errorsA:'',errorsB:'',notes:''});
const isPresent = (v:unknown) => Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== '';
function download(value:unknown) {
  const a=document.createElement('a'), url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  a.href=url; a.download='assessment-review-draft.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** "2027-01-08" → "8 Jan 2027" (calendar date, no time-zone shift). */
const friendlyDate = (iso:string) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : '';
const shortTime = (iso:string) => new Date(iso).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

const TABS = [
  ['overview','Study walkthrough'],
  ['screening','Screening questionnaire'],
  ['staff','Staff eligibility review'],
  ['results','Test result entry'],
  ['interaction','Bot interaction'],
  ['feedback','Participant feedback'],
  ['decisions','Provisional choices'],
] as const;
type TabId = typeof TABS[number][0];

const scaleEnds = (max:number) => max === 7 ? ['Strongly disagree','Strongly agree'] : ['Disagree','Agree'];

/** Heading whose level follows the component's position in the page (h1 standalone, h2 when embedded). */
function Heading({level, className, children}:{level:number; className?:string; children:ReactNode}) {
  return createElement(`h${Math.min(level, 6)}`, {className}, children);
}

export function AssessmentDraft({headingLevel = 2}:{headingLevel?:1|2} = {}) {
 const [tab,setTab]=useState<TabId>('overview'),[answers,setAnswers]=useState<Answers>({}),[participant,setParticipant]=useState('');
 const [editingCode,setEditingCode]=useState(true);
 const [completedBy,setCompletedBy]=useState(''),[site,setSite]=useState(''),[screenDate,setScreenDate]=useState('');
 const [staff,setStaff]=useState<Answers>({}),[result,setResult]=useState<Result>(emptyResult('')),[results,setResults]=useState<Result[]>([]);
 const [notice,setNoticeState]=useState<Notice|null>(null);
 const [feedback,setFeedback]=useState<Record<string,string>>({}),[feedbackNotes,setFeedbackNotes]=useState('');
 const [ack,setAck]=useState(false),[group,setGroup]=useState('STARCASM'),[reply,setReply]=useState(''),[sessions,setSessions]=useState<Session[]>([]);
 const [startDate,setStartDate]=useState('2026-10-08');
 const [currentSection,setCurrentSection]=useState('');

 const codeInput=useRef<HTMLInputElement>(null), layoutRef=useRef<HTMLDivElement>(null), panelRef=useRef<HTMLDivElement>(null), tabRefs=useRef<Record<string,HTMLButtonElement|null>>({});
 const hTitle=headingLevel, hPanel=headingLevel+1, hSection=headingLevel+2, hItem=headingLevel+3;

 const setNotice=(text:string, tone:Notice['tone']='info')=>setNoticeState(text?{text,tone}:null);
 // Success/info messages clear themselves; errors stay until dismissed or the user moves on.
 useEffect(()=>{ if(!notice||notice.tone==='error')return; const t=setTimeout(()=>setNoticeState(null),7000); return ()=>clearTimeout(t); },[notice]);
 useEffect(()=>{ if(editingCode && participant.trim()) codeInput.current?.focus(); },[editingCode]);

 function needCode(text:string){ setEditingCode(true); setNotice(text,'error'); setTimeout(()=>{ codeInput.current?.focus(); codeInput.current?.scrollIntoView({block:'center',behavior:'smooth'}); },0); }

 function goTo(id:TabId, focusTab=false){
  setTab(id); setNoticeState(null);
  if(focusTab) tabRefs.current[id]?.focus();
  const top=layoutRef.current?.getBoundingClientRect().top ?? 0;
  if(top<0) layoutRef.current?.scrollIntoView({block:'start',behavior:'smooth'});
 }
 // Keep the active tab visible in the horizontally scrolling mobile strip.
 useEffect(()=>{ const el=tabRefs.current[tab], strip=el?.parentElement; if(!el||!strip||strip.scrollWidth<=strip.clientWidth)return; strip.scrollTo({left:el.offsetLeft-strip.clientWidth/2+el.clientWidth/2,behavior:'smooth'}); },[tab]);
 function onTabKey(e:KeyboardEvent<HTMLButtonElement>, index:number){
  const map:Record<string,number>={ArrowRight:index+1,ArrowDown:index+1,ArrowLeft:index-1,ArrowUp:index-1,Home:0,End:TABS.length-1};
  if(!(e.key in map))return; e.preventDefault();
  goTo(TABS[(map[e.key]+TABS.length)%TABS.length][0], true);
 }

 // Track which section heading is at the top of the screen for the progress bar.
 useEffect(()=>{
  if(tab!=='screening'&&tab!=='feedback'){setCurrentSection('');return;}
  let frame=0;
  const update=()=>{ frame=0; const heads=panelRef.current?.querySelectorAll<HTMLElement>('[data-section-title]')??[]; let name=heads[0]?.dataset.sectionTitle??''; heads.forEach(h=>{ if(h.getBoundingClientRect().top<140) name=h.dataset.sectionTitle??name; }); setCurrentSection(name); };
  const onScroll=()=>{ if(!frame) frame=requestAnimationFrame(update); };
  update(); window.addEventListener('scroll',onScroll,{passive:true});
  return ()=>{ window.removeEventListener('scroll',onScroll); if(frame) cancelAnimationFrame(frame); };
 },[tab]);

 const prompt = group==='STARCASM'?'A person says “Wonderful weather!” while standing in heavy rain. What might they mean?':group==='HumorBot'?'Why might “I used to be a baker, but I could not make enough dough” be amusing?':'Describe one everyday activity you enjoy.';
 const scriptedResponse=group==='STARCASM'?'This example may be sarcastic because the positive words contrast with the rainy situation.':group==='HumorBot'?'This example plays on two meanings of dough: bread mixture and money.':'Thank you. This neutral activity illustrates the control workflow.';
 const followUp=(()=>{if(!startDate)return '';const [y,m,d]=startDate.split('-').map(Number);const target=new Date(Date.UTC(y,m-1+3,1));target.setUTCDate(Math.min(d,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));return target.toISOString().slice(0,10);})();
 const plan={version:'committee-demo-v2',status:'provisional_committee_irb_review',baseline:['MoCA 8.3 English (2018)','Trail Making A/B - IowaTrailMaking.pdf'],follow_up:['SAGE Form 1 - US 2021'],follow_up_replaces_baseline_tests:true,feedback_respondent:'participant',duration:'three calendar months',start_date:startDate,illustrative_follow_up_date:followUp,session_frequency:'not finalized',scoring:'manual fictional result entry; no automated clinical scoring',digit_span:'separate demonstration game; excluded from cognitive change calculations'};
 function saveSession(){
  if(!participant.trim()){needCode('Enter a fictional participant code before recording a session.');return;}
  if(!ack){setNotice('Tick the acknowledgement above to confirm this is a fictional demonstration.','error');return;}
  if(!reply.trim()){setNotice('Type a sample participant reply first.','error');return;}
  setSessions(v=>[...v,{id:crypto.randomUUID(),participant:participant.trim(),group,prompt,reply:reply.trim(),response:scriptedResponse,at:new Date().toISOString(),simulated:true}]);
  setReply('');setNotice('Scripted demonstration session recorded in this page. It is included in the JSON export.','success');
 }

 const put=(key:string,value:string|string[])=>setAnswers(a=>({...a,[key]:value}));
 const key=(n:number,i:number)=>`q${n}_${i}`;
 const q5=answers.q5_0;
 const shown=(n:number)=>n<6||n>17||q5==='Yes';
 function partShown(n:number,p:Part) {
  if(p.when_yes && answers[key(n,0)]!=='Yes') return false;
  if(p.other_for!==undefined) {const v=answers[key(n,p.other_for)]; return Array.isArray(v)?v.some(x=>x.startsWith('Other')):typeof v==='string'&&v.startsWith('Other');}
  return true;
 }
 const visibleQuestions=source.items.filter(q=>shown(q.number));
 const screeningAnswered=visibleQuestions.filter(q=>q.parts.some((p,i)=>p.kind!=='note'&&partShown(q.number,p)&&isPresent(answers[key(q.number,i)]))).length;
 const feedbackAnswered=feedbackSource.items.filter(q=>isPresent(feedback[q.id])).length;
 const tabMeta:Partial<Record<TabId,string>>={screening:`${screeningAnswered}/${visibleQuestions.length}`,feedback:`${feedbackAnswered}/${feedbackSource.items.length}`,results:results.length?String(results.length):'',interaction:sessions.length?String(sessions.length):''};

 function field(p:Part,id:string,value:string|string[]|undefined,change:(v:string|string[])=>void) {
  if(p.kind==='note')return <p key={id} className="draft-help">{p.label}</p>;
  if(p.kind==='multi')return <fieldset key={id}><legend>{p.label}</legend>{p.options!.map(o=><label className="draft-option" key={o}><input type="checkbox" checked={Array.isArray(value)&&value.includes(o)} onChange={e=>change(e.target.checked?[...(Array.isArray(value)?value:[]),o]:(Array.isArray(value)?value:[]).filter(x=>x!==o))}/><span>{o}</span></label>)}</fieldset>;
  return <label className="draft-field" key={id}>{p.label}{p.kind==='choice'?<select aria-label={id} value={typeof value==='string'?value:''} onChange={e=>change(e.target.value)}><option value="">Unanswered</option>{p.options!.map(o=><option key={o}>{o}</option>)}</select>:p.kind==='number'?<input aria-label={id} type="number" min="0" step="1" inputMode="numeric" value={typeof value==='string'?value:''} onChange={e=>change(e.target.value)}/>:<textarea aria-label={id} rows={2} value={typeof value==='string'?value:''} onChange={e=>change(e.target.value)}/>}</label>;
 }
 function exportDraft(){
  if(!participant.trim()){needCode('Enter a fictional participant code before export.');return;}
  for (const q of source.items) { if (!shown(q.number)) continue; for (const [i,p] of q.parts.entries()) { const v=answers[key(q.number,i)]; if(p.kind==='number' && isPresent(v) && (!Number.isInteger(Number(v)) || Number(v)<0)) {setNotice('Age fields must be nonnegative whole years or left unanswered.','error');return;} } }
  const responses=source.items.map(q=>({question:q.number,prompt:q.prompt,status:shown(q.number)?'recorded_or_unanswered':isPresent(q5)?'not_applicable':'routing_unanswered',fields:shown(q.number)?q.parts.filter(p=>p.kind!=='note').map(p=>{const i=q.parts.indexOf(p);return {id:key(q.number,i),label:p.label,status:partShown(q.number,p)?isPresent(answers[key(q.number,i)])?'answered':'unanswered':'not_applicable',value:partShown(q.number,p)?answers[key(q.number,i)]??null:null};}):[]}));
  download({schema_version:'assessment-review-v2',synthetic_only:true,protocol_status:'provisional_committee_irb_review',plan,demo_acknowledgement:ack,bot_sessions:sessions,participant_feedback:{participant_code:participant.trim(),respondent:'participant',source:feedbackSource.source,source_sha256:feedbackSource.source_sha256,version:feedbackSource.version,adaptation_status:feedbackSource.adaptation_status,responses:feedbackSource.items.map(q=>({...q,value:feedback[q.id]||null})),comments:feedbackNotes||null},exported_at:new Date().toISOString(),screening:{participant_code:participant.trim(),source_version:source.version,source_sha256:source.source_sha256,date:screenDate||null,completed_by:completedBy||null,site:site||null,responses,staff_review:staff},assessment_results:results,comparison:null});
  setNotice('Draft exported. Unanswered fields remain missing; no eligibility or cognitive change score is calculated.','success');
 }
 const edit=(name:keyof Result,value:string)=>setResult(r=>name==='instrument'?{...emptyResult(participant),instrument:value,visit:value==='SAGE'?'Three-month follow-up':'Baseline',form:value==='SAGE'?'SAGE Form 1 - US 2021':value==='Trail Making'?'Trail Making A/B - Iowa':'MoCA 8.3 English (2018)',guide:value==='Trail Making'?'IowaTrailMaking.pdf - provisional demo':value==='SAGE'?'Manual demo entry; scoring guide pending':''}:{...r,[name]:value});
 function resultField(label:string,name:keyof Result,options?:string[],type='text',required=false){
  return <label className="draft-field" key={name}>
   <span>{label}{required?<span className="draft-req" aria-hidden="true"> *</span>:<span className="draft-optional"> (optional)</span>}</span>
   {options?<select aria-label={label} required={required} value={result[name]} onChange={e=>edit(name,e.target.value)}><option value="">Select…</option>{options.map(x=><option key={x}>{x}</option>)}</select>:<input aria-label={label} required={required} type={type} min={type==='number'?'0':undefined} step={type==='number'?(name==='errorsA'||name==='errorsB'?'1':'any'):undefined} value={result[name]} onChange={e=>edit(name,e.target.value)}/>}
  </label>;
 }
 function likert(q:typeof feedbackSource.items[number]){
  const value=feedback[q.id]||'', set=(v:string)=>setFeedback(f=>({...f,[q.id]:v})), [low,high]=scaleEnds(q.maximum);
  return <fieldset className="likert" key={q.id} data-item={q.id}>
   <legend>{q.number}. {q.prompt}</legend>
   <div className="likert-row">
    <div className="likert-scale" style={{['--n' as string]:q.maximum}}>
     {Array.from({length:q.maximum},(_,n)=>{const v=String(n+1);return <label className={`likert-pill${value===v?' is-on':''}`} key={v}>
      <input type="radio" name={q.id} value={v} checked={value===v} onChange={()=>set(v)}/>
      <span aria-hidden="true">{v}</span><span className="sr-only">{v}{n===0?` (${low.toLowerCase()})`:n+1===q.maximum?` (${high.toLowerCase()})`:''}</span>
     </label>;})}
     <span className="likert-end" aria-hidden="true">{low}</span><span className="likert-end likert-end-high" aria-hidden="true">{high}</span>
    </div>
    <label className={`likert-pill likert-na${value==='not_applicable'?' is-on':''}`}><input type="radio" name={q.id} value="not_applicable" checked={value==='not_applicable'} onChange={()=>set('not_applicable')}/><span>N/A</span><span className="sr-only">Not applicable</span></label>
    {value&&<button type="button" className="draft-link" onClick={()=>set('')}>Clear<span className="sr-only"> answer to question {q.number}</span></button>}
   </div>
  </fieldset>;
 }
 function progressBar(label:string, done:number, total:number){
  return <div className="draft-progress" aria-hidden="true">
   <div className="draft-progress-text"><span className="draft-progress-section">{label}</span><span>{done} of {total} answered</span></div>
   <div className="draft-progress-track"><div style={{width:`${total?Math.round(done/total*100):0}%`}}/></div>
  </div>;
 }
 const tabIndex=TABS.findIndex(([id])=>id===tab), prev=TABS[tabIndex-1], next=TABS[tabIndex+1];
 const latest=sessions.length?sessions[sessions.length-1]:null, liveExchange=latest&&latest.group===group?latest:null;
 const ackBox=<label className="draft-option draft-ack"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>I understand this is a fictional demonstration, not study enrollment or consent.</span></label>;

 return <section className="assessment-draft">
 <header className="draft-header">
  <span className="draft-badge">Committee / IRB demonstration • Fictional data only</span>
  <Heading level={hTitle} className="draft-title">Cognitive bot study walkthrough</Heading>
  <p>Explore the proposed three-month study using provisional forms and fictional records. Entries stay in memory until exported and disappear when this page reloads. Nothing is sent to the study database.</p>
   {editingCode||!participant.trim()
   ?<label className="draft-field draft-code"><span>Fictional participant code<span className="draft-req" aria-hidden="true"> *</span> <span className="draft-optional">needed to record and export</span></span>
     <input ref={codeInput} aria-required="true" value={participant} onChange={e=>setParticipant(e.target.value)} onBlur={()=>{if(participant.trim()){setEditingCode(false);if(notice?.text.includes('participant code'))setNoticeState(null);}}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} placeholder="DEMO-001" autoComplete="off"/></label>
   :<div className="draft-field draft-code"><span>Fictional participant code</span>
     <div className="draft-chip"><span>Recording as <strong>{participant.trim()}</strong></span><button type="button" className="draft-link" onClick={()=>setEditingCode(true)}>Change<span className="sr-only"> participant code</span></button></div></div>}
 </header>

 <div className="draft-layout" ref={layoutRef}>
 <div className="draft-tabs" role="tablist" aria-label="Draft forms" aria-orientation="vertical">
  {TABS.map(([id,label],i)=><button type="button" role="tab" id={`draft-tab-${id}`} aria-controls="draft-panel" aria-selected={tab===id} tabIndex={tab===id?0:-1} key={id} ref={el=>{tabRefs.current[id]=el;}} onClick={()=>goTo(id)} onKeyDown={e=>onTabKey(e,i)}>
   <span className="draft-step" aria-hidden="true">{i+1}</span><span className="draft-tab-label">{label}</span>{tabMeta[id]&&<span className="draft-tab-meta" aria-hidden="true">{tabMeta[id]}</span>}
  </button>)}
 </div>

 <div className="draft-panel" role="tabpanel" id="draft-panel" aria-labelledby={`draft-tab-${tab}`} ref={panelRef}>
 {tab==='overview'&&<div>
 <Heading level={hPanel} className="draft-panel-title">Proposed participant journey</Heading>
 <ol className="demo-journey"><li><strong>Screening and consent</strong><p>Participant screening, staff eligibility review, and an approved consent process before enrollment. This page does not obtain research consent.</p></li><li><strong>Baseline assessment</strong><p>MoCA 8.3 and Trail Making A/B (Iowa instructions). Staff enter results from separately administered tests.</p></li><li><strong>Assigned study activities</strong><p>Illustrative STARCASM, HumorBot or control sessions over three months. Frequency and duration remain provisional.</p></li><li><strong>Follow-up assessment</strong><p>SAGE Form 1 replaces MoCA and Trail Making at follow-up. Scores stay separate by instrument.</p></li><li><strong>Participant feedback and export</strong><p>Participants rate their experience. Export screening, results, scripted session records and feedback together.</p></li></ol>
 <div className="draft-grid draft-dates"><label className="draft-field">Illustrative baseline date<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><div className="draft-followup"><span>Illustrative three-month follow-up</span>{followUp?<time dateTime={followUp}>{friendlyDate(followUp)}</time>:<strong>Choose a date</strong>}<span className="draft-help">Dates are for demonstration only.</span></div></div>
 {ackBox}
 <p><a href="/digit-span.html" target="_blank" rel="noreferrer">Open the existing Digit Span game</a> in a separate tab. Its game results are not part of this assessment export.</p>
 </div>}

 {tab==='screening'&&<div>
  {progressBar(currentSection||'Screening',screeningAnswered,visibleQuestions.length)}
  <Heading level={hPanel} className="draft-panel-title">Brain Injury and Cognitive Impairment Participant Screening Questionnaire</Heading>
  <p>Purpose: Preliminary screening of potential participants with a history of brain injury, neurological injury, or cognitive impairment.</p>
  <div className="draft-grid"><label className="draft-field">Screening date<input type="date" value={screenDate} onChange={e=>setScreenDate(e.target.value)}/></label><label className="draft-field">Completed by<select value={completedBy} onChange={e=>setCompletedBy(e.target.value)}><option value="">Unanswered</option>{['Participant','Caregiver/Family Member','Research Staff'].map(x=><option key={x}>{x}</option>)}</select></label><label className="draft-field">Screening site<input value={site} onChange={e=>setSite(e.target.value)}/></label></div>
  {source.items.map((q,index)=><div key={q.number}>{(index===0||source.items[index-1].section!==q.section)&&<div data-section-title={q.section}><Heading level={hSection} className="draft-section">{q.section}</Heading></div>}{shown(q.number)?<section className="draft-question"><Heading level={hItem} className="draft-item">{q.number}. {q.prompt}</Heading>{q.number===5&&<p className="draft-help">Answer Questions 6–17 only if Yes.</p>}{q.parts.map((p,i)=>partShown(q.number,p)?field(p,key(q.number,i),answers[key(q.number,i)],v=>put(key(q.number,i),v)):null)}</section>:q.number===6?<p className="draft-empty">Questions 6–17 are shown when Question 5 is Yes.</p>:null}</div>)}
 </div>}

 {tab==='staff'&&<div><Heading level={hPanel} className="draft-panel-title">Section G — Preliminary Research Eligibility</Heading><p className="draft-callout">Research staff only — do not complete as participant self-diagnosis. No automatic eligibility rules have been applied.</p>{source.staff_groups.map((p,i)=>field(p,`staff_${i}`,staff[`staff_${i}`],v=>setStaff(s=>({...s,[`staff_${i}`]:v}))))}{['Reason/comments','Screened by','Date'].map(label=>field({kind:'text',label},label,staff[label],v=>setStaff(s=>({...s,[label]:v}))))}</div>}

 {tab==='results'&&<div><Heading level={hPanel} className="draft-panel-title">Separate test result entry</Heading><p>Enter results from an assessment administered outside this draft. These are proposed record fields; they do not administer or score the tests. Choose the visit and exact form explicitly.</p>
 <form onSubmit={e=>{e.preventDefault();
  if(!participant.trim()){needCode('Enter a fictional participant code first.');return;}
  if((result.instrument==='SAGE') !== (result.visit==='Three-month follow-up')){setNotice('This provisional plan uses MoCA and Trail Making at baseline, and SAGE only at follow-up.','error');return;}
  if(result.instrument==='Trail Making' && ((result.status==='Completed' && (result.statusA!=='Completed'||result.statusB!=='Completed')) || (result.status==='Not administered' && (result.statusA!=='Not administered'||result.statusB!=='Not administered')) || (result.status==='Incomplete' && result.statusA==='Completed' && result.statusB==='Completed'))) {setNotice('Overall administration status must agree with the Part A and Part B statuses.','error');return;}
  if(result.instrument!=='Trail Making'&&result.status==='Completed'&&result.total!==''&&result.maximum!==''&&Number(result.total)>Number(result.maximum)){setNotice('The entered total exceeds the entered maximum.','error');return;}
  if(results.some(r=>r.participant===participant.trim()&&r.visit===result.visit&&r.instrument===result.instrument)){setNotice('A draft result already exists for this participant, visit and instrument. Remove it before replacing it.','error');return;}
  const r={...result,id:crypto.randomUUID(),participant:participant.trim()};
  if(r.instrument==='Trail Making'){r.total='';r.maximum='';r.adjustment='';if(r.statusA!=='Completed')r.secondsA='';if(r.statusB!=='Completed')r.secondsB='';}
  else {r.secondsA='';r.secondsB='';r.errorsA='';r.errorsB='';r.statusA='';r.statusB='';if(r.status!=='Completed'){r.total='';r.maximum='';r.adjustment='';}}
  setResults(s=>[...s,r]);setResult(emptyResult(participant));setNotice('Draft result added. It has not been saved to the study database.','success');
 }}>
 <p className="draft-help"><span className="draft-req" aria-hidden="true">*</span> Required field</p>
 <div className="draft-grid">
 {resultField('Instrument','instrument',['MoCA','Trail Making','SAGE'],'text',true)}{resultField('Visit','visit',result.instrument==='SAGE'?['Three-month follow-up']:['Baseline'],'text',true)}
 {resultField('Form / version','form',undefined,'text',true)}{resultField('Language','language',undefined,'text',true)}{resultField('Assessment date','date',undefined,'date',true)}{resultField('Assessor code','assessor',undefined,'text',true)}{resultField('Administration status','status',['Completed','Incomplete','Not administered'],'text',true)}{resultField('Administration / scoring guide reference','guide')}
 </div>
 {result.instrument==='Trail Making'?<div className="draft-grid">{(['A','B'] as const).map(p=><fieldset key={p}><legend>Trail Making Part {p}</legend>{resultField(`Part ${p} status`,`status${p}`,['Completed','Stopped','Not administered'],'text',true)}{result[`status${p}`]==='Completed'&&resultField(`Part ${p} completion time in seconds`,`seconds${p}`,undefined,'number',true)}{resultField(`Part ${p} error count`,`errors${p}`,undefined,'number')}</fieldset>)}</div>:result.status==='Completed'?<div className="draft-grid">{resultField('Recorded total','total',undefined,'number',true)}{resultField('Maximum entered by assessor','maximum',undefined,'number')}{resultField('Adjustments applied by assessor','adjustment')}</div>:<p className="draft-empty">Score fields appear when the administration status is Completed. No score is exported otherwise.</p>}
 {resultField('Notes / missingness or stopping reason','notes')}
 <button type="submit" className="draft-primary">Add draft result</button>
 </form>
 <Heading level={hSection} className="draft-section">Draft results ({results.length})</Heading>
 {results.length===0?<p className="draft-empty">No results yet. Fill in the form above and choose “Add draft result”.</p>:results.map(r=><div className="draft-record" key={r.id}><span><strong>{r.participant}</strong> · {r.visit} · {r.instrument} · {r.form} · {r.status}</span><button type="button" onClick={()=>setResults(s=>s.filter(x=>x.id!==r.id))}>Remove {r.instrument} {r.visit}</button></div>)}
 </div>}

 {tab==='interaction'&&<div><Heading level={hPanel} className="draft-panel-title">Illustrative bot interaction</Heading><p>This scripted example demonstrates the interaction screen and logging. It does not call a trained bot, assess your reply, or represent a completed three-month intervention.</p>
  <label className="draft-field">Demonstration group<select value={group} onChange={e=>{setGroup(e.target.value);setReply('');}}>{['STARCASM','HumorBot','Control'].map(x=><option key={x}>{x}</option>)}</select></label><p className="draft-help">Group selection is for demonstration only; real allocation is performed separately.</p>
  {ackBox}
  <div className="chat" aria-label="Scripted conversation">
   <div className="chat-msg chat-bot"><span className="chat-who">{group} · scripted</span><p>{prompt}</p></div>
   {liveExchange&&<><div className="chat-msg chat-user"><span className="chat-who">{liveExchange.participant}</span><p>{liveExchange.reply}</p></div><div className="chat-msg chat-bot"><span className="chat-who">{group} · scripted response</span><p>{liveExchange.response}</p></div></>}
   <div className="chat-composer"><label className="draft-field">Fictional participant reply<textarea rows={3} value={reply} onChange={e=>setReply(e.target.value)} placeholder="Type what a participant might answer…"/></label><button type="button" className="draft-primary" onClick={saveSession}>Record scripted session</button></div>
  </div>
  <Heading level={hSection} className="draft-section">Recorded demonstration sessions ({sessions.length})</Heading>
  {sessions.length===0?<p className="draft-empty">No sessions yet. Type a reply above and choose “Record scripted session”.</p>:sessions.map(s=><article className="draft-session" key={s.id}><div className="draft-session-head"><strong>{s.participant} · {s.group}</strong><span className="draft-help">{shortTime(s.at)}</span></div><p><span className="draft-help">Participant:</span> {s.reply}</p><p><span className="draft-help">Scripted response:</span> {s.response}</p></article>)}
 </div>}

 {tab==='feedback'&&<div>
  {progressBar(currentSection||'Feedback',feedbackAnswered,feedbackSource.items.length)}
  <Heading level={hPanel} className="draft-panel-title">Participant feedback questionnaire</Heading>
  <p>Answer from the participant’s point of view. Pick N/A when an item doesn’t apply, or leave it blank.</p>
  <details className="draft-details"><summary>About the scales and this adaptation</summary><p>Technology and chatbot items use 1 (disagree) to 5 (agree); usability items use 1 (strongly disagree) to 7 (strongly agree), preserving the supplied direction.</p><p>Provisional adaptation of Research Tool 1.pdf: DigiMoCA references and administrator wording are adapted to this study platform; staff demographics are omitted. No validated or composite score is claimed.</p></details>
  {feedbackSource.items.map((q,i)=><div key={q.id}>{(i===0||feedbackSource.items[i-1].group!==q.group)&&<div data-section-title={q.group}><Heading level={hSection} className="draft-section">{q.group} <span className="draft-help">· 1–{q.maximum} scale</span></Heading></div>}{likert(q)}</div>)}
  <label className="draft-field">Positive or negative aspects <span className="draft-optional">(optional)</span><textarea rows={3} value={feedbackNotes} onChange={e=>setFeedbackNotes(e.target.value)}/></label>
 </div>}

 {tab==='decisions'&&<div><Heading level={hPanel} className="draft-panel-title">Provisional demonstration choices</Heading><ul className="draft-list"><li>Baseline: MoCA 8.3 English and Trail Making A/B using IowaTrailMaking.pdf.</li><li>Follow-up: SAGE Form 1 (US 2021), replacing the baseline instruments as requested.</li><li>Feedback questionnaires: participant respondents only, with provisional wording adaptations.</li><li>Scores are manually entered examples; no automated scoring, diagnosis, eligibility rule, score conversion or pre/post improvement calculation.</li><li>Digit Span remains available as a separate demonstration game.</li></ul><Heading level={hPanel} className="draft-panel-title">Before an actual study begins</Heading><p>The approved protocol must settle scoring guidance, assessment administration, consent and assistance, eligibility, session frequency, questionnaire wording and the analysis plan. This demonstration is for committee and IRB review and does not imply approval.</p><p>Screening Questions 7 and 9 currently allow one injury mechanism and multiple diagnoses respectively; those response rules are provisional. Staff eligibility review is a separate staff task, not the participant feedback questionnaire.</p></div>}

 <nav className="draft-stepnav" aria-label="Walkthrough steps">
  {prev?<button type="button" onClick={()=>goTo(prev[0])}>← {prev[1]}</button>:<span/>}
  {next&&<button type="button" className="draft-primary" onClick={()=>goTo(next[0])}>{tab==='overview'?'Begin screening walkthrough':`Next: ${next[1]}`} →</button>}
 </nav>
 <p className="draft-help draft-export-note">Export downloads everything entered this session, including results for other fictional codes. Unsaved result-form fields are left out.</p>
 </div>
 </div>

 <footer className="draft-footer">
  {notice&&<div role="status" className={`draft-notice draft-notice-${notice.tone}`}><span>{notice.text}</span><button type="button" className="draft-notice-close" aria-label="Dismiss message" onClick={()=>setNoticeState(null)}>×</button></div>}
  <div className="draft-footer-row">
   <button type="button" className="draft-export" onClick={exportDraft}>Export review draft JSON</button>
   <p>Downloads everything entered this session, including results for other fictional codes. Unsaved result-form fields are left out.</p>
  </div>
 </footer>
 </section>;
}

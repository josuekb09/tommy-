import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronRight, CircleHelp, Clock3, ClipboardList, Copy, GripVertical, ListOrdered, Maximize2, Minimize2, Moon, Pause, Play, Plus, RotateCcw, ScanLine, Settings2, Square, Sun, TimerReset, UserPlus, Volume2, X } from "lucide-react"
import { addOffset, elapsed, formatTime, pause, reset, start, stateAt, stop, words } from "./engine/timer"
import { reportRows, reportText } from "./engine/report"
import { defaultSettings, presets, type Meeting, type Segment, type SegmentType, type Settings, type Turn } from "./engine/types"
import { findCurrentMeeting, loadMeetings, loadSettings, saveMeeting, saveSettings } from "./storage"
import { playThresholdTone, unlockAudio } from "./engine/audio"
import AgendaScanner from "./AgendaScanner"

const uid = () => crypto.randomUUID()
const label = (type: SegmentType) => ({ speeches: "Speeches", evaluations: "Evaluations", tableTopics: "Table Topics" })[type]
const blank = (type: SegmentType): Segment => ({ id: uid(), type, turns: [] })
const newMeeting = (): Meeting => ({ id: uid(), date: new Date().toISOString().slice(0, 10), title: "Toastmasters meeting", segments: [blank("speeches"), blank("evaluations"), blank("tableTopics")] })
const demoMeeting = (): Meeting => ({ id: "demo-meeting", date: "2026-10-07", title: "Riverside Toastmasters", segments: [
 { id:"demo-speeches", type:"speeches", turns:[{id:"kim",name:"Kim Austen",role:"Ice Breaker",thresholds:presets["Ice Breaker"],status:"done",elapsedMs:342000},{id:"daniel",name:"Daniel Foster",role:"Speech",thresholds:presets.Speech,status:"queued",elapsedMs:0}] },
 { id:"demo-evaluations", type:"evaluations", turns:[{id:"priya",name:"Priya Patel",role:"Evaluation",thresholds:presets.Evaluation,status:"done",elapsedMs:174000},{id:"james",name:"James Wilson",role:"Evaluation",thresholds:presets.Evaluation,status:"queued",elapsedMs:0}] },
 { id:"demo-topics", type:"tableTopics", turns:[{id:"alex",name:"Alex Morgan",role:"Table Topics",thresholds:presets["Table Topics"],status:"done",elapsedMs:102000},{id:"sarah",name:"Sarah Chen",role:"Table Topics",thresholds:presets["Table Topics"],status:"done",elapsedMs:143000},{id:"taylor",name:"Taylor Brooks",role:"Table Topics",thresholds:presets["Table Topics"],status:"running",startedAt:Date.now()-96000,elapsedMs:0}] }
] })
const initials = (name: string) => name.split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase()
const stateText: Record<string, [string, string]> = { ready:["Ready","The timer is waiting"], green:["Green","Within time"], yellow:["Yellow","Wrap up"], red:["Red","Time limit reached"], disqualified:["Over time","Disqualification limit"] }

export default function App() {
  const demo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1"
  const [meeting, setMeeting] = useState<Meeting>(() => demo ? demoMeeting() : newMeeting()), [settings, setSettings] = useState<Settings>(defaultSettings), [view, setView] = useState<"timer" | "queue" | "report" | "log" | "settings" | "scanner">("timer"), [segmentId, setSegmentId] = useState(meeting.segments[demo ? 2 : 0].id), [selectedId, setSelectedId] = useState<string>(), [sheet, setSheet] = useState<"speaker" | "guest" | "edit">(), [name, setName] = useState(""), [role, setRole] = useState("Speech"), [editTime, setEditTime] = useState(""), [toast, setToast] = useState(""), [tick, setTick] = useState(0), [speakerDisplay, setSpeakerDisplay] = useState(false), [hydrated, setHydrated] = useState(demo)
  const [editingId, setEditingId] = useState<string>()
  const [canUndo, setCanUndo] = useState(false)
  const undoSnapshot = useRef<Turn | undefined>(undefined), lastState = useRef("ready")
  const segment = meeting.segments.find(x => x.id === segmentId) || meeting.segments[0]
  const active = segment?.turns.find(x => x.id === selectedId) || segment?.turns.find(x => x.status === "running") || segment?.turns.find(x => x.status !== "done")
  const ms = active ? elapsed(active) : 0, thresholds = active ? { ...active.thresholds, disqualify: settings.disqualification ? active.thresholds.red + 30 : undefined } : undefined, state = thresholds ? stateAt(ms, thresholds) : "ready", queue = segment?.turns.filter(x => x.status !== "done" && x.id !== active?.id) || []
  const pastNames = useMemo(() => [...new Set(meeting.segments.flatMap(s => s.turns.map(t => t.name)))].slice(-5), [meeting])
  useEffect(() => {
    if (demo) return;
    Promise.all([loadMeetings(), loadSettings()]).then(([meetings, saved]) => {
      const activeMeeting = findCurrentMeeting(meetings, saved?.currentMeetingId);
      if (activeMeeting) {
        setMeeting(activeMeeting);
        setSegmentId(activeMeeting.segments[0]?.id);
      }
      if (saved) setSettings({ ...defaultSettings, ...saved });
      setHydrated(true);
    }).catch(() => setHydrated(true));
  }, [demo])
  useEffect(() => { const i = setInterval(() => setTick(n => n + 1), 250); return () => clearInterval(i) }, [])
  useEffect(() => {
    if (!demo && hydrated) {
      void saveMeeting(meeting);
      setSettings(s => s.currentMeetingId === meeting.id ? s : { ...s, currentMeetingId: meeting.id });
    }
  }, [meeting, demo, hydrated]);
  useEffect(() => {
    if (!demo && hydrated) void saveSettings(settings);
    const theme = settings.theme || (settings.dark ? "dark" : "light");
    document.documentElement.dataset.theme = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  }, [settings, demo, hydrated]);
  useEffect(() => { if (!toast) return; const i = setTimeout(() => setToast(""), 2500); return () => clearTimeout(i) }, [toast])
  useEffect(() => { if (active?.status !== "running") return; let wake: WakeLockSentinel | undefined; navigator.wakeLock?.request("screen").then(x => wake = x).catch(() => undefined); return () => { void wake?.release() } }, [active?.status])
  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (["green", "yellow", "red", "disqualified"].includes(state)) {
      if (settings.vibration) navigator.vibrate?.([90, 50, 90]);
      if (settings.sound) playThresholdTone();
    }
  }, [state, settings.vibration, settings.sound])
  const replace = (next: Turn) => setMeeting(m => ({ ...m, segments: m.segments.map(s => s.id === segment.id ? { ...s, turns: s.turns.map(t => t.id === next.id ? next : t) } : s) }))
  const selectSegment = (next: Segment) => { setSegmentId(next.id); setSelectedId(undefined) }
  const add = (guest = false) => { if (!name.trim()) return; const r = guest ? "Table Topics" : segment.type === "evaluations" ? "Evaluation" : role, t: Turn = { id: uid(), name: name.trim(), role: r, thresholds: { ...(settings.presetOverrides?.[r] || presets[r]) }, status: "queued", elapsedMs: 0 }; setMeeting(m => ({ ...m, segments: m.segments.map(s => s.id === segment.id ? { ...s, turns: [...s.turns, t] } : s) })); setSelectedId(t.id); setName(""); setSheet(undefined); setToast(guest ? "Guest added to Table Topics" : "Speaker added to queue") }
  const edit = () => {
    const parts = editTime.trim().split(":");
    let m: number, s: number;
    if (parts.length === 2) {
      m = Number(parts[0]);
      s = Number(parts[1]);
    } else if (parts.length === 1) {
      const total = Number(parts[0]);
      m = Math.floor(total / 60);
      s = total % 60;
    } else {
      return;
    }
    if (!editingId || !Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || s >= 60) return;
    const ms = (m * 60 + s) * 1000;
    setMeeting(mState => ({
      ...mState,
      segments: mState.segments.map(sState => ({
        ...sState,
        turns: sState.turns.map(t => t.id === editingId ? { ...t, status: "done", elapsedMs: ms, edited: true, startedAt: undefined } : t)
      }))
    }));
    setEditingId(undefined);
    setSheet(undefined);
    setToast("Recorded time edited");
  }
  const openEdit = (turnId: string) => {
    const seg = meeting.segments.find(s => s.turns.some(t => t.id === turnId));
    const turn = seg?.turns.find(t => t.id === turnId);
    if (!seg || !turn) return;
    setSegmentId(seg.id);
    setSelectedId(turn.id);
    setEditingId(turn.id);
    setEditTime(formatTime(turn.elapsedMs));
    setSheet("edit");
  }
  if (speakerDisplay) return <SpeakerDisplay ms={ms} state={state} exit={() => setSpeakerDisplay(false)} />
  return <main className={`app-shell state-${state}`}>
    <header className="app-header">
      <a className="brand-logo" href="#timer" aria-label="Tommy home"><img className="logo-light" src="/Tommy-logo-light.svg" alt="Tommy" /><img className="logo-dark" src="/Tommy-logo-dark.svg" alt="" /></a>
      <button className="icon-button" aria-label="Open settings" onClick={() => setView("settings")}><Settings2 size={21} /></button>
    </header>
    {(view === "timer" || view === "report") && <Tabs segments={meeting.segments} current={segment.id} change={selectSegment} />}
    {view === "timer" && <Timer segment={segment} active={active} ms={ms + tick * 0} state={state} upNext={queue} cues={settings.colourBlind} begin={() => { unlockAudio(); if (active) replace(active.status === "running" ? pause(active) : start(active)) }} stop={() => active && replace(stop(active))} reset={() => { if (active && confirm("Reset this timer? You can undo it once.")) { undoSnapshot.current = active; setCanUndo(true); replace(reset(active)); setToast("Timer reset") } }} undo={() => { if (undoSnapshot.current) { replace(undoSnapshot.current); undoSnapshot.current = undefined; setCanUndo(false); setToast("Timer restored") } }} canUndo={canUndo && undoSnapshot.current?.id === active?.id} offset={s => active && replace(addOffset(active, s * 1000))} select={t => setSelectedId(t.id)} queue={() => setView("queue")} display={() => setSpeakerDisplay(true)} />}
    {view === "queue" && <Queue meeting={meeting} segment={segment} change={selectSegment} select={t => { setSelectedId(t.id); setView("timer") }} sheet={setSheet} scan={() => setView("scanner")} remove={t => setMeeting(m => ({ ...m, segments: m.segments.map(s => s.id === segment.id ? { ...s, turns: s.turns.filter(x => x.id !== t.id) } : s) }))} names={pastNames} setName={setName} />}
    {view === "scanner" && <AgendaScanner meeting={meeting} settings={settings} onImport={next => { setMeeting(next); setSegmentId(next.segments[0].id); setSelectedId(undefined); setView("queue"); setToast("Agenda imported for review in the queue") }} onClose={() => setView("queue")} />}
    {view === "report" && <Report segment={segment} settings={settings} edit={openEdit} />}
    {view === "log" && <Log meeting={meeting} settings={settings} edit={openEdit} />}
    {view === "settings" && <Settings meeting={meeting} settings={settings} meetingChange={setMeeting} settingsChange={setSettings} />}
    <Nav view={view} change={setView} />
    {sheet && sheet !== "edit" && <SpeakerSheet guest={sheet === "guest"} name={name} role={role} segment={segment} names={pastNames} setName={setName} setRole={setRole} close={() => setSheet(undefined)} add={() => add(sheet === "guest")} />}
    {sheet === "edit" && editingId && <EditSheet value={editTime} setValue={editTime => setEditTime(editTime)} close={() => { setEditingId(undefined); setSheet(undefined) }} save={edit} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>
}
function Tabs({segments,current,change}:{segments:Segment[];current:string;change:(s:Segment)=>void}){return <div className="segment-tabs" role="tablist" aria-label="Meeting segments">{segments.map(s=><button key={s.id} role="tab" aria-selected={s.id===current} className={s.id===current?"selected":""} onClick={()=>change(s)}>{label(s.type)}</button>)}</div>}
function Timer({segment,active,ms,state,upNext,cues,begin,stop,reset,undo,canUndo,offset,select,queue:openQueue,display}:{segment:Segment;active?:Turn;ms:number;state:string;upNext:Turn[];cues:boolean;begin:()=>void;stop:()=>void;reset:()=>void;undo:()=>void;canUndo:boolean;offset:(n:number)=>void;select:(t:Turn)=>void;queue:()=>void;display:()=>void}){const t=active?.thresholds,p=t?Math.min(100,ms/(t.red*1000)*100):0,s=stateText[state]||stateText.ready,done=active?.status==="done",disabled=!active||done;return <section className="screen timer-screen"><div className="speaker-card"><div className="speaker-meta"><span className="eyebrow">{active?(active.status==="queued"?"Ready to time":"Now timing"):"Ready when you are"}</span><span className={`status-dot ${active?.status||"idle"}`}>{active?.status==="done"?"Recorded":active?.status||"Queue"}</span></div><h1>{active?.name||"Choose the first speaker"}</h1><p>{active?active.role:`${segment.turns.length} speaker${segment.turns.length===1?"":"s"} in ${label(segment.type)}`}</p>{t&&<div className="thresholds"><span><b>G</b>{formatTime(t.green*1000)}</span><span><b>Y</b>{formatTime(t.yellow*1000)}</span><span><b>R</b>{formatTime(t.red*1000)}</span></div>}</div><div className="timer-panel"><div className="timer-state"><i className={`signal ${state}`}/><div><b>{s[0]}</b><small>{s[1]}</small></div><button className="display-button" onClick={display} aria-label="Open speaker display"><Maximize2 size={20}/></button></div><div className="progress-ring" style={{"--progress":`${p}%`} as React.CSSProperties}><div className="timer-number">{formatTime(ms)}</div></div>{cues&&<div className="pattern-cue">{state==="green"?"● GO":state==="yellow"?"▧ WRAP UP":state==="red"?"■ TIME":state==="disqualified"?"× OVER TIME":"○ READY"}</div>}</div><div className="timer-actions"><button className="primary-button timer-primary" onClick={begin} disabled={disabled}>{active?.status==="running"?<><Pause/>Pause</>:<><Play/>{active?.status==="paused"?"Resume":"Start"}</>}</button><button className="secondary-button stop" onClick={stop} disabled={disabled}><Square/>Stop</button></div>{disabled&&<p className="disabled-reason">{done?"This speaker is already recorded.":"Choose a speaker first"}</p>}<div className="catchups"><span>Catch up</span>{[5,10,30].map(n=><button key={n} onClick={()=>offset(n)} disabled={disabled}>+{n} s</button>)}</div><div className="timer-footer"><button onClick={reset} disabled={!active}><RotateCcw size={16}/>Reset</button><button onClick={undo} disabled={!canUndo}><TimerReset size={16}/>Undo reset</button></div><section className="up-next"><div className="section-head"><div><span className="eyebrow">Up next</span><h2>{upNext[0]?.name||"No one queued"}</h2>{upNext[0]&&<p className="next-role">{upNext[0].role}</p>}</div><button className="text-button" onClick={openQueue}>View queue<ChevronRight size={16}/></button></div>{upNext.length?upNext.slice(0,2).map(x=><button className="queue-preview" key={x.id} onClick={()=>select(x)}><span className="initials">{initials(x.name)}</span><span><b>{x.name}</b><small>{x.role}</small></span><ChevronRight className="push" size={18}/></button>):<button className="primary-button add-empty" onClick={openQueue}><Plus/>Add speaker</button>}</section></section>}
function Queue({meeting,segment,change,select,sheet,scan,remove,names,setName}:{meeting:Meeting;segment:Segment;change:(s:Segment)=>void;select:(t:Turn)=>void;sheet:(v:"speaker"|"guest")=>void;scan:()=>void;remove:(t:Turn)=>void;names:string[];setName:(x:string)=>void}){return <section className="screen"><div className="screen-title"><div><span className="eyebrow">Meeting agenda</span><h1>Speaker queue</h1></div><button className="icon-button" aria-label="Queue help"><CircleHelp size={20}/></button></div><button className="scan-agenda-button" onClick={scan}><ScanLine size={20}/><span><b>Scan Meeting Agenda</b><small>Photograph or upload an agenda to build the queue</small></span><ChevronRight size={18}/></button><div className="queue-segments">{meeting.segments.map(s=><section className={`queue-section ${s.id===segment.id?"current":""}`} key={s.id}><button className="queue-section-title" onClick={()=>change(s)}><span>{label(s.type)}</span><span>{s.turns.length}<ChevronRight size={16}/></span></button>{s.id===segment.id&&<>{s.turns.map(t=><div className="speaker-row" key={t.id}><GripVertical className="drag" size={18}/><span className="initials">{initials(t.name)}</span><button className="speaker-row-main" onClick={()=>select(t)}><b>{t.name}</b><small>{t.role} · G {t.thresholds.green === undefined ? "—" : formatTime(t.thresholds.green*1000)} / R {formatTime(t.thresholds.red*1000)}</small></button><span className={`row-status ${t.status}`}>{t.status==="done"?`Done ${formatTime(t.elapsedMs)}`:t.status}</span><button className="row-delete" aria-label={`Remove ${t.name}`} onClick={()=>remove(t)}><X size={16}/></button></div>)}{!s.turns.length&&<div className="empty-queue"><p>No one is in this segment yet. Use the action below to add someone.</p></div>}</>}</section>)}</div><div className="queue-actions"><button className="secondary-button" onClick={()=>sheet("speaker")}><Plus/>Add speaker</button>{segment.type==="tableTopics"&&<button className="primary-button" onClick={()=>sheet("guest")}><UserPlus/>Add guest</button>}</div>{segment.type==="tableTopics"&&names.length>0&&<div className="recent-names"><span>Recent guests</span>{names.map(x=><button key={x} onClick={()=>{setName(x);sheet("guest")}}>{x}</button>)}</div>}</section>}
function Report({segment,settings,edit}:{segment:Segment;settings:Settings;edit:(id:string)=>void}){const rows=reportRows(segment,settings),speak=()=>speechSynthesis.speak(new SpeechSynthesisUtterance(rows.map(r=>`${r.name}, ${words(toMs(r.time))}`).join(". ")));return <section className="screen report-screen"><div className="screen-title"><div><span className="eyebrow">Timer’s report</span><h1>{label(segment.type)}</h1></div></div><ReportActions speak={speak} copy={()=>navigator.clipboard.writeText(reportText(segment,settings))}/><Table rows={rows} edit={r=>edit(r.id)} /><div className="report-total"><span>Total timed speakers</span><b>{rows.length}</b></div></section>}
function Log({meeting,settings,edit}:{meeting:Meeting;settings:Settings;edit:(id:string)=>void}){return <section className="screen report-screen"><div className="screen-title"><div><span className="eyebrow">{meeting.date}</span><h1>Full meeting log</h1></div></div>{meeting.segments.map(s=><section className="log-group" key={s.id}><h2>{label(s.type)}</h2><Table rows={reportRows(s,settings)} edit={r=>edit(r.id)} /></section>)}<button className="primary-button export-button" onClick={()=>window.print()}><ClipboardList/>Export PDF</button></section>}
function ReportActions({speak,copy}:{speak:()=>void;copy:()=>void}){return <div className="report-actions"><button onClick={speak}><Volume2 size={18}/>Read aloud</button><button onClick={copy}><Copy size={18}/>Copy</button><button onClick={()=>window.print()}><ClipboardList size={18}/>Export PDF</button></div>}
type Row=ReturnType<typeof reportRows>[number]
function Table({rows,edit}:{rows:Row[];edit:(r:Row)=>void}){return rows.length?<div className="report-table"><div className="report-head"><span>Name</span><span>Time</span><span>Within</span></div>{rows.map(r=><div className="report-line" key={r.id}><span><b>{r.name}</b><small>{r.role}{r.edited?" · edited":""}</small></span><button className="time-edit" onClick={()=>edit(r)}>{r.time}</button><span className={r.within?"within yes":"within no"}>{r.within?<Check size={16}/>:<X size={16}/>} {r.within?"Yes":"No"}</span></div>)}</div>:<div className="report-empty"><Clock3 size={28}/><b>No times recorded</b><p>Completed speakers in this segment will appear here.</p></div>}
function PresetInput({role,kind,seconds,onChange}:{role:string;kind:"green"|"yellow"|"red";seconds:number;onChange:(s:number)=>void}){
  const formatted=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
  const [value,setValue]=useState(formatted);
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setValue(formatted)},[formatted,focused]);
  const commit=(raw:string)=>{
    const trimmed=raw.trim();
    const parts=trimmed.split(":");
    let parsed:number|undefined;
    if(parts.length===2){
      const m=Number(parts[0]),s=Number(parts[1]);
      if(Number.isInteger(m)&&Number.isInteger(s)&&m>=0&&s>=0&&s<60)parsed=m*60+s;
    }else if(parts.length===1&&trimmed.length>0){
      const n=Number(trimmed);
      if(Number.isInteger(n)&&n>0&&n<=3600)parsed=n;
    }
    if(parsed!==undefined&&parsed>0&&parsed<=3600){
      onChange(parsed);
      setValue(`${Math.floor(parsed/60)}:${String(parsed%60).padStart(2,"0")}`);
    }else{
      setValue(formatted);
    }
  };
  return <label><small>{kind[0].toUpperCase()}</small><input aria-label={`${role} ${kind}`} inputMode="numeric" value={value} onFocus={()=>setFocused(true)} onChange={e=>setValue(e.target.value)} onBlur={e=>{setFocused(false);commit(e.target.value)}} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();if(e.key==="Escape"){setValue(formatted);e.currentTarget.blur()}}}/></label>;
}
function Settings({meeting,settings,meetingChange,settingsChange}:{meeting:Meeting;settings:Settings;meetingChange:(m:Meeting)=>void;settingsChange:(s:Settings)=>void}){
  const set=(p:Partial<Settings>)=>settingsChange({...settings,...p});
  const preset=(r:string,k:"green"|"yellow"|"red",seconds:number)=>{
    set({presetOverrides:{...settings.presetOverrides,[r]:{...(settings.presetOverrides?.[r]||presets[r]),[k]:seconds}}})
  };
  const theme=settings.theme||(settings.dark?"dark":"light");
  return <section className="screen settings-screen">
    <div className="screen-title"><div><span className="eyebrow">Club preferences</span><h1>Settings</h1></div></div>
    <section className="settings-card"><h2>Meeting</h2><label>Club name<input value={meeting.title} onChange={e=>meetingChange({...meeting,title:e.target.value})}/></label><label>Meeting date<input type="date" value={meeting.date} onChange={e=>meetingChange({...meeting,date:e.target.value})}/></label></section>
    <section className="settings-card"><h2>Threshold presets <small>m:ss</small></h2>
      {Object.keys(presets).map(r=><div className="preset-row" key={r}>
        <span>{r}</span>
        {(["green","yellow","red"] as const).map(k=><PresetInput key={k} role={r} kind={k} seconds={(settings.presetOverrides?.[r]||presets[r])[k] ?? 0} onChange={s=>preset(r,k,s)}/>)}
      </div>)}
    </section>
    <section className="settings-card"><h2>Timing & cues</h2>
      <label>Early allowance<input type="number" value={settings.withinEarly} onChange={e=>set({withinEarly:+e.target.value})}/><small>seconds before green</small></label>
      <label>Late allowance<input type="number" value={settings.withinLate} onChange={e=>set({withinLate:+e.target.value})}/><small>seconds after red</small></label>
      <Toggle label="Disqualify at red + 30 s" value={settings.disqualification} change={v=>set({disqualification:v})}/>
      <Toggle label="Threshold sound" value={settings.sound} change={v=>{if(v)unlockAudio();set({sound:v})}}/>
      <Toggle label="Haptic alerts" value={settings.vibration} change={v=>set({vibration:v})}/>
      <Toggle label="Colour-blind cues" value={settings.colourBlind} change={v=>set({colourBlind:v})}/>
    </section>
    <section className="settings-card"><h2>Appearance</h2>
      <div className="theme-choices"><button className={theme==="system"?"selected":""} onClick={()=>set({theme:"system"})}>System</button><button className={theme==="light"?"selected":""} onClick={()=>set({theme:"light",dark:false})}><Sun/>Light</button><button className={theme==="dark"?"selected":""} onClick={()=>set({theme:"dark",dark:true})}><Moon/>Dark</button></div>
    </section>
  </section>
}
function Toggle({label,value,change}:{label:string;value:boolean;change:(v:boolean)=>void}){return <div className="toggle-line"><span>{label}</span><button role="switch" aria-label={label} aria-checked={value} className={value?"on":""} onClick={()=>change(!value)}><i/></button></div>}
function SpeakerSheet({guest,name,role,segment,names,setName,setRole,close,add}:{guest:boolean;name:string;role:string;segment:Segment;names:string[];setName:(x:string)=>void;setRole:(x:string)=>void;close:()=>void;add:()=>void}){const roles=segment.type==="evaluations"?["Evaluation"]:segment.type==="tableTopics"?["Table Topics"]:["Speech","Ice Breaker"];return <div className="sheet-backdrop" onMouseDown={close}><section className="bottom-sheet" onMouseDown={e=>e.stopPropagation()}><div className="sheet-grabber"/><div className="sheet-head"><div><span className="eyebrow">{guest?"Table Topics":"Agenda"}</span><h2>{guest?"Add a guest":"Add speaker"}</h2></div><button className="icon-button" aria-label="Close add speaker" onClick={close}><X/></button></div><label className="field-label">Name<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Taylor Brooks"/></label>{guest&&names.length>0&&<div className="suggestions"><span>Recent names</span>{names.map(x=><button key={x} onClick={()=>setName(x)}>{x}</button>)}</div>}<label className="field-label">Role<select value={guest?"Table Topics":role} disabled={guest} onChange={e=>setRole(e.target.value)}>{roles.map(x=><option key={x}>{x}</option>)}</select></label><button className="primary-button sheet-submit" onClick={add} disabled={!name.trim()}><Plus/>{guest?"Add guest":"Add to queue"}</button></section></div>}
function EditSheet({value,setValue,close,save}:{value:string;setValue:(x:string)=>void;close:()=>void;save:()=>void}){return <div className="sheet-backdrop" onMouseDown={close}><section className="bottom-sheet" onMouseDown={e=>e.stopPropagation()}><div className="sheet-grabber"/><div className="sheet-head"><div><span className="eyebrow">Timer log</span><h2>Edit recorded time</h2></div><button className="icon-button" aria-label="Close edit recorded time" onClick={close}><X/></button></div><label className="field-label">Time (m:ss)<input autoFocus aria-label="Recorded time" value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")save()}} placeholder="5:30"/></label><button className="primary-button sheet-submit" onClick={save}>Save recorded time</button></section></div>}

function Nav({view,change}:{view:string;change:(v:any)=>void}){const items=[["timer","Timer",Clock3],["queue","Queue",ListOrdered],["report","Report",ClipboardList],["log","Log",Copy],["settings","Settings",Settings2]] as const;return <nav className="bottom-nav" aria-label="Primary navigation">{items.map(([id,text,Icon])=><button className={id===view?"active":""} key={id} onClick={()=>change(id)}><Icon size={20}/><span>{text}</span></button>)}</nav>}
function SpeakerDisplay({ms,state,exit}:{ms:number;state:string;exit:()=>void}){const s=stateText[state]||stateText.ready;useEffect(()=>{let wake:WakeLockSentinel|undefined;navigator.wakeLock?.request("screen").then(x=>wake=x).catch(()=>undefined);return()=>{void wake?.release()}},[]);return <button className={`speaker-display state-${state}`} onClick={exit} aria-label="Exit speaker display"><span>{formatTime(ms)}</span><small>{s[0]} · Tap anywhere to exit</small><Minimize2/></button>}
const toMs=(v:string)=>{const[m,s]=v.split(":").map(Number);return(m*60+s)*1000}

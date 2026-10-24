import { useCallback, useEffect, useMemo, useState } from "react"
import { ClipboardList, Clock3, ListOrdered, Settings2 } from "lucide-react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { useAppData, useRoute, useWriterLock, type Route } from "./hooks"
import { MeetingScreen } from "./screens/MeetingScreen"
import { PrintLog } from "./screens/PrintLog"
import { ReportScreen } from "./screens/ReportScreen"
import { SettingsScreen } from "./screens/SettingsScreen"
import { TimerScreen } from "./screens/TimerScreen"
import { SpeakerView } from "./screens/SpeakerView"
import { useSpeakerFeed } from "./speaker-feed"
import { explainSignals } from "../engine/explain"
import { profileLibrary } from "../engine/profiles"

const navigation: { route: Route; label: string; Icon: typeof Clock3 }[] = [
  { route: "meeting", label: "Meeting", Icon: ListOrdered },
  { route: "timer", label: "Timer", Icon: Clock3 },
  { route: "report", label: "Report", Icon: ClipboardList },
  { route: "settings", label: "Settings", Icon: Settings2 },
]

export default function App() {
  const [route, go] = useRoute()
  // Speaker-facing windows only display frames from the Timer window: no data, no lock, no navigation.
  if (route === "speaker" || route === "zoom") return <SpeakerView mode={route} />
  return <TimerApp route={route} go={go} />
}

function TimerApp({ route, go }: { route: Route; go: (route: Route) => void }) {
  const data = useAppData()
  const lock = useWriterLock()
  const readOnly = lock !== "owner"
  const [selectedId, setSelectedId] = useState<string>()
  const [explaining, setExplaining] = useState(false)
  const explanation = useMemo(() => (explaining && data ? explainSignals(data.rules, profileLibrary(data.clubProfiles)) : null), [explaining, data])
  useSpeakerFeed(data?.meeting ? { ...data, meeting: data.meeting } : undefined, selectedId, explanation)
  const [toast, setToast] = useState("")
  const notify = useCallback((message: string) => setToast(message), [])
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(""), 2_500)
    return () => clearTimeout(id)
  }, [toast])

  const theme = data?.settings.theme ?? "system"
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const apply = () => (document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])

  if (!data?.meeting)
    return (
      <main className="app-shell">
        <p role="status">Loading Tommy…</p>
      </main>
    )
  const ready = { ...data, meeting: data.meeting }
  // The printable Timer's log is a page of its own: no header, banners or navigation.
  if (route === "print") return <PrintLog data={ready} back={() => go("report")} />

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand-logo" href="#/timer" aria-label="Tommy timer">
          <img className="logo-light" src="/Tommy-logo-light.svg" alt="Tommy" />
          <img className="logo-dark" src="/Tommy-logo-dark.svg" alt="" />
        </a>
      </header>
      {lock === "other" && (
        <p className="app-banner" role="alert">
          Tommy is open in another tab. This tab is read-only until you close the other one.
        </p>
      )}
      {needRefresh && (
        <p className="app-banner" role="status">
          A new version of Tommy is ready.{" "}
          <button className="text-button" onClick={() => void updateServiceWorker(true)}>
            Update now
          </button>
        </p>
      )}
      {route === "meeting" && (
        <MeetingScreen
          data={ready}
          readOnly={readOnly}
          notify={notify}
          open={id => {
            setSelectedId(id)
            go("timer")
          }}
        />
      )}
      {route === "timer" && (
        <TimerScreen
          data={ready}
          readOnly={readOnly}
          selectedId={selectedId}
          select={setSelectedId}
          notify={notify}
          openMeeting={() => go("meeting")}
          explaining={explaining}
          setExplaining={setExplaining}
        />
      )}
      {route === "report" && <ReportScreen data={ready} notify={notify} openPrint={() => go("print")} />}
      {route === "settings" && <SettingsScreen data={ready} readOnly={readOnly} notify={notify} />}
      <nav className="bottom-nav" aria-label="Primary navigation">
        {navigation.map(({ route: target, label, Icon }) => (
          <button key={target} className={route === target ? "active" : ""} aria-current={route === target ? "page" : undefined} onClick={() => go(target)}>
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  )
}

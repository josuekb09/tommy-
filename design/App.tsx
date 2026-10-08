import { useEffect, useState } from "react"

type IconName = "grid" | "calendar" | "queue" | "clock" | "report" | "device" | "settings" | "arrow" | "plus" | "check" | "scan" | "pause" | "play" | "stop" | "download" | "sound" | "moon"
function Icon({ name, size = 20 }: { name: IconName size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4m10-4v4M3 11h18" />
      </>
    ),
    queue: (
      <>
        <path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    report: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />
      </>
    ),
    device: (
      <>
        <rect x="5" y="2" width="14" height="20" rx="3" />
        <path d="M9 18h6M9 6h6" />
      </>
    ),
    settings: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="9" cy="6" r="2" fill="currentColor" />
        <circle cx="16" cy="12" r="2" fill="currentColor" />
        <circle cx="8" cy="18" r="2" fill="currentColor" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    scan: (
      <>
        <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M6 12h12" />
      </>
    ),
    pause: (
      <>
        <path d="M9 5v14M15 5v14" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    sound: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z" />,
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
const initialSpeakers = [
  {
    name: "Alex Morgan",
    role: "Table Topics",
    initials: "AM",
    min: 60,
    mid: 90,
    max: 120,
    done: true,
    result: "1:42",
    color: "bg-[#ece9f6] text-[#75669a]",
  },
  {
    name: "Sarah Chen",
    role: "Table Topics",
    initials: "SC",
    min: 60,
    mid: 90,
    max: 120,
    done: true,
    result: "1:56",
    color: "bg-[#e5eff3] text-[#527a89]",
  },
  {
    name: "Kim Austen",
    role: "Icebreaker",
    initials: "KA",
    min: 240,
    mid: 300,
    max: 360,
    done: false,
    result: "",
    color: "bg-[#e8edf7] text-[#5778a5]",
  },
  {
    name: "Daniel Foster",
    role: "Prepared speech",
    initials: "DF",
    min: 300,
    mid: 360,
    max: 420,
    done: false,
    result: "",
    color: "bg-[#f5ece3] text-[#a18361]",
  },
  {
    name: "Priya Patel",
    role: "Evaluation",
    initials: "PP",
    min: 120,
    mid: 150,
    max: 180,
    done: false,
    result: "",
    color: "bg-[#eceaf3] text-[#85739c]",
  },
  {
    name: "James Wilson",
    role: "Evaluation",
    initials: "JW",
    min: 120,
    mid: 150,
    max: 180,
    done: false,
    result: "",
    color: "bg-[#e8efea] text-[#6a8973]",
  },
]
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
function DeviceDrawing({ engineering = false }: { engineering?: boolean }) {
  return (
    <svg
      viewBox="0 0 400 290"
      className="mx-auto w-full max-w-[390px]"
      role="img"
      aria-label="Tommy wedge-shaped charcoal device with portrait display and green rear diffuser"
    >
      <ellipse
        cx="208"
        cy="252"
        rx="118"
        ry="12"
        fill="#1b1f27"
        opacity=".07"
      />
      <path
        d="M111 91 223 57 309 105 291 235 173 261 96 205Z"
        fill="#252a33"
        stroke="#11151b"
      />
      <path d="m223 57 86 48-18 130-73-49Z" fill="#1b1f27" />
      <path d="m111 91 112-34-5 129-122 19Z" fill="#343b46" />
      <path
        d="m125 96 79-23-2 99-86 16Z"
        fill="#111820"
        stroke="#626975"
        strokeWidth="1"
      />
      <g transform="matrix(.92,-.24,-.04,1,129,108)">
        <text fill="#a1abb9" fontSize="6" fontFamily="Inter">
          NOW SPEAKING
        </text>
        <text y="15" fill="white" fontSize="10" fontFamily="Inter">
          Kim Austen
        </text>
        <text y="25" fill="#a1abb9" fontSize="6">
          Icebreaker
        </text>
        <text y="53" fill="white" fontSize="24" fontFamily="JetBrains Mono">
          04:32
        </text>
        <rect y="61" width="64" height="5" rx="2" fill="#2ecc5f" />
        <rect y="76" width="29" height="13" rx="3" fill="#39414d" />
        <rect x="34" y="76" width="29" height="13" rx="3" fill="#39414d" />
        <text x="5" y="85" fill="white" fontSize="5">
          PAUSE
        </text>
        <text x="42" y="85" fill="white" fontSize="5">
          STOP
        </text>
      </g>
      <ellipse
        cx="265"
        cy="142"
        rx="28"
        ry="45"
        transform="rotate(-13 265 142)"
        fill="#2ecc5f"
      />
      <ellipse
        cx="265"
        cy="142"
        rx="23"
        ry="39"
        transform="rotate(-13 265 142)"
        fill="#b1edbc"
        opacity=".8"
      />
      <path
        d="m247 203 24 14m-26-10 24 14m-26-10 24 14"
        stroke="#575e69"
        strokeWidth="2"
      />
      <text
        x="131"
        y="218"
        fill="#c2c7ce"
        fontFamily="Inter"
        fontSize="12"
        transform="rotate(-12 131 218)"
        fontWeight="600"
      >
        tommy<tspan fill="#2ecc5f">.</tspan>
      </text>
      <path d="m182 253 10-2m85-14 9-2" stroke="#0f1217" strokeWidth="7" />
      {engineering && (
        <g fill="#7b8390" stroke="#9aa1ac" strokeWidth=".7">
          <path d="M82 66v190m-5-190h10m-10 190h10M110 274h181m-181-5v10m181-10v10" />
          <text
            x="55"
            y="165"
            stroke="none"
            fontSize="10"
            transform="rotate(-90 55 165)"
          >
            160 mm
          </text>
          <text x="171" y="288" stroke="none" fontSize="10">
            110 mm
          </text>
        </g>
      )}
    </svg>
  )
}
function App() {
  const [page, setPage] = useState("Live timer")
  const [pack, setPack] = useState("App")
  const [speakers, setSpeakers] = useState(initialSpeakers)
  const [selected, setSelected] = useState(2)
  const [seconds, setSeconds] = useState(272)
  const [running, setRunning] = useState(false)
  const [dark, setDark] = useState(false)
  const [guest, setGuest] = useState(false)
  const [guestName, setGuestName] = useState("")
  const [notice, setNotice] = useState("")
  const [settings, setSettings] = useState([true, false, true])
  const [scanReview, setScanReview] = useState(false)
  const current = speakers[selected]
  const state =
    seconds >= current.max
      ? "red"
      : seconds >= current.mid
        ? "yellow"
        : seconds >= current.min
          ? "green"
          : "ready"
  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(
      () => setSeconds((value) => value + 1),
      1000,
    )
    return () => clearInterval(interval)
  }, [running])
  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(""), 3500)
    return () => clearTimeout(timeout)
  }, [notice])
  function choose(index: number) {
    setSelected(index)
    setSeconds(0)
    setRunning(false)
  }
  function stop() {
    setRunning(false)
    setSpeakers((list) =>
      list.map((speaker, index) =>
        index === selected
          ? { ...speaker, done: true, result: formatTime(seconds) }
          : speaker,
      ),
    )
    setNotice("Timing saved to the meeting report.")
  }
  function addGuest() {
    if (!guestName.trim()) return
    setSpeakers((list) => [
      ...list,
      {
        name: guestName.trim(),
        initials: guestName
          .trim()
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join(""),
        role: "Table Topics",
        min: 60,
        mid: 90,
        max: 120,
        done: false,
        result: "",
        color: "bg-[#e8edf7] text-[#5778a5]",
      },
    ])
    setGuest(false)
    setGuestName("")
    setNotice("Guest added to the speaker queue.")
  }
  const panel = "rounded-2xl border border-border bg-white"
  return (
    <div
      className={`${
        dark
          ? "[--background:#141820] [--foreground:#e9edf3] [--border:#353b46] [&_.bg-white]:bg-[#202631] [&_.text-slate-900]:text-white [&_.text-slate-500]:text-slate-400 [&_.bg-slate-50]:bg-[#252c37]"
          : ""
      } min-h-screen bg-background text-foreground`}
    >
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-border bg-white lg:flex">
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault()
            setPack("App")
            setPage("Live timer")
          }}
          className="flex h-[88px] items-center px-7 text-[31px] font-semibold tracking-[-1px]"
        >
          tommy<span className="text-[#1f5fbf]">.</span>
        </a>
        <div className="px-5">
          <div className="mb-7 flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#edf2fa] text-[#1f5fbf]">
              <Icon name="grid" size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold">Riverside Toastmasters</p>
              <p className="mt-1 text-[11px] text-slate-500">Club workspace</p>
            </div>
          </div>
          <p className="mb-3 px-3 text-[10px] font-semibold tracking-[1.5px] text-slate-400">
            MEETING
          </p>
          {([
            ["Meetings", "calendar"],
            ["Speaker queue", "queue"],
            ["Live timer", "clock"],
            ["Timer’s report", "report"],
          ] as [string, IconName][]).map(([title, icon]) => (
            <button
              key={title}
              onClick={() => {
                setPage(title)
                setPack("App")
              }}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[13px] ${
                page === title && pack === "App"
                  ? "bg-[#edf3fc] font-semibold text-[#1f5fbf]"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon name={icon} size={19} />
              {title}
              {title === "Live timer" && (
                <span className="ml-auto size-1.5 rounded-full bg-[#1f5fbf]" />
              )}
            </button>
          ))}
          <p className="mb-3 mt-8 px-3 text-[10px] font-semibold tracking-[1.5px] text-slate-400">
            WORKSPACE
          </p>
          {([
            ["Device", "device"],
            ["Settings", "settings"],
          ] as [string, IconName][]).map(([title, icon]) => (
            <button
              key={title}
              onClick={() => {
                setPack("App")
                setPage(title)
              }}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[13px] ${
                page === title
                  ? "bg-[#edf3fc] text-[#1f5fbf]"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon name={icon} size={19} />
              {title}
              {title === "Device" && (
                <span className="ml-auto size-1.5 rounded-full bg-[#2ecc5f]" />
              )}
            </button>
          ))}
        </div>
        <div className="mt-auto p-5">
          <div className="mb-5 rounded-xl border border-border bg-slate-50 p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="size-1.5 rounded-full bg-[#2ecc5f]" /> Tommy is
              connected
            </div>
            <p className="mt-1.5 pl-3.5 text-[11px] text-slate-500">
              Ready when you are.
            </p>
          </div>
          <div className="flex items-center gap-3 border-t border-border pt-5">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#f0ece5] text-xs font-medium text-[#89745a]">
              JL
            </span>
            <div>
              <p className="text-xs font-medium">Jamie Lee</p>
              <p className="mt-1 text-[11px] text-slate-500">Meeting timer</p>
            </div>
            <button
              aria-label="Toggle dark mode"
              onClick={() => setDark(!dark)}
              className="ml-auto text-slate-400"
            >
              <Icon name="moon" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="lg:ml-[224px]">
        <header className="flex h-[73px] items-center justify-between border-b border-border bg-white px-5 sm:px-9">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="font-semibold text-foreground lg:hidden">
              tommy.
            </span>
            <span>Workspace</span>
            <Icon name="arrow" size={13} />
            <span className="text-foreground">October club meeting</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden items-center gap-2 text-[11px] text-slate-500 sm:flex">
              <span className="size-1.5 rounded-full bg-[#2ecc5f]" />
              All changes saved
            </span>
            <button
              onClick={() =>
                setNotice("You’re viewing the Tommy design pack · v1.0")
              }
              className="flex size-7 items-center justify-center rounded-full border border-border text-xs text-slate-500"
            >
              ?
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1550px] p-5 sm:p-8 lg:px-9">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1">
              {["Device", "App", "Components", "Colours & type"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPack(tab)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    pack === tab
                      ? "bg-[#edf3fc] text-[#1f5fbf]"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <span className="text-[10px] tracking-[1.1px] text-slate-400">
              TOMMY / PRODUCT DESIGN PACK{" "}
              <span className="ml-2 rounded border border-border px-1.5 py-0.5 tracking-normal">
                v1.0
              </span>
            </span>
          </div>
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="size-1.5 rounded-full bg-[#2ecc5f]" />
                {pack === "App"
                  ? "MEETING IN PROGRESS"
                  : "PRODUCT SPECIFICATION"}
              </div>
              <h1 className="text-[29px] font-semibold tracking-[-.6px]">
                {pack === "App"
                  ? page === "Live timer"
                    ? "A little timing. A lot of confidence."
                    : page
                  : pack === "Device"
                    ? "Purpose-built. Down to the millimetre."
                    : pack === "Components"
                      ? "One system. Every state."
                      : "Clarity, by design."}
              </h1>
              <p className="mt-2 text-[13px] text-slate-500">
                {pack === "App"
                  ? "October club meeting · Tuesday, 6 October 2026 · 7:00 PM"
                  : "Tommy smart timekeeper · Industrial and interface design specification"}
              </p>
            </div>
            <button
              onClick={() => {
                setPage("Meetings")
                setPack("App")
              }}
              className="flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2.5 text-xs font-medium"
            >
              <Icon name="calendar" size={16} />
              Meeting details
              <Icon name="arrow" size={13} />
            </button>
          </div>
          <nav className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
            {[
              "Meetings",
              "Speaker queue",
              "Live timer",
              "Timer’s report",
              "Device",
              "Settings",
            ].map((item) => (
              <button
                key={item}
                onClick={() => {
                  setPage(item)
                  setPack("App")
                }}
                className={`shrink-0 rounded-lg border border-border px-3 py-2 text-xs ${
                  page === item ? "bg-[#1f5fbf] text-white" : "bg-white"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
          {pack === "App" &&
            (page === "Live timer" || page === "Speaker queue") && (
              <>
                <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-border bg-white p-4 sm:grid-cols-4">
                  <Stat
                    label="MEETING DURATION"
                    value="1h 30m"
                    sub="7:00 – 8:30 PM"
                  />
                  <Stat
                    label="SPEAKERS"
                    value={String(speakers.length)}
                    sub={`${speakers.filter((s) => s.done).length} completed`}
                  />
                  <Stat
                    label="CURRENT SEGMENT"
                    value="Prepared speeches"
                    sub="3 of 5 segments"
                  />
                  <div className="px-3 sm:border-l sm:border-border">
                    <p className="text-[9px] font-semibold tracking-[1.2px] text-slate-400">
                      DEVICE STATUS
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      <span className="size-2 rounded-full bg-[#2ecc5f]" />
                      Connected
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Wi-Fi · Battery 86%
                    </p>
                  </div>
                </div>
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(235px,1fr)_minmax(340px,1.55fr)_minmax(240px,1fr)]">
                  <section className={`${panel} overflow-hidden`}>
                    <div className="flex items-center justify-between border-b border-border p-5">
                      <h2 className="text-sm font-semibold">Speaker queue</h2>
                      <span className="rounded-md bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
                        {speakers.length} speakers
                      </span>
                    </div>
                    <div className="px-3 py-2">
                      {speakers.map((speaker, index) => (
                        <button
                          key={index}
                          onClick={() => choose(index)}
                          className={`my-1 flex w-full items-center gap-3 rounded-xl p-3 text-left ${
                            selected === index
                              ? "border border-[#bfd3f0] bg-[#f0f5fc]"
                              : "border border-transparent hover:bg-slate-50"
                          }`}
                        >
                          <span
                            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${speaker.color}`}
                          >
                            {speaker.initials}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-xs font-semibold ${
                                selected === index ? "text-[#1f5fbf]" : ""
                              }`}
                            >
                              {speaker.name}
                            </span>
                            <span className="mt-1 block text-[10px] text-slate-500">
                              {speaker.role}
                            </span>
                          </span>
                          {speaker.done ? (
                            <span className="text-[#248441]">
                              <Icon name="check" size={15} />
                            </span>
                          ) : selected === index ? (
                            <span className="flex items-center gap-[2px] text-[#1f5fbf]">
                              <span className="h-2 w-[2px] bg-current" />
                              <span className="h-3 w-[2px] bg-current" />
                              <span className="h-1.5 w-[2px] bg-current" />
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              {index + 1}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-border p-4">
                      <button
                        onClick={() => setGuest(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#c8cfd9] py-2.5 text-xs font-medium text-slate-500"
                      >
                        <Icon name="plus" size={15} />
                        Add guest
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-2 border-t border-border bg-slate-50 py-3 text-[10px] text-slate-500">
                      <Icon name="queue" size={13} />
                      Agenda order · Click a speaker to select
                    </div>
                  </section>
                  <section className={`${panel} overflow-hidden`}>
                    <div className="flex items-center justify-between border-b border-border px-5 py-4">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Icon name="clock" size={16} />
                        Live timer
                      </div>
                      <span className="flex items-center gap-1.5 rounded-full bg-[#edf6ef] px-2 py-1 text-[9px] font-medium text-[#267c3e]">
                        <span className="size-1 rounded-full bg-[#2ecc5f]" />
                        Synced to device
                      </span>
                    </div>
                    <div className="px-6 pb-6 pt-7 text-center">
                      <p className="text-[9px] font-semibold tracking-[1.5px] text-slate-400">
                        NOW SPEAKING
                      </p>
                      <h2 className="mt-2 text-[22px] font-semibold">
                        {current.name}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {current.role}{" "}
                        <span className="mx-1.5 text-slate-300">/</span>{" "}
                        {formatTime(current.min)} – {formatTime(current.max)}
                      </p>
                      <div className="mt-8 font-mono text-[66px] font-medium leading-none tracking-[-3px] sm:text-[76px]">
                        {formatTime(seconds).padStart(5, "0")}
                      </div>
                      <div className="my-5 flex items-center justify-center gap-2 text-[11px] font-medium">
                        <span
                          className={`size-2 rounded-full ${
                            state === "red"
                              ? "bg-[#ff4d4d]"
                              : state === "yellow"
                                ? "bg-[#ffd21f]"
                                : state === "green"
                                  ? "bg-[#2ecc5f]"
                                  : "bg-slate-400"
                          }`}
                        />
                        {state === "ready"
                          ? "Before green"
                          : state === "green"
                            ? "Within time"
                            : state === "yellow"
                              ? "Approaching time limit"
                              : "Time limit reached"}
                      </div>
                      <div className="flex gap-1.5">
                        <div
                          className={`h-[5px] flex-1 rounded-full ${
                            seconds >= current.min
                              ? "bg-[#2ecc5f]"
                              : "bg-[#e7ebef]"
                          }`}
                        />
                        <div
                          className={`h-[5px] flex-1 rounded-full ${
                            seconds >= current.mid
                              ? "bg-[#ffd21f]"
                              : "bg-[#e7ebef]"
                          }`}
                        />
                        <div
                          className={`h-[5px] flex-1 rounded-full ${
                            seconds >= current.max
                              ? "bg-[#ff4d4d]"
                              : "bg-[#e7ebef]"
                          }`}
                        />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {[
                          ["Green", current.min, "bg-[#2ecc5f]"],
                          ["Yellow", current.mid, "bg-[#ffd21f]"],
                          ["Red", current.max, "bg-[#ff4d4d]"],
                        ].map(([label, time, color]) => (
                          <div
                            key={String(label)}
                            className="rounded-lg border border-border p-2.5"
                          >
                            <p className="flex items-center justify-center gap-1.5 text-[9px] text-slate-500">
                              <span
                                className={`size-1.5 rounded-full ${color}`}
                              />
                              {label}
                            </p>
                            <p className="mt-1 font-mono text-xs font-medium">
                              {formatTime(Number(time))}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 flex gap-3">
                        <button
                          onClick={() => setRunning(!running)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1f5fbf] py-3 text-xs font-semibold text-white hover:bg-[#184e9f]"
                        >
                          <Icon name={running ? "pause" : "play"} size={16} />
                          {running
                            ? "Pause"
                            : seconds === 0
                              ? "Start"
                              : "Resume"}
                        </button>
                        <button
                          onClick={stop}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border py-3 text-xs font-semibold hover:bg-slate-50"
                        >
                          <Icon name="stop" size={15} />
                          Stop
                        </button>
                      </div>
                      <div className="mt-5 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          Catch up
                        </span>
                        <div className="flex gap-2">
                          {[5, 10, 30].map((amount) => (
                            <button
                              key={amount}
                              onClick={() =>
                                setSeconds((value) => value + amount)
                              }
                              className="rounded-md border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-slate-50"
                            >
                              +{amount}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => choose((selected + 1) % speakers.length)}
                      className="flex w-full items-center justify-between border-t border-border bg-slate-50 px-5 py-4 text-[11px]"
                    >
                      <span className="text-slate-500">
                        Up next{" "}
                        <span className="ml-2 font-medium text-foreground">
                          {speakers[(selected + 1) % speakers.length].name}
                        </span>
                      </span>
                      <Icon name="arrow" size={15} />
                    </button>
                  </section>
                  <div className="space-y-4">
                    <section className={panel}>
                      <div className="flex items-center justify-between border-b border-border px-5 py-4">
                        <h2 className="text-xs font-semibold">Your Tommy</h2>
                        <span className="size-1.5 rounded-full bg-[#2ecc5f]" />
                      </div>
                      <div className="px-3 pt-3">
                        <DeviceDrawing />
                      </div>
                      <div className="px-5 pb-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">
                            Tommy · Riverside
                          </p>
                          <span className="rounded bg-[#edf6ef] px-1.5 py-1 text-[9px] text-[#267c3e]">
                            Online
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Firmware v1.2.0
                        </p>
                        <div className="mt-4 flex justify-between border-t border-border pt-3 text-[10px] text-slate-500">
                          <span>
                            Wi-Fi{" "}
                            <span className="ml-1 font-medium text-foreground">
                              Strong
                            </span>
                          </span>
                          <span>
                            Battery{" "}
                            <span className="ml-1 font-mono text-foreground">
                              86%
                            </span>
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setPage("Device")}
                        className="flex w-full items-center justify-center gap-2 border-t border-border py-3 text-[10px] font-medium text-[#1f5fbf]"
                      >
                        Device settings
                        <Icon name="arrow" size={12} />
                      </button>
                    </section>
                    <section className={`${panel} p-5`}>
                      <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                        <Icon name="sound" size={16} />A clear signal. For
                        everyone.
                      </div>
                      <p className="text-[11px] leading-[1.8] text-slate-500">
                        Tommy’s light mirrors your timer, so speakers can stay
                        focused on their words.
                      </p>
                      <button
                        onClick={() => setPage("Settings")}
                        className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-[#1f5fbf]"
                      >
                        Adjust timing cues
                        <Icon name="arrow" size={12} />
                      </button>
                    </section>
                  </div>
                </div>
                <section className={`${panel} mt-5`}>
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <h2 className="text-xs font-semibold">Meeting progress</h2>
                    <span className="text-[10px] text-slate-500">
                      2 of 5 segments complete
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-5">
                    {[
                      "Opening",
                      "Table Topics",
                      "Prepared speeches",
                      "Evaluations",
                      "Closing",
                    ].map((segment, index) => (
                      <div key={segment}>
                        <div
                          className={`mb-3 h-1 rounded-full ${
                            index < 2
                              ? "bg-[#1f5fbf]"
                              : index === 2
                                ? "bg-[#91b2e2]"
                                : "bg-[#e9ecf1]"
                          }`}
                        />
                        <div className="flex items-center gap-2 text-[11px] font-medium">
                          <span
                            className={`flex size-4 items-center justify-center rounded-full ${
                              index < 2
                                ? "bg-[#edf3fc] text-[#1f5fbf]"
                                : "text-slate-400"
                            }`}
                          >
                            {index < 2 ? (
                              <Icon name="check" size={10} />
                            ) : (
                              index + 1
                            )}
                          </span>
                          {segment}
                        </div>
                        <p className="mt-1.5 pl-6 text-[9px] text-slate-400">
                          {
                            [
                              "7:00 – 7:10",
                              "7:10 – 7:25",
                              "7:25 – 7:55",
                              "7:55 – 8:20",
                              "8:20 – 8:30",
                            ][index]
                          }{" "}
                          PM
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          {pack === "App" && page === "Meetings" && (
            <div className="grid gap-5 md:grid-cols-2">
              <section className={`${panel} p-6`}>
                <p className="text-xs text-[#1f5fbf]">TODAY · 6 OCTOBER</p>
                <h2 className="mt-4 text-xl font-semibold">
                  October club meeting
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Riverside Toastmasters · 7:00 – 8:30 PM
                </p>
                <p className="mt-6 text-xs text-slate-500">
                  6 speakers · 5 segments · Tommy connected
                </p>
                <button
                  onClick={() => setPage("Live timer")}
                  className="mt-6 rounded-lg bg-[#1f5fbf] px-5 py-3 text-xs text-white"
                >
                  Open meeting →
                </button>
              </section>
              <section className={`${panel} p-6`}>
                <h2 className="text-sm font-semibold">Import your agenda</h2>
                <p className="mt-3 text-sm text-slate-500">
                  Scan an agenda photo, then review speakers and thresholds.
                </p>
                <label className="mt-6 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-8 text-sm text-[#1f5fbf]">
                  <Icon name="scan" />
                  Choose agenda image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        setScanReview(true)
                        setNotice(
                          "Demo review loaded. Image recognition is not connected.",
                        )
                      }
                    }}
                  />
                </label>
                <button
                  onClick={() => setScanReview(true)}
                  className="mt-4 text-xs text-[#1f5fbf]"
                >
                  Preview editable review
                </button>
              </section>
              {scanReview && (
                <section className={`${panel} p-6 md:col-span-2`}>
                  <h2 className="mb-4 font-semibold">
                    Review agenda{" "}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      Demo content · confirm before timing
                    </span>
                  </h2>
                  {speakers.map((speaker, index) => (
                    <div
                      key={index}
                      className="mb-3 flex flex-wrap items-center gap-3"
                    >
                      <input
                        aria-label={`Speaker ${index + 1} name`}
                        value={speaker.name}
                        onChange={(event) =>
                          setSpeakers((list) =>
                            list.map((item, idx) =>
                              idx === index
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="rounded-lg border border-border bg-transparent p-3 text-xs"
                      />
                      <span className="text-xs text-slate-500">
                        {speaker.role}
                      </span>
                      {(["min", "mid", "max"] as const).map((key) => (
                        <label key={key} className="text-[10px] text-slate-500">
                          {key}
                          <input
                            aria-label={`${speaker.name} ${key} seconds`}
                            type="number"
                            value={speaker[key]}
                            onChange={(event) =>
                              setSpeakers((list) =>
                                list.map((item, idx) =>
                                  idx === index
                                    ? {
                                        ...item,
                                        [key]: Math.max(
                                          0,
                                          Number(event.target.value),
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                            className="ml-2 w-20 rounded border border-border bg-transparent p-2 text-xs"
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setScanReview(false)
                      setPage("Speaker queue")
                    }}
                    className="mt-4 rounded-lg bg-[#1f5fbf] px-4 py-3 text-xs text-white"
                  >
                    Confirm agenda
                  </button>
                </section>
              )}
            </div>
          )}
          {pack === "App" && page === "Timer’s report" && (
            <section className={`${panel} p-6`}>
              <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">
                  October meeting · Timer’s report
                </h2>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if ("speechSynthesis" in window)
                        window.speechSynthesis.speak(
                          new SpeechSynthesisUtterance(
                            speakers
                              .filter((s) => s.done)
                              .map((s) => `${s.name}, ${s.role}, ${s.result}`)
                              .join(". "),
                          ),
                        )
                    }}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    <Icon name="sound" size={15} />
                    Read aloud
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 rounded-lg bg-[#1f5fbf] px-3 py-2 text-xs text-white"
                  >
                    <Icon name="download" size={15} />
                    Export PDF
                  </button>
                </div>
              </div>
              {["Table Topics", "Speeches", "Evaluations"].map((group) => (
                <div key={group} className="mb-7">
                  <h3 className="mb-3 text-xs font-semibold text-slate-500">
                    {group}
                  </h3>
                  {speakers
                    .filter((s) =>
                      group === "Table Topics"
                        ? s.role === "Table Topics"
                        : group === "Evaluations"
                          ? s.role === "Evaluation"
                          : ["Icebreaker", "Prepared speech"].includes(s.role),
                    )
                    .map((s) => {
                      const result = s.result
                        .split(":")
                        .reduce((total, part) => total * 60 + Number(part), 0)
                      return (
                        <div
                          key={s.name}
                          className="flex items-center justify-between border-t border-border py-4 text-sm"
                        >
                          <span>
                            {s.name}
                            <span className="ml-4 text-xs text-slate-500">
                              {s.role}
                            </span>
                          </span>
                          <span className="flex items-center gap-6">
                            <span className="font-mono">{s.result || "—"}</span>
                            <span className="text-xs text-slate-500">
                              {!s.done
                                ? "Not timed"
                                : result >= s.min && result <= s.max
                                  ? "Within time · Yes"
                                  : "Within time · No"}
                            </span>
                          </span>
                        </div>
                      )
                    })}
                </div>
              ))}
            </section>
          )}
          {pack === "App" && (page === "Settings" || page === "Device") && (
            <div className="grid gap-5 md:grid-cols-2">
              <section className={`${panel} p-6`}>
                <h2 className="font-semibold">Tommy · Riverside</h2>
                <DeviceDrawing />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Connected via Wi-Fi</span>
                  <span>86% battery · Firmware 1.2.0</span>
                </div>
                <p className="mt-5 text-xs leading-6 text-slate-500">
                  Timing cues are mirrored on the speaker-facing diffuser. Your
                  meeting log is saved locally on this device.
                </p>
              </section>
              <section className={`${panel} p-6`}>
                <h2 className="mb-6 font-semibold">Timing & accessibility</h2>
                {[
                  "Colour-blind cues",
                  "Disqualification mode",
                  "Voice announcements",
                ].map((label, index) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-border py-5"
                  >
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {
                          [
                            "Show labels alongside every colour",
                            "Flag speakers past the red threshold",
                            "Announce timer status changes",
                          ][index]
                        }
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={settings[index]}
                      aria-label={label}
                      onClick={() =>
                        setSettings((values) =>
                          values.map((value, idx) =>
                            idx === index ? !value : value,
                          ),
                        )
                      }
                      className={`flex h-6 w-11 items-center rounded-full p-1 ${
                        settings[index]
                          ? "justify-end bg-[#1f5fbf]"
                          : "bg-slate-300"
                      }`}
                    >
                      <span className="size-4 rounded-full bg-white" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setDark(!dark)}
                  className="mt-5 flex w-full items-center justify-between text-sm"
                >
                  App appearance{" "}
                  <span className="rounded-lg border border-border p-2 text-xs">
                    {dark ? "Dark" : "Light"} · Switch
                  </span>
                </button>
              </section>
            </div>
          )}
          {pack === "Device" && (
            <div className="grid gap-5 md:grid-cols-2">
              <section className={`${panel} p-6`}>
                <div className="flex justify-between">
                  <h2 className="text-sm font-semibold">01 / Product view</h2>
                  <span className="font-mono text-[10px] text-slate-400">
                    REV A
                  </span>
                </div>
                <DeviceDrawing engineering />
                <p className="mt-5 text-xs leading-6 text-slate-500">
                  Charcoal matte enclosure · 65° operator face · 4-inch portrait
                  touchscreen. USB-C power and charging, recessed power switch,
                  underside speaker grille, four rubber feet.
                </p>
              </section>
              <section className={`${panel} p-6`}>
                <h2 className="text-sm font-semibold">
                  02 / Speaker-facing signals
                </h2>
                <div className="my-12 flex justify-around">
                  {[
                    ["Green", "bg-[#2ecc5f]"],
                    ["Yellow", "bg-[#ffd21f]"],
                    ["Red", "bg-[#ff4d4d]"],
                  ].map(([label, color]) => (
                    <div key={label} className="text-center">
                      <div className="rounded-xl bg-[#1b1f27] p-5">
                        <div
                          className={`size-16 rounded-full border-4 border-white/25 ${color}`}
                        />
                        <p className="mt-3 text-[10px] text-white">tommy.</p>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="rounded-lg bg-[#f8f1e5] p-4 text-xs leading-6 text-[#7c6130]">
                  Engineering review: a 120 mm diffuser cannot fit a 110 mm wide
                  body. Increase rear width to ≥132 mm, or use a ≤98 mm
                  diffuser. Dimensions are conceptual, not fabrication-ready.
                </p>
              </section>
              <section className={`${panel} p-6`}>
                <h2 className="mb-6 text-sm font-semibold">
                  03 / Exploded assembly
                </h2>
                <div className="space-y-3">
                  {[
                    "Front shell · matte PETG, 2.4 mm walls",
                    "4-inch touchscreen · M2.5 standoffs",
                    "Mainboard · insulated mounting plate",
                    "Battery · protected cell, serviceable bracket",
                    "Speaker · gasket-isolated mounting",
                    "RGB LED ring · diffusion gap 12–18 mm",
                    "Frosted diffuser · 2 mm opal acrylic",
                    "Rear shell · diffuser slot, M3 inserts",
                  ].map((label, index) => (
                    <div key={label} className="flex items-center gap-4">
                      <span className="flex h-8 w-20 -skew-y-6 items-center justify-center rounded border border-slate-400 bg-[#e6e9ee] font-mono text-[10px]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="h-px w-6 bg-slate-300" />
                      <span className="text-xs text-slate-500">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-xs leading-6 text-slate-500">
                  Print shells at 0.2 mm layers. Allow 0.3 mm mating clearance.
                  Add ventilation near the LED driver; confirm thermal
                  performance before production.
                </p>
              </section>
              <section className={`${panel} p-6`}>
                <h2 className="text-sm font-semibold">
                  04 / Room-scale visibility
                </h2>
                <svg
                  viewBox="0 0 420 230"
                  className="my-7 w-full"
                  aria-label="15 metre visibility diagram"
                >
                  <path d="M30 30h360v155H30z" fill="none" stroke="#c3cbd5" />
                  <path
                    d="M80 60 350 80M80 60 350 165"
                    stroke="#b0d9b9"
                    strokeDasharray="4 4"
                  />
                  <rect
                    x="47"
                    y="43"
                    width="55"
                    height="10"
                    rx="2"
                    fill="#1b1f27"
                  />
                  <circle cx="75" cy="43" r="7" fill="#2ecc5f" />
                  {[95, 125, 155].map((y) =>
                    [210, 250, 290, 330, 365].map((x) => (
                      <rect
                        key={`${x}-${y}`}
                        x={x}
                        y={y}
                        width="12"
                        height="12"
                        rx="3"
                        fill="#e2e6ec"
                      />
                    )),
                  )}
                  <circle cx="135" cy="75" r="6" fill="#1f5fbf" />
                  <path d="M75 205h290m-290-5v10m290-10v10" stroke="#7b8390" />
                  <text x="185" y="224" fontSize="11" fill="#7b8390">
                    15 m sight line
                  </text>
                  <text x="46" y="25" fontSize="10" fill="#7b8390">
                    Tommy
                  </text>
                  <text x="115" y="60" fontSize="10" fill="#7b8390">
                    Speaker
                  </text>
                </svg>
                <p className="text-xs leading-6 text-slate-500">
                  Rear diffuser faces the audience and speaker. Validate signal
                  recognition at 15 m under 300–500 lux ambient light. Avoid
                  direct sunlight; labels supplement colour on the operator
                  display.
                </p>
              </section>
            </div>
          )}
          {pack === "Components" && (
            <div className="grid gap-5 md:grid-cols-3">
              {["Green", "Yellow", "Red"].map((label, index) => (
                <section key={label} className={`${panel} p-6`}>
                  <p className="text-[10px] tracking-widest text-slate-500">
                    TIMER / {label.toUpperCase()}
                  </p>
                  <p className="my-8 font-mono text-5xl">
                    {["04:32", "05:15", "06:00"][index]}
                  </p>
                  <div
                    className={`mb-4 h-2 rounded-full ${["bg-[#2ecc5f]", "bg-[#ffd21f]", "bg-[#ff4d4d]"][index]}`}
                  />
                  <p className="text-sm font-semibold">
                    {
                      [
                        "Within time",
                        "Approaching time limit",
                        "Time limit reached",
                      ][index]
                    }
                  </p>
                  <p className="mt-3 text-xs leading-6 text-slate-500">
                    Colour + explicit status label. 16 px container corners, 8
                    px spacing increments.
                  </p>
                  <button
                    onClick={() => {
                      setPack("App")
                      setPage("Live timer")
                      setSeconds([272, 315, 360][index])
                      setSelected(2)
                    }}
                    className="mt-6 rounded-lg border border-border px-3 py-2 text-xs text-[#1f5fbf]"
                  >
                    Preview live state →
                  </button>
                </section>
              ))}
            </div>
          )}
          {pack === "Colours & type" && (
            <div className="grid gap-5 md:grid-cols-2">
              <section className={`${panel} p-6`}>
                <h2 className="mb-6 text-sm font-semibold">
                  Functional palette
                </h2>
                {[
                  ["Charcoal", "#1B1F27", "bg-[#1b1f27]"],
                  ["Accent blue", "#1F5FBF", "bg-[#1f5fbf]"],
                  ["Green", "#2ECC5F", "bg-[#2ecc5f]"],
                  ["Yellow", "#FFD21F", "bg-[#ffd21f]"],
                  ["Red", "#FF4D4D", "bg-[#ff4d4d]"],
                ].map(([label, hex, color]) => (
                  <div
                    key={hex}
                    className="flex items-center gap-4 border-b border-border py-4"
                  >
                    <span className={`size-10 rounded-lg ${color}`} />
                    <span className="text-sm">{label}</span>
                    <span className="ml-auto font-mono text-xs text-slate-500">
                      {hex}
                    </span>
                  </div>
                ))}
                <p className="mt-5 text-xs leading-6 text-slate-500">
                  Timer colours are signals, never body text. Pair with charcoal
                  text and explicit status labels for contrast and non-colour
                  recognition.
                </p>
              </section>
              <section className={`${panel} p-6`}>
                <p className="text-xs text-slate-500">UI / INTER</p>
                <h2 className="mt-5 text-4xl font-semibold">
                  Calm. Clear. Precise.
                </h2>
                <p className="mt-5 text-sm leading-7">
                  Designed to keep the meeting moving, without taking attention
                  away from the speaker.
                </p>
                <p className="mt-10 text-xs text-slate-500">
                  TIMER / JETBRAINS MONO
                </p>
                <p className="my-6 font-mono text-6xl">04:32</p>
                <div className="mt-10 border-t border-border pt-5 text-xs leading-7 text-slate-500">
                  8 px spacing grid · 12–16 px corner radii
                  <br />
                  UI: 12 / 14 / 16 / 24 / 32 px
                  <br />
                  Timer: 64–80 px · medium weight
                </div>
              </section>
            </div>
          )}
          <footer className="mt-7 flex items-center justify-between text-[9px] text-slate-400">
            <span>Designed to keep the focus on the speaker.</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1 rounded-full bg-[#2ecc5f]" />
              Local log saved · Tommy v1.0
            </span>
          </footer>
        </main>
      </div>
      {guest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1b1f27]/40 p-5"
          onClick={() => setGuest(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Add guest"
            className="w-full max-w-[390px] rounded-2xl border border-border bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">Add a guest</h2>
              <button aria-label="Close dialog" onClick={() => setGuest(false)}>
                ✕
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              A fresh voice for Table Topics.
            </p>
            <label className="mt-6 block text-xs font-medium">
              Guest name
              <input
                autoFocus
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addGuest()
                  if (event.key === "Escape") setGuest(false)
                }}
                placeholder="e.g. Taylor Brooks"
                className="mt-2 w-full rounded-lg border border-border bg-transparent p-3 text-sm"
              />
            </label>
            <p className="mb-2 mt-5 text-[10px] text-slate-500">
              RECENT GUESTS
            </p>
            <div className="flex gap-2">
              {["Taylor Brooks", "Sam Rivera"].map((name) => (
                <button
                  key={name}
                  onClick={() => setGuestName(name)}
                  className="rounded-lg border border-border p-2 text-xs"
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              onClick={addGuest}
              disabled={!guestName.trim()}
              className="mt-6 w-full rounded-lg bg-[#1f5fbf] py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Add to queue
            </button>
          </section>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#1b1f27] px-6 py-4 text-xs text-white shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  )
}
function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="px-3 sm:border-r sm:border-border">
      <p className="text-[9px] font-semibold tracking-[1.2px] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
      <p className="mt-1 text-[10px] text-slate-500">{sub}</p>
    </div>
  )
}
export default App

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { createBroadcastOutput, createLocalStorageChannel, linkLost, type DisplayFrame, type FrameChannel } from "./signal-channel"

/** Two windows of the same site: a write in one fires a storage event in the other. */
function twoWindows() {
  const store = new Map<string, string>()
  const receiver = new EventTarget() as Window
  const storage = {
    setItem(key: string, value: string) {
      store.set(key, value)
      receiver.dispatchEvent(new StorageEvent("storage", { key, newValue: value }))
    },
    getItem: (key: string) => store.get(key) ?? null,
  } as Storage
  return {
    sender: createLocalStorageChannel("tommy-test", storage, new EventTarget() as Window),
    receiver: createLocalStorageChannel("tommy-test", storage, receiver),
  }
}

afterEach(() => vi.useRealTimers())

describe("localStorage fallback channel", () => {
  it("delivers every frame to the other window, including repeated identical ones", () => {
    const { sender, receiver } = twoWindows()
    const received: unknown[] = []
    receiver.subscribe(message => received.push(message))
    sender.post({ kind: "hello" })
    sender.post({ kind: "hello" })
    expect(received).toEqual([{ kind: "hello" }, { kind: "hello" }])
  })
})

describe("broadcast output", () => {
  function memoryChannel() {
    const listeners = new Set<(message: Parameters<FrameChannel["post"]>[0]) => void>()
    const sent: Parameters<FrameChannel["post"]>[0][] = []
    const channel: FrameChannel = {
      post: message => void sent.push(message),
      subscribe: listener => (listeners.add(listener), () => void listeners.delete(listener)),
      close: () => listeners.clear(),
    }
    return { channel, sent, hello: () => listeners.forEach(listener => listener({ kind: "hello" })) }
  }
  const frames = (sent: { kind: string; frame?: DisplayFrame }[]) => sent.flatMap(message => (message.kind === "frame" ? [message.frame!] : []))

  it("sends a frame on each change, repeats it as a heartbeat, and answers a new window at once", () => {
    vi.useFakeTimers()
    let now = 1_000
    const { channel, sent, hello } = memoryChannel()
    const output = createBroadcastOutput(channel, () => now)
    output.setSignal("green", { contest: false, person: "Ada" })
    expect(frames(sent).at(-1)).toMatchObject({ seq: 1, signal: "green", details: { person: "Ada" } })

    now = 2_000
    vi.advanceTimersByTime(1_000)
    expect(frames(sent).at(-1)).toMatchObject({ seq: 2, sentAt: 2_000, signal: "green" })

    hello()
    expect(frames(sent).at(-1)).toMatchObject({ seq: 3, signal: "green" })

    output.close()
    vi.advanceTimersByTime(5_000)
    expect(frames(sent)).toHaveLength(3)
  })
})

describe("link status", () => {
  it("is lost after more than 2 seconds without a frame", () => {
    expect(linkLost(undefined, 0)).toBe(true)
    expect(linkLost(1_000, 3_000)).toBe(false)
    expect(linkLost(1_000, 3_001)).toBe(true)
  })
})

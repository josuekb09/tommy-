import { beforeEach, describe, expect, it, vi } from "vitest"
import { _setSharedAudioContextForTesting, playThresholdTone, unlockAudio } from "./audio"

describe("audio alert lifecycle", () => {
  beforeEach(() => {
    _setSharedAudioContextForTesting(undefined)
  })

  it("handles environment without AudioContext gracefully", () => {
    // In node/vitest default environment, window.AudioContext is undefined
    expect(playThresholdTone()).toBe(false)
    expect(() => unlockAudio()).not.toThrow()
  })

  it("does not play when AudioContext is suspended (browser autoplay policy)", () => {
    const mockCtx = {
      state: "suspended",
      resume: vi.fn().mockResolvedValue(undefined),
    } as unknown as AudioContext

    _setSharedAudioContextForTesting(mockCtx)
    expect(playThresholdTone()).toBe(false)

    unlockAudio()
    expect(mockCtx.resume).toHaveBeenCalled()
  })

  it("plays tone when AudioContext is running", () => {
    const mockOsc = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }
    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      },
      connect: vi.fn()
    }
    const mockCtx = {
      state: "running",
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn().mockReturnValue(mockOsc),
      createGain: vi.fn().mockReturnValue(mockGain)
    } as unknown as AudioContext

    _setSharedAudioContextForTesting(mockCtx)
    const played = playThresholdTone()
    expect(played).toBe(true)
    expect(mockOsc.start).toHaveBeenCalled()
    expect(mockOsc.stop).toHaveBeenCalledWith(10.15)
  })
})

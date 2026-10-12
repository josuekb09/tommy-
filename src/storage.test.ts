import { describe, expect, it } from "vitest"
import { findCurrentMeeting } from "./storage"
import type { Meeting } from "./engine/types"

describe("findCurrentMeeting", () => {
  const meetingOld: Meeting = {
    id: "uuid-aaa-old",
    date: "2026-09-01",
    title: "September Meeting",
    segments: []
  }

  const meetingMid: Meeting = {
    id: "uuid-zzz-mid",
    date: "2026-10-01",
    title: "October Meeting",
    segments: []
  }

  const meetingNew: Meeting = {
    id: "uuid-bbb-new",
    date: "2026-10-08",
    title: "Recent Meeting",
    segments: []
  }

  it("returns undefined when no meetings exist", () => {
    expect(findCurrentMeeting([])).toBeUndefined()
  })

  it("restores the exact meeting matching currentMeetingId even if older", () => {
    const list = [meetingOld, meetingMid, meetingNew]
    expect(findCurrentMeeting(list, "uuid-aaa-old")).toBe(meetingOld)
    expect(findCurrentMeeting(list, "uuid-zzz-mid")).toBe(meetingMid)
  })

  it("falls back to the newest meeting by date when currentMeetingId is omitted", () => {
    // Note: ID order in array would put meetingOld first or meetingMid last, but date sorting picks meetingNew
    const list = [meetingOld, meetingMid, meetingNew]
    expect(findCurrentMeeting(list)).toBe(meetingNew)
  })

  it("falls back to the newest meeting by date if currentMeetingId does not match any meeting", () => {
    const list = [meetingOld, meetingMid, meetingNew]
    expect(findCurrentMeeting(list, "non-existent-id")).toBe(meetingNew)
  })
})

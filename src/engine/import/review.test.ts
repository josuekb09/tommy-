import { describe, expect, it } from "vitest"
import { defaultRules } from "../profiles"
import { buildDraft } from "./build"
import { acceptFlag, applySuggestion, canConfirm, itemsOf, moveDraftItem, openFlags, removeItem, renameItem, startReview, summarizeCorrections } from "./review"
import { reviewSample } from "./samples"

const draft = () => buildDraft(reviewSample, { rules: defaultRules, people: [] })
const keyOf = (review: ReturnType<typeof startReview>, name: string) => itemsOf(review.draft).find(item => item.personName === name)!.key

describe("scan review", () => {
  it("lists every flag and only allows confirming once each is fixed or kept", () => {
    let review = startReview(draft())
    // Non-timed items (Grammarian, Timer, Toastmaster) are collapsed in OtherRolesSection; their flags don't block confirmation.
    expect(openFlags(review).map(({ item, flag }) => [item.personName || item.role, flag.field])).toEqual([
      ["Ada Lovel", "person"],
      ["Speaker", "person"],
    ])
    expect(canConfirm(review)).toBe(false)

    // applySuggestion works on non-timed items too; it just isn't required for confirmation.
    const variant = keyOf(review, "Tia Timmer")
    review = applySuggestion(review, variant, 0)
    expect(itemsOf(review.draft).find(item => item.key === variant)!.personName).toBe("Tia Timer")

    // Typing the name resolves the speaker's "No name" flag.
    const unnamed = itemsOf(review.draft).find(item => item.role === "Speaker" && !item.personName)!.key
    review = renameItem(review, unnamed, "Ben Byte")
    expect(openFlags(review)).toHaveLength(1)

    // Keeping a flag as read resolves it but keeps it in the review.
    review = acceptFlag(review, keyOf(review, "Ada Lovel"), 0)
    expect(openFlags(review)).toEqual([])
    expect(canConfirm(review)).toBe(true)
    expect(itemsOf(review.draft).find(item => item.personName === "Ada Lovel")!.flags).toHaveLength(1)
  })

  it("removing a speech drops its evaluator's pairing and says so", () => {
    let review = startReview(draft())
    const ada = keyOf(review, "Ada Lovel")
    expect(itemsOf(review.draft).find(item => item.personName === "Eve One")!.evaluatesKey).toBe(ada)
    review = acceptFlag(review, ada, 0)
    review = removeItem(review, ada)
    const eve = itemsOf(review.draft).find(item => item.personName === "Eve One")!
    expect(eve.evaluatesKey).toBeUndefined()
    expect(eve.flags.at(-1)!.message).toBe("Was evaluating Ada Lovel, which you removed.")
    expect(openFlags(review).map(({ item }) => item.personName)).toContain("Eve One")
  })

  it("moves inside a section and counts the corrections", () => {
    const original = draft()
    let review = startReview(original)
    const speakers = () => original.segments.find(segment => segment.kind === "prepared_speeches")!
    const first = speakers().items.find(item => item.role === "Speaker")!.key
    review = moveDraftItem(review, first, 1)
    const order = review.draft.segments.find(segment => segment.kind === "prepared_speeches")!.items.map(item => item.key)
    expect(order.indexOf(first)).toBe(speakers().items.findIndex(item => item.key === first) + 1)
    review = applySuggestion(review, keyOf(review, "Tia Timmer"), 0)
    review = removeItem(review, keyOf(review, "Tom Master"))
    expect(summarizeCorrections(original, review, 1)).toEqual({ renamed: 1, removed: 1, moved: 2, suggestionsApplied: 1, flagsAccepted: 0 })
  })
})

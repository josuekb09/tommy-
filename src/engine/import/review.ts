import type { DraftItem, Flag, ImportDraft } from "./build"

/**
 * The Timer's review of a scanned draft: one-tap fixes, accepted flags,
 * name edits, deletes and moves. Pure: every change returns a new draft.
 * A flag stays open until its suggestion is applied, the field it is about
 * is edited, or the Timer accepts it as it is.
 */

export type Review = { draft: ImportDraft; accepted: ReadonlySet<string> }

export const startReview = (draft: ImportDraft): Review => ({ draft, accepted: new Set() })

export const flagId = (item: Pick<DraftItem, "key">, index: number) => `${item.key}#${index}`

export const itemsOf = (draft: ImportDraft) => draft.segments.flatMap(segment => segment.items)

/** The flags still waiting for the Timer, with their item. Only timed items block confirmation; non-timed items are collapsed in OtherRolesSection with no flag UI. */
export function openFlags(review: Review): { item: DraftItem; flag: Flag; id: string }[] {
  return itemsOf(review.draft)
    .filter(item => item.timed !== false)
    .flatMap(item => item.flags.map((flag, index) => ({ item, flag, id: flagId(item, index) })).filter(({ id }) => !review.accepted.has(id)))
}

export const canConfirm = (review: Review) => openFlags(review).length === 0 && itemsOf(review.draft).length > 0

const mapItem = (draft: ImportDraft, key: string, change: (item: DraftItem) => DraftItem): ImportDraft => ({
  ...draft,
  segments: draft.segments.map(segment => ({ ...segment, items: segment.items.map(item => (item.key === key ? change(item) : item)) })),
})

/** Applies a flag's suggestion. That flag is resolved; the item's other flags stay. */
export function applySuggestion(review: Review, key: string, index: number): Review {
  const item = itemsOf(review.draft).find(candidate => candidate.key === key)
  const suggestion = item?.flags[index]?.suggestion
  if (!suggestion) return review
  return {
    draft: mapItem(review.draft, key, current => ({ ...current, ...suggestion.patch, flags: current.flags.filter((_, i) => i !== index) })),
    accepted: renumber(review.accepted, key, index),
  }
}

/** Keeps the item as read; the flag is kept in the review, marked accepted. */
export function acceptFlag(review: Review, key: string, index: number): Review {
  return { ...review, accepted: new Set([...review.accepted, `${key}#${index}`]) }
}

/** A typed name replaces the printed one; flags about the name are resolved, and the link to a member is dropped unless they pick one again. */
export function renameItem(review: Review, key: string, personName: string): Review {
  let removed: number[] = []
  const draft = mapItem(review.draft, key, item => {
    removed = item.flags.flatMap((flag, i) => (flag.field === "person" ? [i] : []))
    const { personId: _personId, guest: _guest, ...rest } = item
    void _personId
    void _guest
    return { ...rest, personName, flags: item.flags.filter(flag => flag.field !== "person") }
  })
  return { draft, accepted: removed.reduceRight((accepted, index) => renumber(accepted, key, index), review.accepted) }
}

/** Removes an item. Anyone who evaluated it loses the pairing and gets a flag saying so. */
export function removeItem(review: Review, key: string): Review {
  const removed = itemsOf(review.draft).find(item => item.key === key)
  if (!removed) return review
  const draft: ImportDraft = {
    ...review.draft,
    segments: review.draft.segments
      .map(segment => ({
        ...segment,
        items: segment.items
          .filter(item => item.key !== key)
          .map(item => {
            if (item.evaluatesKey !== key) return item
            const { evaluatesKey: _evaluatesKey, ...rest } = item
            void _evaluatesKey
            const who = removed.personName || "the removed item"
            return { ...rest, flags: [...item.flags, { field: "pairing" as const, message: `Was evaluating ${who}, which you removed.` }] }
          }),
      }))
      .filter(segment => segment.items.length > 0),
  }
  return { draft, accepted: new Set([...review.accepted].filter(id => !id.startsWith(`${key}#`))) }
}

/** Moves an item one place up or down inside its section. */
export function moveDraftItem(review: Review, key: string, direction: -1 | 1): Review {
  const draft: ImportDraft = {
    ...review.draft,
    segments: review.draft.segments.map(segment => {
      const from = segment.items.findIndex(item => item.key === key)
      const to = from + direction
      if (from < 0 || to < 0 || to >= segment.items.length) return segment
      const items = [...segment.items]
      ;[items[from], items[to]] = [items[to], items[from]]
      return { ...segment, items }
    }),
  }
  return { ...review, draft }
}

/** After flag `index` of `key` is removed, accepted ids of later flags shift down by one. */
function renumber(accepted: ReadonlySet<string>, key: string, index: number): Set<string> {
  const next = new Set<string>()
  for (const id of accepted) {
    const [owner, at] = id.split("#")
    const n = Number(at)
    if (owner !== key) next.add(id)
    else if (n > index) next.add(`${key}#${n - 1}`)
    else if (n < index) next.add(id)
  }
  return next
}

export type CorrectionSummary = { renamed: number; removed: number; moved: number; suggestionsApplied: number; flagsAccepted: number }

/** How the confirmed agenda differs from what was read, counted per kind of change. */
export function summarizeCorrections(original: ImportDraft, final: Review, applied: number): CorrectionSummary {
  const before = new Map(itemsOf(original).map(item => [item.key, item]))
  const after = itemsOf(final.draft)
  const orderBefore = itemsOf(original)
    .map(item => item.key)
    .filter(key => after.some(item => item.key === key))
  return {
    renamed: after.filter(item => before.has(item.key) && before.get(item.key)!.personName !== item.personName).length,
    removed: before.size - after.length,
    moved: orderBefore.filter((key, i) => after[i]?.key !== key).length,
    suggestionsApplied: applied,
    flagsAccepted: final.accepted.size,
  }
}

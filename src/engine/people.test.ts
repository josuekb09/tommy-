import { describe, expect, it } from "vitest"
import { editDistance, matchPeople, normalizeName, type Person } from "./people"

const people: Person[] = [
  { id: "1", name: "Josué Kabuya", kind: "member" },
  { id: "2", name: "Ada Lovelace", kind: "member" },
  { id: "3", name: "Maria van Rooyen", aliases: ["Ria"], kind: "member" },
  { id: "4", name: "Ed Stone", kind: "member" },
  { id: "5", name: "Al Grant", kind: "guest" },
  { id: "6", name: "Kim Austen", kind: "guest" },
]
const suggest = (query: string) => matchPeople(query, people).map(match => match.person.name)

describe("lenient name matching", () => {
  it("normalizes case, accents, punctuation and spacing", () => {
    expect(normalizeName("  José-KABUYA ")).toBe("jose kabuya")
    expect(normalizeName("Núñez,  María")).toBe("nunez maria")
  })

  it("counts a swap of neighbouring letters as one edit", () => {
    expect(editDistance("kabuya", "kabuya")).toBe(0)
    expect(editDistance("kabuya", "kabyua")).toBe(1)
    expect(editDistance("kabuya", "kubaya")).toBe(2)
    expect(editDistance("kabuya", "kambuya")).toBe(1)
  })

  it.each(["Kabuya", "kabuya", "Kubaya", "Kambuya", "Kabuyá", "josue", "Josue Kabuya", "kabuya josué", "Kab"])("suggests Josué Kabuya for “%s”", query => {
    expect(suggest(query)[0]).toBe("Josué Kabuya")
  })

  it("matches aliases and the start of any word", () => {
    expect(suggest("Ria")).toEqual(["Maria van Rooyen"])
    expect(suggest("van roo")).toEqual(["Maria van Rooyen"])
    expect(suggest("Aust")).toEqual(["Kim Austen"])
  })

  it("puts the same name first and says so", () => {
    const [first] = matchPeople("ADA LOVELACE", people)
    expect(first).toMatchObject({ person: { name: "Ada Lovelace" }, sameName: true })
    expect(matchPeople("Ada Lovelase", people)[0]).toMatchObject({ person: { name: "Ada Lovelace" }, sameName: false })
  })

  it("never stretches short words into other names, and needs every typed word to match", () => {
    expect(suggest("Al")).toEqual(["Al Grant"])
    expect(suggest("Ex")).toEqual([])
    expect(suggest("Ada Kabuya")).toEqual([])
    expect(suggest("Zebedee")).toEqual([])
    expect(suggest("")).toEqual([])
  })
})

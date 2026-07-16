import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date))
}

export function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

const ROUND_LABELS: Record<number, string> = {
  1: "Final",
  2: "Semi-finals",
  3: "Quarter-finals",
  4: "Round of 16",
  5: "Round of 32",
  6: "Round of 64",
  7: "Round of 128",
}

export function getRoundLabel(roundNumber: number, totalRounds: number): string {
  const fromFinal = totalRounds - roundNumber + 1
  return ROUND_LABELS[fromFinal] || `Round ${roundNumber}`
}

export function getBracketSideLabel(
  side: string,
  roundNumber?: number,
  maxLosersRound?: number,
): string {
  if (side === "grand_final") return "Grand Final"
  if (side === "third_place") return "3rd Place"
  if (side === "losers" && roundNumber != null && maxLosersRound != null) {
    const lbIndex = roundNumber - 1
    const isTypeA = lbIndex % 2 === 0
    const totalWBRounds = Math.floor(maxLosersRound / 2) + 1
    if (isTypeA) {
      if (lbIndex === 0) return "WB R1 Losers"
      return `Compression ${Math.floor(lbIndex / 2)}`
    } else {
      const wbRound = Math.floor(lbIndex / 2) + 2
      if (wbRound === totalWBRounds) return "WB Final Drop"
      return `WB R${wbRound} Drop`
    }
  }
  if (side === "losers") return "Losers"
  return ""
}

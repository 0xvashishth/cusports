import type {
  BracketSide,
  BracketType,
  EntityType,
  SlotPosition,
} from "@/lib/types"
import { generateDoubleElimination } from "./bracket-engine-double"

export interface Participant {
  id: string
  entityType: EntityType
  name?: string
}

export interface BracketMatchInput {
  bracketSide: BracketSide
  roundNumber: number
  matchIndex: number
  playerAId: string | null
  playerAType: EntityType | null
  playerBId: string | null
  playerBType: EntityType | null
  isBye: boolean
  status: "pending" | "scheduled" | "completed"
  winnerId: string | null
  winnerNextMatchIndex: number | null
  winnerNextSlot: SlotPosition | null
  loserNextMatchIndex: number | null
  loserNextSlot: SlotPosition | null
}

export interface BracketResult {
  matches: BracketMatchInput[]
  participantCount: number
  bracketSize: number
  totalRounds: number
}

function nextPowerOf2(n: number): number {
  if (n <= 0) return 1
  let p = 1
  while (p < n) p *= 2
  return p
}

/**
 * Standard tournament seed placement algorithm.
 * Given N participants, returns an array of length bracketSize where each
 * position contains the seed index (0-based) or -1 for a bye.
 * Uses the recursive algorithm that ensures seed 1 vs 2 meet only in final.
 */
function createSeededBracket(participantCount: number): number[] {
  const bracketSize = nextPowerOf2(participantCount)
  const totalRounds = Math.log2(bracketSize)

  // Build the bracket order for bracketSize using recursive seeding
  // For bracketSize=2: [0, 1]
  // For bracketSize=4: [0, 3, 1, 2]
  // For bracketSize=8: [0, 7, 3, 4, 1, 6, 2, 5]
  const positions = buildSeededPositions(bracketSize)

  // Map positions to seed indices or bye (-1)
  return positions.map((pos) => (pos < participantCount ? pos : -1))
}

function buildSeededPositions(size: number): number[] {
  if (size === 1) return [0]
  if (size === 2) return [0, 1]

  const half = size / 2
  const top = buildSeededPositions(half)

  // Mirror: for each position in top half, the corresponding bottom half position
  // is (size - 1 - originalPosition)
  const bottom = top.map((p) => size - 1 - p)

  // Interleave: top[0], bottom[0], top[1], bottom[1], ...
  const result: number[] = []
  for (let i = 0; i < half; i++) {
    result.push(top[i])
    result.push(bottom[i])
  }
  return result
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Generate all bracket matches for a single or double elimination bracket.
 */
export function generateBracket(
  participants: Participant[],
  bracketType: BracketType,
  options: {
    seedingMethod: "ranked" | "random" | "manual"
    byeHandling: "top_seeds_get_byes" | "random_byes"
    thirdPlaceMatch: boolean
  },
): BracketResult {
  if (participants.length < 2) {
    return { matches: [], participantCount: participants.length, bracketSize: 0, totalRounds: 0 }
  }

  // Order participants by seeding method
  let ordered: Participant[]
  if (options.seedingMethod === "random") {
    ordered = shuffleArray(participants)
  } else {
    // ranked and manual both use the provided order (manual = manager's drag order)
    ordered = [...participants]
  }

  const bracketSize = nextPowerOf2(ordered.length)
  const totalRounds = Math.log2(bracketSize)
  const byeCount = bracketSize - ordered.length

  // Assign byes to top seeds or random seeds
  let byeParticipants: Set<string>
  if (options.byeHandling === "random_byes") {
    const shuffledIds = shuffleArray(ordered.map((p) => p.id))
    byeParticipants = new Set(shuffledIds.slice(0, byeCount))
  } else {
    // top_seeds_get_byes: first N participants (highest seeds) get byes
    byeParticipants = new Set(ordered.slice(0, byeCount).map((p) => p.id))
  }

  // Create seeded bracket slots
  const bracketSlots = createSeededBracket(ordered.length)
  const participantMap = new Map(ordered.map((p) => [p.id, p]))

  // Place participants into first-round match slots
  const firstRoundSlots: (Participant | null)[] = []
  for (const slotIdx of bracketSlots) {
    if (slotIdx === -1) {
      firstRoundSlots.push(null)
    } else {
      firstRoundSlots.push(ordered[slotIdx])
    }
  }

  if (bracketType === "single_elimination") {
    return generateSingleElimination(
      firstRoundSlots,
      bracketSize,
      totalRounds,
      byeParticipants,
      participantMap,
      options.thirdPlaceMatch,
    )
  } else {
    return generateDoubleElimination(
      firstRoundSlots,
      bracketSize,
      totalRounds,
      byeParticipants,
      participantMap,
    )
  }
}

function generateSingleElimination(
  firstRoundSlots: (Participant | null)[],
  bracketSize: number,
  totalRounds: number,
  byeParticipants: Set<string>,
  participantMap: Map<string, Participant>,
  thirdPlaceMatch: boolean,
): BracketResult {
  const matches: BracketMatchInput[] = []

  // Create all rounds
  for (let round = 0; round < totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round + 1)

    for (let m = 0; m < matchesInRound; m++) {
      let playerAId: string | null = null
      let playerAType: EntityType | null = null
      let playerBId: string | null = null
      let playerBType: EntityType | null = null
      let isBye = false
      let status: "pending" | "scheduled" | "completed" = round === 0 ? "scheduled" : "pending"
      let winnerId: string | null = null

      if (round === 0) {
        const seedA = firstRoundSlots[m * 2]
        const seedB = firstRoundSlots[m * 2 + 1]

        if (seedA && seedB) {
          playerAId = seedA.id
          playerAType = seedA.entityType
          playerBId = seedB.id
          playerBType = seedB.entityType
        } else if (seedA && !seedB) {
          // Bye for seedA
          playerAId = seedA.id
          playerAType = seedA.entityType
          isBye = true
          status = "completed"
          winnerId = seedA.id
        } else if (!seedA && seedB) {
          playerBId = seedB.id
          playerBType = seedB.entityType
          isBye = true
          status = "completed"
          winnerId = seedB.id
        } else {
          // Both null — shouldn't happen with proper seeding
          continue
        }
      }

      const matchInput: BracketMatchInput = {
        bracketSide: "single",
        roundNumber: round + 1,
        matchIndex: m,
        playerAId,
        playerAType,
        playerBId,
        playerBType,
        isBye,
        status,
        winnerId,
        winnerNextMatchIndex: null,
        winnerNextSlot: null,
        loserNextMatchIndex: null,
        loserNextSlot: null,
      }
      matches.push(matchInput)
    }
  }

  // Wire winner_next pointers for each round except the last
  for (let round = 0; round < totalRounds - 1; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round + 1)
    const nextMatchesInRound = matchesInRound / 2

    for (let m = 0; m < matchesInRound; m++) {
      const match = matches.find(
        (x) => x.roundNumber === round + 1 && x.matchIndex === m,
      )
      if (!match) continue

      const nextMatch = matches.find(
        (x) => x.roundNumber === round + 2 && x.matchIndex === Math.floor(m / 2),
      )
      if (!nextMatch) continue

      match.winnerNextMatchIndex = m
      match.winnerNextSlot = m % 2 === 0 ? "A" : "B"
    }
  }

  // Fix winnerNextMatchIndex to use the actual match's position within the round
  // We need to reference matches by their matchIndex in the next round
  for (const match of matches) {
    if (match.winnerNextMatchIndex !== null) {
      match.winnerNextMatchIndex = Math.floor(match.matchIndex / 2)
    }
  }

  // Pre-fill bye winners into next round
  for (const match of matches) {
    if (match.isBye && match.winnerId && match.roundNumber === 1) {
      const nextMatch = matches.find(
        (x) => x.roundNumber === 2 && x.matchIndex === Math.floor(match.matchIndex / 2),
      )
      if (nextMatch) {
        const p = participantMap.get(match.winnerId)
        if (match.matchIndex % 2 === 0) {
          nextMatch.playerAId = match.winnerId
          nextMatch.playerAType = p?.entityType || "player"
        } else {
          nextMatch.playerBId = match.winnerId
          nextMatch.playerBType = p?.entityType || "player"
        }
      }
    }
  }

  // Third place match
  if (thirdPlaceMatch && totalRounds >= 2) {
    const semifinalRound = totalRounds - 1
    const semifinalMatches = matches.filter((x) => x.roundNumber === semifinalRound)

    if (semifinalMatches.length >= 2) {
      const thirdPlaceMatch: BracketMatchInput = {
        bracketSide: "third_place",
        roundNumber: 1,
        matchIndex: 0,
        playerAId: null,
        playerAType: null,
        playerBId: null,
        playerBType: null,
        isBye: false,
        status: "pending",
        winnerId: null,
        winnerNextMatchIndex: null,
        winnerNextSlot: null,
        loserNextMatchIndex: null,
        loserNextSlot: null,
      }
      matches.push(thirdPlaceMatch)

      // Wire loser_next from semifinal losers to third place match
      for (const sf of semifinalMatches) {
        sf.loserNextMatchIndex = 0
        sf.loserNextSlot = sf.matchIndex === 0 ? "A" : "B"
      }
    }
  }

  // Compute total rounds (including third place if applicable)
  const maxRound = Math.max(...matches.map((m) => m.roundNumber))

  return {
    matches,
    participantCount: firstRoundSlots.filter(Boolean).length,
    bracketSize,
    totalRounds: maxRound,
  }
}


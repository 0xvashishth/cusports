import type {
  EntityType,
  SlotPosition,
} from "@/lib/types"
import type { BracketMatchInput, BracketResult, Participant } from "./bracket-engine"

/**
 * Generate a double-elimination bracket.
 *
 * LB structure (for WB with R rounds):
 *   LB Round 1 (Type A): WB R1 losers compress (floor(N/2) matches, odd player gets bye)
 *   LB Round 2 (Type B): WB R2 losers merge with LB R1 survivors
 *   LB Round 3 (Type A): compress LB R2 survivors
 *   LB Round 4 (Type B): WB R3 losers merge with LB R3 survivors
 *   ...
 *   LB Round 2*(R-1) (Type B): WB R final loser merges with last compression survivors → Grand Final
 *
 * Type B wbDropRound: WB round whose losers drop into this LB round.
 *   LB index 1 → WB R2, index 3 → WB R3, index 5 → WB R4, etc.
 *   Formula: wbDropRound = floor(lbRound / 2) + 2
 *
 * WB loser target LB roundNumber:
 *   WB R1 → LB roundNumber 1 (Type A)
 *   WB R(k) for 2 ≤ k < R → LB roundNumber 2*(k-1) (Type B)
 *   WB R(R) final → last LB round
 */
export function generateDoubleElimination(
  firstRoundSlots: (Participant | null)[],
  bracketSize: number,
  totalRounds: number,
  byeParticipants: Set<string>,
  participantMap: Map<string, Participant>,
): BracketResult {
  const matches: BracketMatchInput[] = []

  // ── Winners Bracket ────────────────────────────────────────────────
  const wbNonByeCounts: number[] = []

  for (let round = 0; round < totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round + 1)
    let nonByeCount = 0

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
          continue
        }
      }

      if (!isBye) nonByeCount++

      matches.push({
        bracketSide: "winners",
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
      })
    }

    wbNonByeCounts.push(nonByeCount)
  }

  // Wire WB winner_next (same as single elimination)
  for (let round = 0; round < totalRounds - 1; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round + 1)
    for (let m = 0; m < matchesInRound; m++) {
      const match = matches.find(
        (x) => x.bracketSide === "winners" && x.roundNumber === round + 1 && x.matchIndex === m,
      )
      if (!match) continue
      match.winnerNextMatchIndex = Math.floor(m / 2)
      match.winnerNextSlot = m % 2 === 0 ? "A" : "B"
    }
  }

  // ── Losers Bracket ─────────────────────────────────────────────────
  //
  // Alternates between:
  //   Type A (compression): pair up LB survivors, half advance
  //   Type B (drop): WB losers merge with LB survivors
  //
  // The last Type B round receives WB final losers directly.

  interface LBRoundDef {
    type: "A" | "B"
    matchCount: number
    lbSurvivorsBefore: number
    wbDropRound?: number
  }

  const lbRoundDefs: LBRoundDef[] = []
  let lbSurvivors = wbNonByeCounts[0] // WB R1 real-match losers start the LB

  const totalLBRounds = 2 * (totalRounds - 1)

  for (let lbRound = 0; lbRound < totalLBRounds; lbRound++) {
    const isTypeA = lbRound % 2 === 0

    if (isTypeA) {
      const matchCount = Math.ceil(lbSurvivors / 2)
      lbRoundDefs.push({ type: "A", matchCount, lbSurvivorsBefore: lbSurvivors })
      lbSurvivors = matchCount
    } else {
      // FIX: +2 instead of +1
      const wbDropRound = Math.floor(lbRound / 2) + 2
      const wbDroppers = wbDropRound <= totalRounds ? (wbNonByeCounts[wbDropRound - 1] || 0) : 0
      const totalPlayers = lbSurvivors + wbDroppers
      const matchCount = Math.max(1, Math.ceil(totalPlayers / 2))
      lbRoundDefs.push({ type: "B", matchCount, lbSurvivorsBefore: lbSurvivors, wbDropRound })
      lbSurvivors = matchCount
    }
  }

  // Create LB matches (all with null players, filled at runtime)
  for (let lbIdx = 0; lbIdx < lbRoundDefs.length; lbIdx++) {
    const def = lbRoundDefs[lbIdx]
    for (let m = 0; m < def.matchCount; m++) {
      matches.push({
        bracketSide: "losers",
        roundNumber: lbIdx + 1, // 1-based
        matchIndex: m,
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
      })
    }
  }

  // Wire LB winner_next (within LB, to the next LB round)
  for (let lbIdx = 0; lbIdx < lbRoundDefs.length - 1; lbIdx++) {
    const def = lbRoundDefs[lbIdx]
    const lbMatches = matches.filter(
      (x) => x.bracketSide === "losers" && x.roundNumber === lbIdx + 1,
    )

    for (let m = 0; m < lbMatches.length; m++) {
      const match = lbMatches[m]
      if (def.type === "A") {
        // Type A → next is Type B: 1:1 mapping, each winner takes slot A in drop round
        match.winnerNextMatchIndex = m
        match.winnerNextSlot = "A"
      } else {
        // Type B → next is Type A: merge pattern (half the matches)
        match.winnerNextMatchIndex = Math.floor(m / 2)
        match.winnerNextSlot = m % 2 === 0 ? "A" : "B"
      }
    }
  }

  // Wire last LB round winner → Grand Final slot B
  const lastLBIdx = lbRoundDefs.length - 1
  const lastLBMatches = matches.filter(
    (x) => x.bracketSide === "losers" && x.roundNumber === lastLBIdx + 1,
  )
  if (lastLBMatches.length > 0) {
    lastLBMatches[0].winnerNextMatchIndex = 0
    lastLBMatches[0].winnerNextSlot = "B"
  }

  // ── Wire WB losers → LB drop points ───────────────────────────────
  //
  // WB R1 real (non-bye) losers → LB Round 1 (Type A), pair them up
  // WB R(k) for 2 ≤ k < R → LB Type B round at index 2*(k-1)-1, roundNumber 2*(k-1)
  // WB R(R) final loser → last LB round, slot B

  // WB R1 losers → LB R1 (Type A, compression)
  {
    const wbR1Matches = matches.filter(
      (x) => x.bracketSide === "winners" && x.roundNumber === 1 && !x.isBye,
    )
    const lbR1Matches = matches.filter(
      (x) => x.bracketSide === "losers" && x.roundNumber === 1,
    )

    for (let i = 0; i < wbR1Matches.length; i++) {
      const wbMatch = wbR1Matches[i]
      const targetLbMatchIdx = Math.floor(i / 2)
      const slot: SlotPosition = i % 2 === 0 ? "A" : "B"
      if (targetLbMatchIdx < lbR1Matches.length) {
        wbMatch.loserNextMatchIndex = targetLbMatchIdx
        wbMatch.loserNextSlot = slot
      }
    }
  }

  // WB R2+ losers → LB Type B drop rounds
  for (let wbRound = 2; wbRound <= totalRounds; wbRound++) {
    if (wbRound === totalRounds) {
      // WB final loser → last LB round, slot B
      const wbFinal = matches.find(
        (x) => x.bracketSide === "winners" && x.roundNumber === totalRounds,
      )
      if (wbFinal && !wbFinal.isBye) {
        wbFinal.loserNextMatchIndex = 0
        wbFinal.loserNextSlot = "B"
      }
      continue
    }

    // FIX: correct target LB round index = 2*(wbRound-1) - 1
    const targetLBRoundIdx = (wbRound - 1) * 2 - 1
    if (targetLBRoundIdx >= lbRoundDefs.length) continue

    const lbDropRoundNumber = targetLBRoundIdx + 1 // 1-based
    const lbDropMatches = matches.filter(
      (x) => x.bracketSide === "losers" && x.roundNumber === lbDropRoundNumber,
    )

    const wbMatches = matches.filter(
      (x) => x.bracketSide === "winners" && x.roundNumber === wbRound && !x.isBye,
    )

    const def = lbRoundDefs[targetLBRoundIdx]
    const lbSurvivorCount = def.lbSurvivorsBefore

    // FIX: Correct slot assignment — first lbSurvivorCount WB losers pair with LB survivors (slot B),
    // excess WB losers pair with each other (slot A then B)
    for (let i = 0; i < wbMatches.length; i++) {
      let targetMatchIdx: number
      let slot: SlotPosition

      if (i < lbSurvivorCount) {
        // Paired with LB survivor (who occupies slot A via winner_next)
        targetMatchIdx = i
        slot = "B"
      } else {
        // Excess WB losers pair up in remaining matches
        const excessIdx = i - lbSurvivorCount
        targetMatchIdx = lbSurvivorCount + Math.floor(excessIdx / 2)
        slot = excessIdx % 2 === 0 ? "A" : "B"
      }

      if (targetMatchIdx < lbDropMatches.length) {
        wbMatches[i].loserNextMatchIndex = targetMatchIdx
        wbMatches[i].loserNextSlot = slot
      }
    }
  }

  // Pre-fill bye winners into WB round 2
  for (const match of matches) {
    if (match.isBye && match.winnerId && match.bracketSide === "winners" && match.roundNumber === 1) {
      const nextMatch = matches.find(
        (x) =>
          x.bracketSide === "winners" &&
          x.roundNumber === 2 &&
          x.matchIndex === Math.floor(match.matchIndex / 2),
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

  // ── Grand Final ────────────────────────────────────────────────────
  const grandFinal: BracketMatchInput = {
    bracketSide: "grand_final",
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
  matches.push(grandFinal)

  // Wire WB final winner → Grand Final slot A
  const wbFinal = matches.find(
    (x) => x.bracketSide === "winners" && x.roundNumber === totalRounds,
  )
  if (wbFinal) {
    wbFinal.winnerNextMatchIndex = 0
    wbFinal.winnerNextSlot = "A"
  }

  const maxRound = Math.max(...matches.map((m) => m.roundNumber))

  return {
    matches,
    participantCount: firstRoundSlots.filter(Boolean).length,
    bracketSize,
    totalRounds: maxRound,
  }
}

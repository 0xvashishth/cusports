import type {
  BracketSide,
  BracketType,
  EntityType,
  GrandFinalMode,
  SlotPosition,
} from "@/lib/types"

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
    grandFinalMode: GrandFinalMode
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
      options.grandFinalMode,
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

function generateDoubleElimination(
  firstRoundSlots: (Participant | null)[],
  bracketSize: number,
  totalRounds: number,
  byeParticipants: Set<string>,
  participantMap: Map<string, Participant>,
  grandFinalMode: GrandFinalMode,
): BracketResult {
  const matches: BracketMatchInput[] = []

  // --- Winners Bracket (same as single elimination) ---
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
  }

  // Wire winners bracket winner_next
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

  // --- Losers Bracket ---
  // LB has 2*(totalRounds - 1) rounds
  // Type A: LB survivors play each other (compression round)
  // Type B: LB survivors play WB droppers
  const lbRoundCount = 2 * (totalRounds - 1)

  for (let lbRound = 0; lbRound < lbRoundCount; lbRound++) {
    const isTypeA = lbRound % 2 === 0
    let matchesInRound: number

    if (isTypeA) {
      // Type A: same number of matches as the WB round they correspond to at this stage
      // LB round 0: matches from WB round 1 losers, same count as WB round 1
      // LB round 2: half of previous LB round's matches
      if (lbRound === 0) {
        matchesInRound = bracketSize / 2
      } else {
        // Previous LB round's match count / 2
        const prevCount = getLBMatchCount(lbRound - 1, bracketSize, totalRounds)
        matchesInRound = prevCount / 2
      }
    } else {
      // Type B: WB droppers join. Count = WB round (lbRound/2 + 1) match count
      const wbRoundForThisDrop = Math.floor(lbRound / 2) + 1
      if (wbRoundForThisDrop <= totalRounds) {
        matchesInRound = bracketSize / Math.pow(2, wbRoundForThisDrop)
      } else {
        matchesInRound = 1
      }
    }

    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        bracketSide: "losers",
        roundNumber: lbRound + 1,
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

  // Wire LB winner_next
  for (let lbRound = 0; lbRound < lbRoundCount - 1; lbRound++) {
    const isTypeA = lbRound % 2 === 0
    const lbMatchesThisRound = matches.filter(
      (x) => x.bracketSide === "losers" && x.roundNumber === lbRound + 1,
    )

    for (let m = 0; m < lbMatchesThisRound.length; m++) {
      const match = lbMatchesThisRound[m]
      if (isTypeA) {
        // Type A: compression, winners go to next LB round (Type B)
        match.winnerNextMatchIndex = m
        match.winnerNextSlot = "A"
      } else {
        // Type B: winners go to next LB round (Type A)
        match.winnerNextMatchIndex = Math.floor(m / 2)
        match.winnerNextSlot = m % 2 === 0 ? "A" : "B"
      }
    }
  }

  // --- Wire WB losers to LB drop points ---
  // WB round 1 losers → LB round 1 (first type A round)
  // WB round 2 losers → LB round 2 (first type B round)
  // WB round k losers → LB round k (type B round for k >= 2)
  // WB final loser → LB final

  for (let wbRound = 1; wbRound <= totalRounds; wbRound++) {
    const wbMatches = matches.filter(
      (x) => x.bracketSide === "winners" && x.roundNumber === wbRound,
    )

    for (let m = 0; m < wbMatches.length; m++) {
      const wbMatch = wbMatches[m]

      if (wbRound === totalRounds) {
        // WB final loser goes to grand final (handled separately)
        // But they also need loser_next for the LB final
        // Actually in standard double elim, WB final loser drops to LB final
        const lbFinalRound = lbRoundCount
        wbMatch.loserNextMatchIndex = 0
        wbMatch.loserNextSlot = "B"
        // We'll set the loser_next_match_id after creating the LB final
        continue
      }

      // WB round 1: losers go to LB round 1 (Type A)
      // WB round 2+: losers go to LB round (wbRound) which is Type B
      let targetLBRound: number
      if (wbRound === 1) {
        targetLBRound = 1
      } else {
        targetLBRound = wbRound
      }

      const lbMatches = matches.filter(
        (x) => x.bracketSide === "losers" && x.roundNumber === targetLBRound,
      )

      if (wbRound === 1) {
        // WB round 1 losers feed into LB round 1 in order
        wbMatch.loserNextMatchIndex = m
        wbMatch.loserNextSlot = "B"
      } else {
        // WB round 2+ losers: each WB loser feeds into the corresponding LB match
        // The drop pattern for Type B rounds: WB losers fill slot B in order
        if (m < lbMatches.length) {
          wbMatch.loserNextMatchIndex = m
          wbMatch.loserNextSlot = "B"
        }
      }
    }
  }

  // --- LB Final ---
  const lbFinal: BracketMatchInput = {
    bracketSide: "losers",
    roundNumber: lbRoundCount + 1,
    matchIndex: 0,
    playerAId: null,
    playerAType: null,
    playerBId: null,
    playerBType: null,
    isBye: false,
    status: "pending",
    winnerId: null,
    winnerNextMatchIndex: 0,
    winnerNextSlot: "B",
    loserNextMatchIndex: null,
    loserNextSlot: null,
  }
  matches.push(lbFinal)

  // Wire the last LB round winner to LB final
  const lastLBMatches = matches.filter(
    (x) => x.bracketSide === "losers" && x.roundNumber === lbRoundCount,
  )
  if (lastLBMatches.length > 0) {
    lastLBMatches[0].winnerNextMatchIndex = 0
    lastLBMatches[0].winnerNextSlot = "A"
  }

  // Wire WB final loser to LB final (slot B)
  const wbFinal = matches.find(
    (x) => x.bracketSide === "winners" && x.roundNumber === totalRounds,
  )
  if (wbFinal) {
    wbFinal.loserNextMatchIndex = 0
    wbFinal.loserNextSlot = "B"
  }

  // --- Grand Final ---
  const grandFinal: BracketMatchInput = {
    bracketSide: "grand_final",
    roundNumber: 1,
    matchIndex: 0,
    playerAId: null, // WB winner
    playerAType: null,
    playerBId: null, // LB winner
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

  // Wire WB final winner and LB final winner to grand final
  if (wbFinal) {
    wbFinal.winnerNextMatchIndex = 0
    wbFinal.winnerNextSlot = "A"
  }
  lbFinal.winnerNextMatchIndex = 0
  lbFinal.winnerNextSlot = "B"

  // --- Grand Final Reset (if true_double_elim_reset) ---
  if (grandFinalMode === "true_double_elim_reset") {
    const resetMatch: BracketMatchInput = {
      bracketSide: "grand_final_reset",
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
    matches.push(resetMatch)
  }

  // Pre-fill bye winners
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

  const maxRound = Math.max(...matches.map((m) => m.roundNumber))

  return {
    matches,
    participantCount: firstRoundSlots.filter(Boolean).length,
    bracketSize,
    totalRounds: maxRound,
  }
}

function getLBMatchCount(lbRound: number, bracketSize: number, totalWBRounds: number): number {
  const isTypeA = lbRound % 2 === 0
  if (isTypeA) {
    if (lbRound === 0) return bracketSize / 2
    // Type A: half of previous Type B round
    return Math.ceil(getLBMatchCount(lbRound - 1, bracketSize, totalWBRounds) / 2)
  } else {
    // Type B: matches from WB drop
    const wbRound = Math.floor(lbRound / 2) + 1
    return bracketSize / Math.pow(2, wbRound)
  }
}

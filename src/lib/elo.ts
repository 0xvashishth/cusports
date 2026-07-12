export interface EloConfig {
  baseRating: number
  kFactor: number
  kFactorAfterGames: number
  gamesThreshold: number
}

export const DEFAULT_ELO_CONFIG: EloConfig = {
  baseRating: 1000,
  kFactor: 32,
  kFactorAfterGames: 16,
  gamesThreshold: 20,
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

export function getKFactor(
  matchesPlayed: number,
  config: EloConfig = DEFAULT_ELO_CONFIG
): number {
  if (matchesPlayed < config.gamesThreshold) {
    return config.kFactor
  }
  return config.kFactorAfterGames
}

export function calculateNewRating(
  currentRating: number,
  opponentRating: number,
  score: number,
  matchesPlayed: number,
  config: EloConfig = DEFAULT_ELO_CONFIG
): number {
  const expected = expectedScore(currentRating, opponentRating)
  const k = getKFactor(matchesPlayed, config)
  return Math.round(currentRating + k * (score - expected))
}

export function calculateMatchResult(
  winnerRating: number,
  loserRating: number,
  winnerMatchesPlayed: number,
  loserMatchesPlayed: number,
  config: EloConfig = DEFAULT_ELO_CONFIG
): { winnerNewRating: number; loserNewRating: number } {
  const winnerNew = calculateNewRating(
    winnerRating,
    loserRating,
    1,
    winnerMatchesPlayed,
    config
  )
  const loserNew = calculateNewRating(
    loserRating,
    winnerRating,
    0,
    loserMatchesPlayed,
    config
  )
  return { winnerNewRating: winnerNew, loserNewRating: loserNew }
}

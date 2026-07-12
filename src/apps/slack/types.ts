export interface SlackMatchReport {
  slackUserId: string
  slackUserEmail: string | null
  opponentName: string
  games: { score_a: number; score_b: number }[]
  channelId: string
  teamId: string
}

export interface SlackCommandResult {
  success: boolean
  message: string
  blocks?: object[]
}

export interface ResolvedPlayers {
  reporterId: string
  reporterName: string
  opponentId: string
  opponentName: string
}

export interface ResolvedMatch {
  matchId: string
  tournamentCategoryId: string
  playerAId: string
  playerBId: string
  status: string
  tournamentName: string | null
  categoryName: string | null
}

export interface ScoreValidation {
  valid: boolean
  error?: string
  winnerId?: string
  loserId?: string
  gameWins: { a: number; b: number }
}

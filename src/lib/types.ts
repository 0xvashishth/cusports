export type PlatformRole = "admin" | "manager" | "player"
export type OrgRole = "manager" | "player"
export type MemberStatus = "invited" | "active"
export type MatchStatus = "pending" | "scheduled" | "ongoing" | "completed" | "walkover" | "cancelled"
export type ApprovalStatus = "n/a" | "pending" | "approved"
export type ReportedVia = "manager" | "slack" | "player"
export type TournamentStatus = "draft" | "published" | "completed"
export type RankingModel = "elo" | "points"
export type EntityType = "player" | "pair"
export type FormatType = "knockout" | "round_robin" | "group_knockout"
export type BracketType = "single_elimination" | "double_elimination"
export type SeedingMethod = "ranked" | "random" | "manual"
export type ByeHandling = "top_seeds_get_byes" | "random_byes"
export type BracketSide = "winners" | "losers" | "grand_final" | "third_place" | "single"
export type SlotPosition = "A" | "B"

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  platform_role: PlatformRole
  created_at: string
}

export interface Organization {
  id: string
  slug: string
  name: string
  logo_url: string | null
  banner_url: string | null
  theme: Record<string, string>
  ranking_model: RankingModel
  ranking_config: Record<string, unknown>
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface OrgMember {
  id: string
  organization_id: string
  profile_id: string
  org_role: OrgRole
  status: MemberStatus
  created_at: string
  profile?: Profile
}

export interface Category {
  id: string
  organization_id: string
  name: string
  is_doubles: boolean
}

export interface Ranking {
  id: string
  organization_id: string
  category_id: string
  entity_id: string
  entity_type: EntityType
  rating: number | null
  points: number | null
  matches_played: number
  wins: number
  losses: number
  updated_at: string
  player?: Profile
  category?: Category
}

export interface Tournament {
  id: string
  organization_id: string
  name: string
  banner_url: string | null
  start_date: string
  end_date: string
  status: TournamentStatus
}

export interface TournamentCategory {
  id: string
  tournament_id: string
  category_id: string
  points_per_game: number
  games_per_match: number
  win_by_two: boolean
  format_type: FormatType
  category?: Category
}

export interface TournamentEntry {
  id: string
  tournament_id: string
  profile_id: string
  category_id: string
  seed: number | null
  created_at: string
  profile?: Profile
}

export interface FixturesConfig {
  id: string
  tournament_category_id: string
  bracket_type: BracketType
  seeding_method: SeedingMethod
  bye_handling: ByeHandling
  third_place_match: boolean
  generated_at: string | null
}

export interface Seed {
  id: string
  tournament_category_id: string
  entity_id: string
  entity_type: EntityType
  seed_number: number
}

export interface BracketMatch {
  id: string
  tournament_category_id: string
  bracket_side: BracketSide
  round_number: number
  match_index: number
  player_a_id: string | null
  player_a_type: EntityType | null
  player_b_id: string | null
  player_b_type: EntityType | null
  is_bye: boolean
  status: MatchStatus
  winner_id: string | null
  loser_id: string | null
  winner_next_match_id: string | null
  winner_next_slot: SlotPosition | null
  loser_next_match_id: string | null
  loser_next_slot: SlotPosition | null
  scheduled_at: string | null
  created_at: string
  player_a?: Profile
  player_b?: Profile
  games?: MatchGame[]
}

export interface Match {
  id: string
  organization_id: string
  tournament_id: string
  category_id: string
  round: string | null
  player_a_id: string
  player_b_id: string
  is_bye: boolean
  scheduled_at: string | null
  status: MatchStatus
  winner_id: string | null
  reported_via: ReportedVia
  approval_status: ApprovalStatus
  created_at: string
  tournament?: Tournament
  category?: Category
  player_a?: Profile
  player_b?: Profile
  games?: MatchGame[]
}

export interface MatchGame {
  id: string
  match_id: string | null
  bracket_match_id: string | null
  game_number: number
  score_a: number
  score_b: number
}

export interface Announcement {
  id: string
  organization_id: string
  title: string
  body: string
  image_url: string | null
  link_url: string | null
  starts_at: string
  ends_at: string
  created_by: string
}

export interface OrgIntegration {
  id: string
  organization_id: string
  slack_team_id: string | null
  slack_channel_id: string | null
  slack_bot_token_encrypted: string | null
}

export interface ActivityLog {
  id: string
  organization_id: string
  actor_id: string
  action: string
  details: Record<string, unknown>
  created_at: string
}

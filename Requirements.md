# Build Prompt: Multi-Tenant Table Tennis Tournament & Ranking Platform

Use this as a full engineering brief / prompt for building the product with **Next.js (App Router) + Supabase**. It is organized so you can feed it section-by-section to a coding agent or hand it to a dev team.

---

## 1. Product Summary

A multi-tenant SaaS platform for table tennis organizations to run tournaments, manage players, record match results, and maintain organization-specific rankings — styled similarly to the ITTF/WTT public ranking and event pages. A platform Admin provisions organizations; each organization gets its own themed micro-site, its own manager(s), its own player pool, its own matches, and its own ranking tables. A Slack bot lets players and managers announce tournaments and report scores conversationally.

---

## 2. Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Supabase (Postgres, Auth, Row Level Security, Storage, Edge Functions, Realtime)
- **Auth**: Supabase Auth (email/password + magic link); custom `profiles` table for roles
- **Multi-tenancy**: Path or subdomain based (`/org/[orgSlug]/...` to start; subdomains like `orgslug.yourapp.com` as a v2 option)
- **Storage**: Supabase Storage for organization logos/banners
- **Realtime**: Supabase Realtime channels for live match score updates
- **Integrations**: Slack (Bolt SDK or Slack Web API + Events API), deployed as a Next.js API route / Supabase Edge Function acting as the Slack request handler
- **Hosting**: Vercel (Next.js) + Supabase Cloud

---

## 3. Roles & Access Model

| Role | Scope | Key Powers |
|---|---|---|
| **Admin** | Global (platform) | Create/suspend organizations, create the first Manager per org, view all orgs, no per-org data editing by default |
| **Manager** | Exactly one organization | Manage theme/branding, manage other managers, add/invite players, create tournaments & fixtures, enter/approve match results, manage announcement banners, configure ranking & format rules |
| **Player (User)** | Can belong to many organizations | View org page, view own profile/ranking, view fixtures, report own match results (goes to pending approval or auto-applies per org setting), interact with Slack bot |

**Membership model**: a player is linked to organizations via a join table (`org_members`), because the same physical person can play in multiple orgs with independent rankings. Admin and Manager roles are platform-level/org-level flags, not membership rows — a Manager row still references exactly one `organization_id`.

### Row Level Security direction
- `organizations`: readable publicly (for their public page) if `is_active`; writable only by Admin (create) and that org's Manager (update).
- `org_members`, `players`, `matches`, `rankings`, `announcements`: scoped by `organization_id`; Manager of that org has full write; players have read for their org(s) and limited write (their own reported scores, pending state).
- Use Postgres RLS policies keyed off a `current_org_role()` helper function reading from `auth.uid()`.

---

## 4. Organization Provisioning (Admin Flow)

1. Admin fills: org name, slug (unique, used in URL), initial Manager email + name.
2. System creates:
   - `organizations` row (slug, name, status = active, default theme)
   - Invites/creates the Manager's `profiles` row with `role = manager` and `organization_id` set
   - Sends invite email (Supabase Auth invite or magic link)
3. Manager completes onboarding: uploads org logo/banner image, picks theme colors, sets ranking & match-format rules, adds initial players.

### Theming
- Store theme as JSON on `organizations.theme`: `{ primaryColor, secondaryColor, accentColor, logoUrl, bannerUrl, font }`.
- Apply as CSS variables injected at the layout level for `/org/[slug]/*` routes (e.g., `<html style={{ '--primary': theme.primaryColor }}>`), so Tailwind utility classes reference `var(--primary)` via a small custom Tailwind config extension.
- Manager can edit theme any time from `/org/[slug]/dashboard/settings`.

---

## 5. Player & Manager Management

- **Adding players**: Manager enters **email + display name** (no images/avatars for players in v1). If the email doesn't have an account yet, create a pending invite; on first login the player claims their profile.
- **Multi-org players**: if the email already exists as a player elsewhere, just create a new `org_members` row linking the existing `profiles.id` to the new `organization_id` — do not duplicate identity.
- **Initial rankings seed**: when adding a player for the first time to a brand-new org, Manager can optionally set a starting rank/rating per category (Men's Singles, Women's Singles, Men's Doubles, Women's Doubles, Mixed Doubles). After this seed, **all further rating changes are driven only by match results** — no manual rank edits (keep an audit log if manual override is ever needed, restricted to Manager with a required reason field).
- **Adding more managers**: current Manager can promote an existing org member or invite a new email as an additional Manager for the same org (org can have multiple Managers, but a Manager account itself belongs to only one org).

---

## 6. Tournaments, Fixtures & Matches

### Tournament setup (Manager)
- Name, date range, venue, banner image, categories included (Men's Singles / Women's Singles / Men's Doubles / Women's Doubles / Mixed Doubles — configurable list per org).
- **Match format configuration per tournament (or per category within a tournament)**:
  - Points per game: 11 / 15 / 21 / custom
  - Games per match ("best of"): 1 / 3 / 5 / 7
  - Win-by-2 rule toggle (standard deuce rule)
- Draw/fixture generation: knockout, round-robin, or group + knockout; seed by current ranking.

### Match lifecycle
`scheduled` → `ongoing` → `completed` (or `walkover` / `cancelled`)

- **Upcoming matches**: `scheduled`, ordered by date/time.
- **Ongoing matches**: `ongoing`, live game-by-game score updates via Supabase Realtime so the org page score ticks live.
- **Past matches**: `completed`, with final score breakdown per game and winner.

### Recording results — two paths
1. **Manager dashboard**: form to enter game-by-game scores for a scheduled/ongoing match → validates against the tournament's configured format (e.g., must reach 11 with win-by-2, must win 3 of 5 games) → on submit, marks `completed` and triggers the ranking recalculation job.
2. **Slack bot self-report**: a player mentions the bot with a structured command, e.g.:
   ```
   @TTBot report match vs @OpponentName 11-7, 9-11, 11-5
   ```
   - Bot parses opponent + game scores, validates against the match/tournament format, and calls an internal API route (`/api/slack/report-result`) using a signed request.
   - Configurable per org: **auto-apply** immediately, or **pending opponent/Manager confirmation** before it affects rankings (recommended default: pending confirmation to prevent disputes).

---

## 7. Rankings & Points System

Ranking is **organization-specific** and **category-specific** (Men's Singles, Women's Singles, Men's Doubles, Women's Doubles, Mixed Doubles — and the org can add/rename categories).

Support two selectable models per organization (Manager configures in settings):

1. **Rating-based (ELO-style, recommended default)**
   - Each player starts at a base rating (e.g., 1000, or the Manager-seeded value).
   - After each completed match: `newRating = oldRating + K * (actualScore - expectedScore)`, where `expectedScore` is computed from the standard logistic Elo expectation formula using both players' ratings, and `K` is a configurable factor (e.g., higher K for newer/provisional players, lower K once a player has played N matches — similar in spirit to how many table tennis federations weight ratings).
   - Doubles matches update a **pair rating** and optionally a fractional contribution to each player's singles-adjacent doubles rating — keep this configurable and simple in v1 (e.g., update the pair as its own ranked entity).

2. **Points/tournament-tier based (WTT/ITTF-style points table, simplified & configurable)**
   - Manager defines a points table per tournament tier (e.g., Local, Regional, Open) awarding points for reaching each round (Winner, Final, Semi-final, Quarter-final, Round of 16, etc.), similar in structure to how the sport's professional ranking systems allocate points by result stage rather than a single match Elo delta.
   - Player's ranking = sum of best N tournament results within a rolling window (e.g., best 6 results in the last 12 months) — window length and count configurable.

- Rankings recompute automatically via a Postgres function/trigger or a Supabase Edge Function invoked after a match is marked `completed`.
- Rankings page per category: sortable table (Rank, Player, Rating/Points, Matches Played, W-L, Trend arrow vs last period).

---

## 8. Organization Public Page (ITTF-style reference)

Layout inspiration: ITTF/WTT-style event & ranking pages — clean hero banner, tab navigation, dense but scannable tables.

Sections:
1. **Hero**: org logo/banner image, name, tagline.
2. **Announcement banners**: carousel/list of Manager-managed announcements (title, body, optional image, optional link, active date range).
3. **Matches tabs**: Ongoing (live) / Upcoming / Past — filterable by category and tournament.
4. **Rankings**: tab per category (Men's Singles, Women's Singles, Men's Doubles, Women's Doubles, Mixed Doubles), sortable ranking table.
5. **Tournaments list**: current & past tournaments with drill-down to fixtures/bracket view.
6. **Player profile pages**: `/org/[slug]/players/[playerId]` — rank per category, match history, W-L record, rating trend chart.

---

## 9. Slack Bot Integration

- Slack app per organization (or one Slack app installed into multiple workspaces via OAuth — support multi-workspace install since orgs are separate tenants).
- **Tournament announcement broadcast**: when a Manager publishes a tournament (or generates fixtures), an Edge Function posts a formatted message to the org's configured Slack channel: tournament name/date, categories, and a fixtures summary/link back to the org page.
- **Score reporting via mention**: Slack Events API subscribes to `app_mention`; parse the message with a strict command grammar (documented for players), validate, then call the same internal results API used by the Manager dashboard so there's one source of truth for score validation and ranking recalculation.
- Store each org's Slack workspace/channel binding + bot token in a `org_integrations` table (encrypted token via Supabase Vault or an encrypted column).

---

## 10. Core Database Schema (Supabase/Postgres)

```sql
-- Platform-level
profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  email text unique,
  platform_role text check (platform_role in ('admin','manager','player')) default 'player',
  created_at timestamptz default now()
);

organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  banner_url text,
  theme jsonb default '{}',
  ranking_model text check (ranking_model in ('elo','points')) default 'elo',
  ranking_config jsonb default '{}', -- K-factor, window size, points table, etc.
  is_active boolean default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

org_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  profile_id uuid references profiles(id),
  org_role text check (org_role in ('manager','player')) not null,
  status text check (status in ('invited','active')) default 'invited',
  created_at timestamptz default now(),
  unique(organization_id, profile_id)
);

categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  name text not null, -- e.g., "Men's Singles"
  is_doubles boolean default false
);

rankings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  category_id uuid references categories(id),
  entity_id uuid not null, -- player_id or pair_id
  entity_type text check (entity_type in ('player','pair')),
  rating numeric,
  points numeric,
  matches_played int default 0,
  wins int default 0,
  losses int default 0,
  updated_at timestamptz default now()
);

tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  name text,
  banner_url text,
  start_date date,
  end_date date,
  tier text, -- for points model, e.g., 'local','regional','open'
  status text check (status in ('draft','published','completed')) default 'draft'
);

tournament_categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id),
  category_id uuid references categories(id),
  points_per_game int default 11,
  games_per_match int default 5, -- best of
  win_by_two boolean default true,
  format_type text check (format_type in ('knockout','round_robin','group_knockout'))
);

matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  tournament_id uuid references tournaments(id),
  category_id uuid references categories(id),
  round text,
  player_a_id uuid, -- player or pair
  player_b_id uuid,
  scheduled_at timestamptz,
  status text check (status in ('scheduled','ongoing','completed','walkover','cancelled')) default 'scheduled',
  winner_id uuid,
  reported_via text check (reported_via in ('manager','slack','player')) default 'manager',
  approval_status text check (approval_status in ('n/a','pending','approved')) default 'n/a',
  created_at timestamptz default now()
);

match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id),
  game_number int,
  score_a int,
  score_b int
);

announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  title text,
  body text,
  image_url text,
  link_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references profiles(id)
);

org_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  slack_team_id text,
  slack_channel_id text,
  slack_bot_token_encrypted text
);
```

---

## 11. API / Route Structure (Next.js App Router)

```
/app
  /admin/organizations              -- Admin: list/create orgs
  /org/[slug]                       -- public org page (hero, banners, matches, rankings)
  /org/[slug]/players/[playerId]    -- player profile
  /org/[slug]/tournaments/[id]      -- fixtures & bracket
  /org/[slug]/dashboard             -- Manager dashboard (guarded)
  /org/[slug]/dashboard/settings    -- theme, ranking rules, match-format defaults
  /org/[slug]/dashboard/players     -- add/manage players & managers
  /org/[slug]/dashboard/tournaments -- create tournaments, generate fixtures
  /org/[slug]/dashboard/matches/[id]-- enter/edit results
  /org/[slug]/dashboard/banners     -- manage announcements

/app/api
  /admin/organizations/route.ts
  /org/[slug]/matches/route.ts
  /org/[slug]/matches/[id]/result/route.ts
  /org/[slug]/rankings/recalculate/route.ts   -- called after result approval
  /slack/events/route.ts                       -- Slack Events API webhook
  /slack/report-result/route.ts                -- internal, called by slack handler & shared by manager UI
```

---

## 12. Non-Functional Requirements

- **RLS everywhere**: no table should be readable/writable without an explicit policy; test policies with each of the three roles.
- **Auditability**: keep a lightweight `activity_log` table for manual ranking overrides, result edits, and Manager promotions.
- **Realtime**: subscribe to `matches` and `match_games` changes on the org page for live score updates during ongoing matches.
- **Extensibility**: category list, ranking model, and match-format defaults must be configuration-driven per organization, not hardcoded, since different orgs will want different rules.
- **Testing priorities**: ranking recalculation correctness (unit test Elo and points-table math with fixed fixtures), RLS policy tests per role, Slack command parsing edge cases (typos, wrong format, unknown opponent).

---

## 13. Suggested Build Order

1. Supabase schema + RLS + Auth (Admin/Manager/Player roles)
2. Admin: org provisioning flow + initial Manager invite
3. Manager dashboard: theme settings, add players, add categories
4. Tournament creation + fixture generation + match-format config
5. Manager result entry + ranking recalculation engine (start with Elo model)
6. Public org page (hero, banners, matches tabs, rankings tables) styled per theme
7. Player profile pages + multi-org player support
8. Slack app: tournament announcement broadcast
9. Slack app: score self-reporting with pending-approval workflow
10. Points/tier-based ranking model as an alternate, selectable option
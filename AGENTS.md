# Cusports - Implementation Documentation

## Overview

Multi-tenant table tennis tournament and ranking platform built with Next.js (App Router) + Supabase.

## Project Structure

```
src/
├── app/
│   ├── admin/organizations/         # Admin: list/create orgs
│   ├── org/[slug]/                  # Public org page (hero, banners, matches, rankings)
│   │   ├── players/[playerId]/      # Player profile
│   │   ├── tournaments/[id]/        # Tournament detail & fixtures
│   │   └── dashboard/               # Manager dashboard
│   │       ├── settings/            # Theme, ranking rules
│   │       ├── players/             # Add/manage players & managers
│   │       ├── tournaments/         # Create tournaments, generate fixtures
│   │       ├── matches/[id]/        # Enter/edit results
│   │       ├── banners/             # Manage announcements
│   │       └── integrations/
│   │           └── slack/           # Slack workspace connection & setup guide
│   ├── auth/                        # Login, register, callback
│   └── api/                         # API routes
│       ├── admin/organizations/     # Admin org CRUD
│       ├── org/[slug]/matches/      # Match queries & creation
│       ├── org/[slug]/matches/[id]/result/  # Submit match results
│       ├── org/[slug]/rankings/recalculate/ # Trigger ranking recalculation
│       ├── slack/events/            # Slack Events API webhook
│       ├── slack/report-result/     # Slack score reporting
│       └── auth/user/               # Current user info
├── components/
│   ├── ui/                          # shadcn/ui components
│   ├── theme-provider.tsx           # Org theme CSS variable injection
│   ├── org-layout.tsx               # Public org page layout
│   └── dashboard-layout.tsx         # Manager dashboard layout
└── lib/
    ├── types.ts                     # TypeScript types for all DB tables
    ├── utils.ts                     # cn(), formatDate(), slugify()
    ├── constants.ts                 # Default categories, tier config
    ├── elo.ts                       # ELO rating calculation engine
    └── supabase/
        ├── client.ts                # Browser Supabase client
        ├── server.ts                # Server Supabase client (async cookies)
        ├── admin.ts                 # Service role admin client
        └── middleware.ts            # Auth session middleware
```

## Database Schema

All tables with RLS policies are defined in `supabase/schema.sql`.

### Core Tables
- `profiles` - Extends auth.users with roles
- `organizations` - Tenant orgs with theme, ranking config
- `org_members` - Links profiles to orgs with roles
- `categories` - Match categories per org (Men's/Women's Singles, Doubles)
- `rankings` - Per-org, per-category player/pair ratings
- `tournaments` - Tournament events
- `tournament_categories` - Category config per tournament
- `matches` - Match records with status lifecycle
- `match_games` - Individual game scores
- `announcements` - Banner announcements
- `org_integrations` - Slack workspace bindings
- `activity_log` - Audit trail

### RLS Policies
- `current_org_role(org_id)` - Helper to get role in org
- `is_platform_admin()` - Check platform admin
- Tables scoped by `organization_id` for multi-tenancy
- Public read for active orgs, manager write for their org

## Auth System

- Supabase Auth (email/password + magic link)
- `profiles` table linked to `auth.users` via trigger or manual insert
- Middleware refreshes session on all routes
- Custom `platform_role` field for admin/manager/player

## Multi-tenancy

- Path-based: `/org/[orgSlug]/...`
- RLS scopes all data by `organization_id`
- Theme injected via CSS variables on org pages

## Ranking Engine

Location: `src/lib/elo.ts`

### ELO Model (default)
- Standard logistic Elo expectation formula
- Configurable K-factor (higher for provisional players)
- Auto-recalculates on match completion
- Config per org: base rating, K factor, games threshold

### Points Model (alternative)
- Points table per tournament tier (local/regional/open)
- Best N results in rolling window
- Configured via `organizations.ranking_config`

## Key Flows

### Admin: Create Organization
1. Admin fills form (name, slug, manager email)
2. System creates org, invites manager
3. Manager completes onboarding

### Manager: Add Player
1. Enter email + name
2. System creates profile or links existing
3. Seeds initial ranking (1000 ELO or 0 points)
4. Creates org_members record

### Manager: Create Tournament
1. Set name, dates, tier
2. Select categories
3. Configure format (points per game, games per match)
4. System creates tournament and category associations

### Match Result Entry
1. Manager enters game-by-game scores
2. System validates against tournament format rules
3. Marks match completed, triggers ranking recalculation
4. Records in activity_log

### Slack Integration (Per-Org Configuration)
Each organization connects its own Slack workspace independently via the manager dashboard (`/org/[slug]/dashboard/integrations/slack`).

#### Setup (by Manager)
1. Create a Slack App at api.slack.com/apps
2. Add bot token scopes: `chat:write`, `channels:read`, `app_mentions:read`
3. Enable Event Subscriptions with URL: `{SITE_URL}/api/slack/events`, subscribe to `app_mention`
4. Install app to workspace, copy Bot Token (`xoxb-...`)
5. Invite bot to channel, copy Channel ID
6. Paste Workspace ID, Channel ID, and Bot Token in the dashboard Slack settings

#### Commands (mention the bot in Slack)
- `@BotName report match vs @Opponent 11-7, 9-11, 11-5` — Report match result
- `@BotName rankings` — View rankings
- `@BotName fixtures` — Upcoming matches

Note: Results go to pending approval by default (configurable).

## Environment Variables

See `.env.local.example` for required vars.

## Build & Deploy

- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run lint` - ESLint

## Getting Started

1. Set up Supabase project
2. Run `supabase/schema.sql` in SQL editor
3. Copy `.env.local.example` to `.env.local` and fill values
4. Run `npm run dev`

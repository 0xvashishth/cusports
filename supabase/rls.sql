-- RLS policies for public org and fixture visibility
-- Run this in Supabase SQL editor.

-- Enable RLS on the tables used by the public org view
alter table public.organizations enable row level security;
alter table public.categories enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_categories enable row level security;
alter table public.matches enable row level security;
alter table public.profiles enable row level security;
alter table public.rankings enable row level security;
alter table public.announcements enable row level security;

-- Organizations: allow public read of active organizations
drop policy if exists "public_read_active_organizations" on public.organizations;
create policy "public_read_active_organizations"
  on public.organizations
  for select
  using (is_active = true);

-- Categories: allow public read for active organizations
drop policy if exists "public_read_categories" on public.categories;
create policy "public_read_categories"
  on public.categories
  for select
  using (
    exists (
      select 1
      from public.organizations o
      where o.id = categories.organization_id
        and o.is_active = true
    )
  );

-- Tournaments: allow public read for published/completed tournaments in active orgs
drop policy if exists "public_read_visible_tournaments" on public.tournaments;
create policy "public_read_visible_tournaments"
  on public.tournaments
  for select
  using (
    status in ('published', 'completed')
    and exists (
      select 1
      from public.organizations o
      where o.id = tournaments.organization_id
        and o.is_active = true
    )
  );

-- Tournament category mappings: public read for visible tournaments
drop policy if exists "public_read_tournament_categories" on public.tournament_categories;
create policy "public_read_tournament_categories"
  on public.tournament_categories
  for select
  using (
    exists (
      select 1
      from public.tournaments t
      join public.organizations o on o.id = t.organization_id
      where t.id = tournament_categories.tournament_id
        and o.is_active = true
        and t.status in ('published', 'completed')
    )
  );

-- Matches: allow public read for visible tournaments and active orgs
drop policy if exists "public_read_public_matches" on public.matches;
create policy "public_read_public_matches"
  on public.matches
  for select
  using (
    exists (
      select 1
      from public.tournaments t
      join public.organizations o on o.id = t.organization_id
      where t.id = matches.tournament_id
        and o.is_active = true
        and t.status in ('published', 'completed')
    )
  );

-- Profiles: allow public read of player names used in match fixtures
drop policy if exists "public_read_profiles" on public.profiles;
create policy "public_read_profiles"
  on public.profiles
  for select
  using (true);

-- Rankings: allow public read for active orgs
drop policy if exists "public_read_rankings" on public.rankings;
create policy "public_read_rankings"
  on public.rankings
  for select
  using (
    exists (
      select 1
      from public.organizations o
      where o.id = rankings.organization_id
        and o.is_active = true
    )
  );

-- Announcements: allow public read for active orgs and active periods
drop policy if exists "public_read_announcements" on public.announcements;
create policy "public_read_announcements"
  on public.announcements
  for select
  using (
    exists (
      select 1
      from public.organizations o
      where o.id = announcements.organization_id
        and o.is_active = true
    )
    and starts_at <= now()
    and ends_at >= now()
  );

-- Announcements: allow org managers/admins to insert
drop policy if exists "manager_insert_announcements" on public.announcements;
create policy "manager_insert_announcements"
  on public.announcements
  for insert
  with check (
    exists (
      select 1
      from public.org_members m
      where m.organization_id = announcements.organization_id
        and m.user_id = auth.uid()
        and m.role in ('manager', 'admin')
    )
  );

-- Announcements: allow org managers/admins to update
drop policy if exists "manager_update_announcements" on public.announcements;
create policy "manager_update_announcements"
  on public.announcements
  for update
  using (
    exists (
      select 1
      from public.org_members m
      where m.organization_id = announcements.organization_id
        and m.user_id = auth.uid()
        and m.role in ('manager', 'admin')
    )
  );

-- Announcements: allow org managers/admins to delete
drop policy if exists "manager_delete_announcements" on public.announcements;
create policy "manager_delete_announcements"
  on public.announcements
  for delete
  using (
    exists (
      select 1
      from public.org_members m
      where m.organization_id = announcements.organization_id
        and m.user_id = auth.uid()
        and m.role in ('manager', 'admin')
    )
  );

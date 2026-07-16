import { createAdminClient } from "@/lib/supabase/admin";
import { getSlackBotToken, addReaction, postDMToSlackUser } from "../client";

const PARTICIPATION_EMOJIS = [
  "white_check_mark",
  "heavy_check_mark",
  "check_mark",
];

export async function handleReactionAdded(
  orgId: string,
  orgSlug: string,
  slackUserId: string,
  reaction: string,
  messageTs: string,
  botToken: string,
): Promise<void> {
  console.log("[Tournament Reactions] handleReactionAdded:", {
    orgId,
    slackUserId,
    reaction,
    messageTs,
  });

  if (!PARTICIPATION_EMOJIS.includes(reaction)) {
    console.log("[Tournament Reactions] Not a participation emoji, ignoring");
    return;
  }

  const ac = createAdminClient();

  const { data: tournament } = await ac
    .from("tournaments")
    .select("id, organization_id, name, status")
    .eq("slack_notification_ts", messageTs)
    .single();

  if (!tournament) {
    console.log(
      "[Tournament Reactions] No tournament found for message ts:",
      messageTs,
    );
    return;
  }

  if (tournament.organization_id !== orgId) {
    console.log(
      "[Tournament Reactions] Tournament belongs to different org, ignoring",
    );
    return;
  }

  if (tournament.status !== "published") {
    console.log(
      "[Tournament Reactions] Tournament is not published, ignoring reaction:",
      { status: tournament.status },
    );
    return;
  }

  const profileId = await resolveOrCreateProfile(
    ac,
    orgId,
    slackUserId,
    botToken,
  );
  if (!profileId) {
    console.log(
      "[Tournament Reactions] Could not resolve or create profile for user:",
      slackUserId,
    );
    return;
  }

  const { data: tournamentCategories } = await ac
    .from("tournament_categories")
    .select("category_id")
    .eq("tournament_id", tournament.id);

  if (!tournamentCategories || tournamentCategories.length === 0) {
    console.log(
      "[Tournament Reactions] No categories for tournament:",
      tournament.id,
    );
    return;
  }

  const { data: existingRankings } = await ac
    .from("rankings")
    .select("category_id")
    .eq("entity_id", profileId)
    .eq("organization_id", orgId);

  const existingCategoryIds = new Set(
    (existingRankings || []).map((r) => r.category_id),
  );
  const newRankings = tournamentCategories
    .filter((tc) => !existingCategoryIds.has(tc.category_id))
    .map((tc) => ({
      organization_id: orgId,
      category_id: tc.category_id,
      entity_id: profileId,
      entity_type: "player" as const,
      rating: 1000,
      points: 0,
      matches_played: 0,
      wins: 0,
      losses: 0,
    }));

  if (newRankings.length > 0) {
    await ac.from("rankings").insert(newRankings);
  }

  const entries = tournamentCategories.map((tc) => ({
    tournament_id: tournament.id,
    profile_id: profileId,
    category_id: tc.category_id,
  }));

  const { error: insertError } = await ac
    .from("tournament_entries")
    .upsert(entries, { onConflict: "tournament_id,profile_id,category_id" });

  if (insertError) {
    console.error(
      "[Tournament Reactions] Failed to insert entries:",
      insertError.message,
    );
    return;
  }

  console.log(
    "[Tournament Reactions] Successfully registered player for tournament:",
    { profileId, tournamentId: tournament.id },
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const tournamentUrl = `${siteUrl}/org/${orgSlug}/tournaments/${tournament.id}`;

  await postDMToSlackUser(
    orgId,
    slackUserId,
    `You're registered for *${tournament.name}*!`,
    [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `You've been registered for *${tournament.name}*.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Tournament", emoji: true },
            url: tournamentUrl,
            style: "primary",
          },
        ],
      },
    ],
  );
}

export async function handleReactionRemoved(
  orgId: string,
  slackUserId: string,
  reaction: string,
  messageTs: string,
  botToken: string,
): Promise<void> {
  console.log("[Tournament Reactions] handleReactionRemoved:", {
    orgId,
    slackUserId,
    reaction,
    messageTs,
  });

  if (!PARTICIPATION_EMOJIS.includes(reaction)) {
    console.log("[Tournament Reactions] Not a participation emoji, ignoring");
    return;
  }

  const ac = createAdminClient();

  const { data: tournament } = await ac
    .from("tournaments")
    .select("id, organization_id, name, status")
    .eq("slack_notification_ts", messageTs)
    .single();

  if (!tournament) {
    console.log(
      "[Tournament Reactions] No tournament found for message ts:",
      messageTs,
    );
    return;
  }

  if (tournament.organization_id !== orgId) {
    console.log(
      "[Tournament Reactions] Tournament belongs to different org, ignoring",
    );
    return;
  }

  if (tournament.status !== "published") {
    console.log(
      "[Tournament Reactions] Tournament is not published, ignoring reaction:",
      { status: tournament.status },
    );
    return;
  }

  const profileId = await resolveProfileBySlackUserId(
    ac,
    orgId,
    slackUserId,
    botToken,
  );
  if (!profileId) {
    console.log(
      "[Tournament Reactions] Could not resolve profile for user:",
      slackUserId,
    );
    return;
  }

  const { error: deleteError } = await ac
    .from("tournament_entries")
    .delete()
    .eq("tournament_id", tournament.id)
    .eq("profile_id", profileId);

  if (deleteError) {
    console.error(
      "[Tournament Reactions] Failed to remove entries:",
      deleteError.message,
    );
    return;
  }

  console.log(
    "[Tournament Reactions] Successfully unregistered player from tournament:",
    { profileId, tournamentId: tournament.id },
  );

  await postDMToSlackUser(
    orgId,
    slackUserId,
    `You've been unregistered from *${tournament.name}*.`,
  );
}

async function resolveProfileBySlackUserId(
  ac: ReturnType<typeof createAdminClient>,
  orgId: string,
  slackUserId: string,
  botToken: string,
): Promise<string | null> {
  const res = await fetch(
    `https://slack.com/api/users.info?user=${slackUserId}`,
    { headers: { Authorization: `Bearer ${botToken}` } },
  );
  const data = await res.json();

  if (!data.ok || !data.user?.profile?.email) {
    console.log("[Tournament Reactions] Failed to get Slack user info:", {
      ok: data.ok,
      hasEmail: !!data.user?.profile?.email,
    });
    return null;
  }

  const email = data.user.profile.email.toLowerCase();

  const { data: profile } = await ac
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  return profile?.id || null;
}

async function resolveOrCreateProfile(
  ac: ReturnType<typeof createAdminClient>,
  orgId: string,
  slackUserId: string,
  botToken: string,
): Promise<string | null> {
  const res = await fetch(
    `https://slack.com/api/users.info?user=${slackUserId}`,
    { headers: { Authorization: `Bearer ${botToken}` } },
  );
  const data = await res.json();

  if (!data.ok || !data.user?.profile?.email) {
    console.log("[Tournament Reactions] Failed to get Slack user info:", {
      ok: data.ok,
      hasEmail: !!data.user?.profile?.email,
    });
    return null;
  }

  const email = data.user.profile.email.toLowerCase();
  const fullName =
    data.user.profile.real_name || data.user.profile.name || email;

  const { data: existingProfile } = await ac
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existingProfile) {
    const { data: memberCheck } = await ac
      .from("org_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("profile_id", existingProfile.id)
      .single();

    if (!memberCheck) {
      await ac.from("org_members").insert({
        organization_id: orgId,
        profile_id: existingProfile.id,
        org_role: "player",
        status: "active",
      });
    }

    return existingProfile.id;
  }

  const { data: authData, error: authError } = await ac.auth.admin.createUser({
    email,
    password: Math.random().toString(36).slice(2),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !authData?.user) {
    console.error(
      "[Tournament Reactions] Failed to create user:",
      authError?.message,
    );
    return null;
  }

  const profileId = authData.user.id;

  const { error: profileError } = await ac.from("profiles").insert({
    id: profileId,
    full_name: fullName,
    email,
    platform_role: "player",
  });

  if (profileError) {
    await ac.auth.admin.deleteUser(profileId);
    console.error(
      "[Tournament Reactions] Failed to create profile:",
      profileError.message,
    );
    return null;
  }

  const { error: memberError } = await ac.from("org_members").insert({
    organization_id: orgId,
    profile_id: profileId,
    org_role: "player",
    status: "active",
  });

  if (memberError) {
    console.error(
      "[Tournament Reactions] Failed to add org member:",
      memberError.message,
    );
    return null;
  }

  return profileId;
}

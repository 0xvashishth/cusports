import { advanceMatch, walkoverMatch } from "@/lib/advance-match";
import { findPlayerByEmail, validateBothPlayers } from "../validation/players";
import {
  findScheduledMatch,
  validateScores,
  validateMatchEditable,
} from "../validation/matches";
import type { SlackCommandResult } from "../types";

export async function handleManagerReport(
  orgId: string,
  orgSlug: string,
  reporterEmail: string,
  opponentEmail: string,
  games: { score_a: number; score_b: number }[],
  channelId: string,
): Promise<SlackCommandResult> {
  console.log("[Slack ManagerReport] handleManagerReport:", {
    orgId,
    reporterEmail,
    opponentEmail,
    games,
    channelId,
  });

  const reporter = await findPlayerByEmail(orgId, reporterEmail);
  if (!reporter) {
    return {
      success: false,
      replyMessage: `Player with email "${reporterEmail}" not found in this organization.`,
    };
  }

  const opponent = await findPlayerByEmail(orgId, opponentEmail);
  if (!opponent) {
    return {
      success: false,
      replyMessage: `Player with email "${opponentEmail}" not found in this organization.`,
    };
  }

  if (reporter.id === opponent.id) {
    return {
      success: false,
      replyMessage: "Cannot report a match between the same player.",
    };
  }

  const playerValidation = await validateBothPlayers(
    orgId,
    reporter.id,
    opponent.id,
  );
  if (!playerValidation.valid) {
    return {
      success: false,
      replyMessage: playerValidation.error || "Player validation failed",
    };
  }

  const match = await findScheduledMatch(orgId, reporter.id, opponent.id);
  if (!match) {
    return {
      success: false,
      replyMessage: `No scheduled match found between ${reporter.fullName} and ${opponent.fullName}.`,
    };
  }

  const scoreValidation = validateScores(
    games,
    reporter.id,
    opponent.id,
    match,
  );
  if (!scoreValidation.valid) {
    return {
      success: false,
      replyMessage: scoreValidation.error || "Invalid scores",
    };
  }

  const editCheck = await validateMatchEditable(match.matchId);
  if (!editCheck.editable) {
    return {
      success: false,
      replyMessage: editCheck.error || "Match cannot be edited",
    };
  }

  const dbGames =
    match.playerAId === reporter.id
      ? games
      : games.map((g) => ({ score_a: g.score_b, score_b: g.score_a }));

  console.log("[Slack ManagerReport] Advancing match:", {
    matchId: match.matchId,
    winnerId: scoreValidation.winnerId,
  });
  const result = await advanceMatch({
    bracketMatchId: match.matchId,
    winnerId: scoreValidation.winnerId!,
    loserId: scoreValidation.loserId!,
    games: dbGames,
    reportedVia: "slack",
  });

  if (!result.success) {
    console.log("[Slack ManagerReport] Failed to advance match:", result.error);
    return {
      success: false,
      replyMessage: `Failed to record result: ${result.error}`,
    };
  }

  const winnerName =
    scoreValidation.winnerId === reporter.id
      ? reporter.fullName
      : opponent.fullName;
  const loserName =
    scoreValidation.winnerId === reporter.id
      ? opponent.fullName
      : reporter.fullName;
  const scoreStr = games.map((g) => `${g.score_a}-${g.score_b}`).join(", ");
  const matchLabel = [match.tournamentName, match.categoryName]
    .filter(Boolean)
    .join(" - ");

  return {
    success: true,
    reaction: "white_check_mark",
    replyMessage: `*Result (manager):* ${winnerName} vs ${loserName} (${scoreStr})${matchLabel ? `\n${matchLabel}` : ""}`,
  };
}

export async function handleManagerWalkover(
  orgId: string,
  winnerEmail: string,
  loserEmail: string,
): Promise<SlackCommandResult> {
  const winner = await findPlayerByEmail(orgId, winnerEmail);
  if (!winner) {
    return {
      success: false,
      replyMessage: `Player with email "${winnerEmail}" not found.`,
    };
  }

  const loser = await findPlayerByEmail(orgId, loserEmail);
  if (!loser) {
    return { success: false, replyMessage: `Player with email "${loserEmail}" not found.` };
  }

  const playerValidation = await validateBothPlayers(
    orgId,
    winner.id,
    loser.id,
  );
  if (!playerValidation.valid) {
    return {
      success: false,
      replyMessage: playerValidation.error || "Player validation failed",
    };
  }

  const match = await findScheduledMatch(orgId, winner.id, loser.id);
  if (!match) {
    return {
      success: false,
      replyMessage: `No scheduled match found between ${winner.fullName} and ${loser.fullName}.`,
    };
  }

  const result = await walkoverMatch(match.matchId, winner.id);

  if (!result.success) {
    return {
      success: false,
      replyMessage: `Failed to record walkover: ${result.error}`,
    };
  }

  return {
    success: true,
    reaction: "white_check_mark",
    replyMessage: `*Walkover:* ${winner.fullName} wins by walkover over ${loser.fullName}`,
  };
}

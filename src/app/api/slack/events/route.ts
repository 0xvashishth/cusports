import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const body = await request.json()

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge })
  }

  if (body.event?.type === "app_mention") {
    const { text, channel, user } = body.event
    const match = text.match(/report match vs @?(\S+)\s+([\d-,\s]+)/)

    if (match) {
      const opponentName = match[1]
      const gamesStr = match[2]
      const games = gamesStr.split(",").map((g: string) => {
        const [a, b] = g.trim().split("-").map(Number)
        return { score_a: a, score_b: b }
      })

      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/slack/report-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slack_user_id: user,
          opponent_name: opponentName,
          games,
          channel,
          team_id: body.team_id,
        }),
      })
    }
  }

  return NextResponse.json({ ok: true })
}

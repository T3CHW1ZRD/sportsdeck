import { getMatches } from "@/lib/footballApi";
import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/matches/sync
 * Sync matches from football-data.org to the local database.
 * This updates scores, statuses, and adds new matches.
 * Should be called periodically or on demand.
 */
export async function POST(request: Request) {
  try {
    const data = await getMatches();
    const matches = data.matches || [];

    let created = 0;
    let updated = 0;

    for (const match of matches) {
      // Find or create teams
      const homeTeam = await prisma.team.findUnique({
        where: { externalId: match.homeTeam.id },
      });
      const awayTeam = await prisma.team.findUnique({
        where: { externalId: match.awayTeam.id },
      });

      if (!homeTeam || !awayTeam) {
        continue; // Skip if teams not in DB yet
      }

      const matchData = {
        externalId: match.id,
        matchday: match.matchday,
        utcDate: new Date(match.utcDate),
        status: match.status,
        stage: match.stage,
        group: match.group,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: match.score?.fullTime?.home ?? null,
        awayScore: match.score?.fullTime?.away ?? null,
        venue: match.venue || null,
      };

      const existing = await prisma.match.findUnique({
        where: { externalId: match.id },
      });

      if (existing) {
        await prisma.match.update({
          where: { externalId: match.id },
          data: matchData,
        });
        updated++;
      } else {
        await prisma.match.create({ data: matchData });
        created++;
      }
    }

    return jsonResponse({
      message: `Sync complete. Created: ${created}, Updated: ${updated}`,
      total: matches.length,
    });
  } catch (error) {
    console.error("Sync matches error:", error);
    return errorResponse("Failed to sync matches: " + (error as Error).message, 500);
  }
}

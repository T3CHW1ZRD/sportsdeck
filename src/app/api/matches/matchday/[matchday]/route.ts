import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/matches/matchday/[matchday]
 * Get all matches for a specific matchday.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { matchday } = await params;
    const md = parseInt(matchday);

    if (isNaN(md)) {
      return errorResponse("Invalid matchday", 400);
    }

    const matches = await prisma.match.findMany({
      where: { matchday: md },
      orderBy: { utcDate: "asc" },
      include: {
        homeTeam: { select: { id: true, name: true, shortName: true, tla: true, crest: true, venue: true } },
        awayTeam: { select: { id: true, name: true, shortName: true, tla: true, crest: true, venue: true } },
      },
    });

    return jsonResponse({ matchday: md, matches });
  } catch (error) {
    console.error("Get matchday error:", error);
    return errorResponse("Internal server error", 500);
  }
}

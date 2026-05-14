import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/matches
 * List matches with optional filters: matchday, status, teamId, dateFrom, dateTo.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const matchday = searchParams.get("matchday");
    const status = searchParams.get("status");
    const teamId = searchParams.get("teamId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const stage = searchParams.get("stage");

    const where: any = {};

    if (matchday) {
      where.matchday = parseInt(matchday);
    }
    if (status) {
      where.status = status;
    }
    if (stage) {
      where.stage = stage;
    }
    if (teamId) {
      const tid = parseInt(teamId);
      where.OR = [{ homeTeamId: tid }, { awayTeamId: tid }];
    }
    if (dateFrom || dateTo) {
      where.utcDate = {};
      if (dateFrom) where.utcDate.gte = new Date(dateFrom);
      if (dateTo) where.utcDate.lte = new Date(dateTo);
    }

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        skip,
        take: limit,
        orderBy: { utcDate: "asc" },
        select: {
          id: true, matchday: true, utcDate: true, status: true, stage: true,
          homeScore: true, awayScore: true, venue: true,
          homeTeam: { select: { id: true, name: true, shortName: true, tla: true, crest: true } },
          awayTeam: { select: { id: true, name: true, shortName: true, tla: true, crest: true } },
        },
      }),
      prisma.match.count({ where }),
    ]);

    return jsonResponse(paginatedResponse(matches, total, page, limit));
  } catch (error) {
    console.error("Get matches error:", error);
    return errorResponse("Internal server error", 500);
  }
}

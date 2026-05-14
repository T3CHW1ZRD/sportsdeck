import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/matches/[id]
 * Get a specific match by ID with team details.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const matchId = parseInt(id);

    if (isNaN(matchId)) {
      return errorResponse("Invalid match ID", 400);
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        threads: {
          where: { isHidden: false },
          select: {
            id: true,
            title: true,
            type: true,
            isAutoCreated: true,
            createdAt: true,
            _count: { select: { posts: true } },
          },
        },
      },
    });

    if (!match) {
      return errorResponse("Match not found", 404);
    }

    return jsonResponse({ match });
  } catch (error) {
    console.error("Get match error:", error);
    return errorResponse("Internal server error", 500);
  }
}

import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/matches/matchday
 * Get all available matchday numbers with match counts.
 */
export async function GET(request: Request) {
  try {
    const matchdays = await prisma.match.groupBy({
      by: ["matchday"],
      where: { matchday: { not: null } },
      _count: { id: true },
      orderBy: { matchday: "asc" },
    });

    const data = matchdays.map((md) => ({
      matchday: md.matchday,
      matchCount: md._count.id,
    }));

    return jsonResponse({ matchdays: data });
  } catch (error) {
    console.error("Get matchdays error:", error);
    return errorResponse("Internal server error", 500);
  }
}

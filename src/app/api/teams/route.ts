import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/teams
 * List all teams in the league from the database.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.team.count(),
    ]);

    return jsonResponse(paginatedResponse(teams, total, page, limit));
  } catch (error) {
    console.error("Get teams error:", error);
    return errorResponse("Internal server error", 500);
  }
}

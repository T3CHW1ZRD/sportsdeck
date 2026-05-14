import { getStandings } from "@/lib/footballApi";
import { getCached, setCached, DYNAMIC_TTL } from "@/lib/cache";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/standings
 * Get the current league standings from football-data.org (cached).
 */
export async function GET(request: Request) {
  try {
    const cacheKey = "pl_standings";
    const cached = await getCached(cacheKey);
    if (cached) {
      return jsonResponse({ standings: cached, cached: true });
    }

    const data = await getStandings();
    const standings = data.standings || [];
    await setCached(cacheKey, standings, DYNAMIC_TTL);

    return jsonResponse({ standings, cached: false });
  } catch (error) {
    console.error("Get standings error:", error);
    return errorResponse("Failed to fetch standings: " + (error as Error).message, 500);
  }
}

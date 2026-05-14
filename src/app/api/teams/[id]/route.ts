import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/teams/[id]
 * Get a specific team by ID.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const teamId = parseInt(id);

    if (isNaN(teamId)) {
      return errorResponse("Invalid team ID", 400);
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        homeMatches: {
          include: {
            homeTeam: { select: { id: true, name: true, shortName: true, crest: true } },
            awayTeam: { select: { id: true, name: true, shortName: true, crest: true } },
          },
          orderBy: { utcDate: "desc" },
          take: 10,
        },
        awayMatches: {
          include: {
            homeTeam: { select: { id: true, name: true, shortName: true, crest: true } },
            awayTeam: { select: { id: true, name: true, shortName: true, crest: true } },
          },
          orderBy: { utcDate: "desc" },
          take: 10,
        },
      },
    });

    if (!team) {
      return errorResponse("Team not found", 404);
    }

    return jsonResponse({ team });
  } catch (error) {
    console.error("Get team error:", error);
    return errorResponse("Internal server error", 500);
  }
}

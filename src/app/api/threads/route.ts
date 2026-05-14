import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/threads
 * List threads with optional filters: type, teamId, matchId, authorId.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const type = searchParams.get("type");
    const teamId = searchParams.get("teamId");
    const matchId = searchParams.get("matchId");
    const authorId = searchParams.get("authorId");

    const where: any = { isHidden: false };

    if (type) where.type = type;
    if (teamId) where.teamId = parseInt(teamId);
    if (matchId) where.matchId = parseInt(matchId);
    if (authorId) where.authorId = parseInt(authorId);

    const [threads, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: {
            select: { id: true, username: true, avatar: true },
          },
          team: {
            select: { id: true, name: true, shortName: true, crest: true },
          },
          match: {
            select: {
              id: true,
              matchday: true,
              utcDate: true,
              status: true,
              homeScore: true,
              awayScore: true,
              homeTeam: { select: { id: true, name: true, shortName: true, crest: true } },
              awayTeam: { select: { id: true, name: true, shortName: true, crest: true } },
            },
          },
          tags: {
            include: { tag: true },
          },
          _count: {
            select: { posts: true, polls: true },
          },
        },
      }),
      prisma.thread.count({ where }),
    ]);

    // Flatten tags
    const formatted = threads.map((t) => ({
      ...t,
      tags: t.tags.map((tt) => tt.tag),
    }));

    return jsonResponse(paginatedResponse(formatted, total, page, limit));
  } catch (error) {
    console.error("Get threads error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/threads
 * Create a new discussion thread. Requires authentication.
 */
export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot create threads", 403);
    }

    const body = await request.json();
    const { title, content, type, teamId, matchId, tags } = body;

    if (!title || !content) {
      return errorResponse("Title and content are required", 400);
    }
    if (title.length > 200) {
      return errorResponse("Title must be 200 characters or less", 400);
    }
    if (content.length > 10000) {
      return errorResponse("Content must be 10000 characters or less", 400);
    }

    if (!type || !["MATCH", "TEAM", "GENERAL"].includes(type)) {
      return errorResponse("Type must be MATCH, TEAM, or GENERAL", 400);
    }

    if (type === "TEAM" && !teamId) {
      return errorResponse("teamId is required for TEAM threads", 400);
    }

    if (type === "MATCH" && !matchId) {
      return errorResponse("matchId is required for MATCH threads", 400);
    }

    // Validate team exists
    if (teamId) {
      const team = await prisma.team.findUnique({ where: { id: parseInt(teamId) } });
      if (!team) return errorResponse("Team not found", 404);
    }

    // Validate match exists and check thread window (2 weeks before to 2 weeks after)
    if (matchId) {
      const match = await prisma.match.findUnique({ where: { id: parseInt(matchId) } });
      if (!match) return errorResponse("Match not found", 404);

      const now = new Date();
      const twoWeeksBefore = new Date(match.utcDate.getTime() - 14 * 24 * 60 * 60 * 1000);
      const twoWeeksAfter = new Date(match.utcDate.getTime() + 14 * 24 * 60 * 60 * 1000);

      if (now < twoWeeksBefore || now > twoWeeksAfter) {
        return errorResponse("Thread creation is only allowed within 2 weeks before and after the match", 400);
      }
    }

    // Handle tags - create if they don't exist
    let tagConnections = [];
    if (tags && Array.isArray(tags) && tags.length > 0) {
      for (const tagName of tags) {
        const normalizedName = tagName.trim().toLowerCase();
        if (!normalizedName) continue;

        let tag = await prisma.tag.findUnique({ where: { name: normalizedName } });
        if (!tag) {
          tag = await prisma.tag.create({ data: { name: normalizedName } });
        }
        tagConnections.push({ tagId: tag.id });
      }
    }

    const thread = await prisma.thread.create({
      data: {
        title,
        content,
        type,
        authorId: authUser.userId,
        teamId: teamId ? parseInt(teamId) : null,
        matchId: matchId ? parseInt(matchId) : null,
        tags: {
          create: tagConnections,
        },
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        team: { select: { id: true, name: true, shortName: true, crest: true } },
        match: {
          select: {
            id: true,
            matchday: true,
            utcDate: true,
            homeTeam: { select: { id: true, name: true, shortName: true } },
            awayTeam: { select: { id: true, name: true, shortName: true } },
          },
        },
        tags: { include: { tag: true } },
      },
    });

    return jsonResponse(
      {
        thread: {
          ...thread,
          tags: thread.tags.map((tt) => tt.tag),
        },
      },
      201
    );
  } catch (error) {
    console.error("Create thread error:", error);
    return errorResponse("Internal server error", 500);
  }
}

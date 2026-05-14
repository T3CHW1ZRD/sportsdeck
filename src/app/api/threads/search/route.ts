import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/threads/search
 * Search threads by title, author username, team name, and tags.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const q = searchParams.get("q");
    const title = searchParams.get("title");
    const author = searchParams.get("author");
    const team = searchParams.get("team");
    const tag = searchParams.get("tag");
    const type = searchParams.get("type");

    const where: any = { isHidden: false };
    const conditions: any[] = [];

    if (type && ["GENERAL", "TEAM", "MATCH"].includes(type.toUpperCase())) {
      where.type = type.toUpperCase();
    }

    if (q) {
      conditions.push({
        OR: [
          { title: { contains: q } },
          { content: { contains: q } },
          { author: { username: { contains: q } } },
        ],
      });
    }

    if (title) {
      conditions.push({ title: { contains: title } });
    }

    if (author) {
      conditions.push({ author: { username: { contains: author } } });
    }

    if (team) {
      conditions.push({
        team: { name: { contains: team } },
      });
    }

    if (tag) {
      conditions.push({
        tags: {
          some: {
            tag: { name: { contains: tag.toLowerCase() } },
          },
        },
      });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    const [threads, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, username: true, avatar: true } },
          team: { select: { id: true, name: true, shortName: true, crest: true } },
          tags: { include: { tag: true } },
          _count: { select: { posts: true } },
        },
      }),
      prisma.thread.count({ where }),
    ]);

    const formatted = threads.map((t) => ({
      ...t,
      tags: t.tags.map((tt) => tt.tag),
    }));

    return jsonResponse(paginatedResponse(formatted, total, page, limit));
  } catch (error) {
    console.error("Search threads error:", error);
    return errorResponse("Internal server error", 500);
  }
}

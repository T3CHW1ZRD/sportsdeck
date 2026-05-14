import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/users/[id]/threads
 * List threads created by a user.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return errorResponse("Invalid user ID", 400);
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const where = { authorId: userId, isHidden: false };

    const [threads, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
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
    console.error("Get user threads error:", error);
    return errorResponse("Internal server error", 500);
  }
}

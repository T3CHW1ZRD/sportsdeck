import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/users/[id]/posts
 * List posts (comments) created by a user.
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

    const repliesOnly =
      searchParams.get("repliesOnly") === "1" || searchParams.get("repliesOnly") === "true";

    const where: any = { authorId: userId, isHidden: false };
    if (repliesOnly) {
      where.parentId = { not: null };
    } else {
      where.parentId = null;
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          thread: { select: { id: true, title: true, type: true } },
          author: { select: { id: true, username: true, avatar: true } },
        },
      }),
      prisma.post.count({ where }),
    ]);

    return jsonResponse(paginatedResponse(posts, total, page, limit));
  } catch (error) {
    console.error("Get user posts error:", error);
    return errorResponse("Internal server error", 500);
  }
}

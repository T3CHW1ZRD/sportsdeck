import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/users/[id]/following
 * List users that this user is following. Sorted by follow time.
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

    const [following, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          following: {
            select: { id: true, username: true, avatar: true, favoriteTeamId: true },
          },
        },
      }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);

    const data = following.map((f) => ({
      ...f.following,
      followedAt: f.createdAt,
    }));

    return jsonResponse(paginatedResponse(data, total, page, limit));
  } catch (error) {
    console.error("Get following error:", error);
    return errorResponse("Internal server error", 500);
  }
}

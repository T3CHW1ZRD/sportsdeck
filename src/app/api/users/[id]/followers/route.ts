import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/users/[id]/followers
 * List a user's followers. Sorted by follow time.
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

    const [followers, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          follower: {
            select: { id: true, username: true, avatar: true, favoriteTeamId: true },
          },
        },
      }),
      prisma.follow.count({ where: { followingId: userId } }),
    ]);

    const data = followers.map((f) => ({
      ...f.follower,
      followedAt: f.createdAt,
      followId: f.id,
    }));

    return jsonResponse(paginatedResponse(data, total, page, limit));
  } catch (error) {
    console.error("Get followers error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/users/[id]/followers
 * Remove a follower. Requires authentication (must be the user being followed).
 * Body: { followerId: number }
 */
export async function DELETE(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return errorResponse("Invalid user ID", 400);
    }

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot remove followers", 403);
    }

    if (userId !== authUser.userId) {
      return errorResponse("You can only remove followers from your own profile", 403);
    }

    const body = await request.json();
    const { followerId } = body;

    if (!followerId) {
      return errorResponse("followerId is required", 400);
    }

    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: parseInt(followerId),
          followingId: userId,
        },
      },
    });

    if (!follow) {
      return errorResponse("Follower not found", 404);
    }

    await prisma.follow.delete({ where: { id: follow.id } });

    return jsonResponse({ message: "Follower removed" });
  } catch (error) {
    console.error("Remove follower error:", error);
    return errorResponse("Internal server error", 500);
  }
}

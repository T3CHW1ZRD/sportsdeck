import prisma from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/users/[id]
 * Get a user's public profile.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return errorResponse("Invalid user ID", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatar: true,
        role: true,
        isBanned: true,
        favoriteTeamId: true,
        createdAt: true,
        favoriteTeam: {
          select: { id: true, name: true, shortName: true, crest: true },
        },
        _count: {
          select: {
            threads: true,
            posts: true,
            following: true,
            followers: true,
          },
        },
      },
    });

    if (!user) {
      return errorResponse("User not found", 404);
    }

    // Count total likes received, top-level posts, and replies separately
    const [likesReceived, repliesCount, topLevelPostsCount] = await Promise.all([
      prisma.postLike.count({ where: { post: { authorId: userId } } }),
      prisma.post.count({ where: { authorId: userId, parentId: { not: null } } }),
      prisma.post.count({ where: { authorId: userId, parentId: null } }),
    ]);

    // Check if the requesting user follows this user
    const authUser = await getUserFromRequest(request);
    let isFollowing = false;
    if (authUser) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: authUser.userId,
            followingId: userId,
          },
        },
      });
      isFollowing = !!follow;
    }

    return jsonResponse({ user: { ...user, _count: { ...user._count, posts: topLevelPostsCount }, isFollowing, likesReceived, repliesCount } });
  } catch (error) {
    console.error("Get user profile error:", error);
    return errorResponse("Internal server error", 500);
  }
}

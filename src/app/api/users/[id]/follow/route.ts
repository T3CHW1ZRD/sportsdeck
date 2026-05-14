import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/users/[id]/follow
 * Follow a user. Requires authentication.
 */
export async function POST(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const targetId = parseInt(id);

    if (isNaN(targetId)) {
      return errorResponse("Invalid user ID", 400);
    }

    if (targetId === authUser.userId) {
      return errorResponse("You cannot follow yourself", 400);
    }

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot follow users", 403);
    }

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      return errorResponse("User not found", 404);
    }

    // Check if already following
    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: authUser.userId,
          followingId: targetId,
        },
      },
    });

    if (existing) {
      return errorResponse("You are already following this user", 409);
    }

    const follow = await prisma.follow.create({
      data: {
        followerId: authUser.userId,
        followingId: targetId,
      },
    });

    return jsonResponse({ follow, message: "Now following user" }, 201);
  } catch (error) {
    console.error("Follow error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/users/[id]/follow
 * Unfollow a user. Requires authentication.
 */
export async function DELETE(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const targetId = parseInt(id);

    if (isNaN(targetId)) {
      return errorResponse("Invalid user ID", 400);
    }

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot unfollow users", 403);
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: authUser.userId,
          followingId: targetId,
        },
      },
    });

    if (!existing) {
      return errorResponse("You are not following this user", 404);
    }

    await prisma.follow.delete({ where: { id: existing.id } });

    return jsonResponse({ message: "Unfollowed user" });
  } catch (error) {
    console.error("Unfollow error:", error);
    return errorResponse("Internal server error", 500);
  }
}

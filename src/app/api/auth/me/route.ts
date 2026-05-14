import prisma from "@/lib/prisma";
import { requireAuth, getUserFromRequest, hashPassword, comparePassword } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/auth/me
 * Get the current authenticated user's profile.
 */
export async function GET(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        email: true,
        username: true,
        avatar: true,
        role: true,
        isBanned: true,
        favoriteTeamId: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
        favoriteTeam: {
          select: {
            id: true,
            name: true,
            shortName: true,
            crest: true,
          },
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

    const likesReceived = await prisma.postLike.count({
      where: { post: { authorId: authUser.userId } },
    });

    return jsonResponse({ user: { ...user, likesReceived } });
  } catch (error) {
    console.error("Get profile error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/auth/me
 * Update the current authenticated user's profile.
 */
export async function PUT(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    // Check if user is banned
    const currentUser = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (currentUser?.isBanned) {
      return errorResponse("You are banned and cannot update your profile", 403);
    }

    const body = await request.json();
    const { username, avatar, favoriteTeamId, currentPassword, newPassword } = body;

    const updateData: any = {};

    if (username !== undefined) {
      if (username.length < 3 || username.length > 30) {
        return errorResponse("Username must be between 3 and 30 characters", 400);
      }
      // Check uniqueness
      const existing = await prisma.user.findFirst({
        where: { username, NOT: { id: authUser.userId } },
      });
      if (existing) {
        return errorResponse("Username already taken", 409);
      }
      updateData.username = username;
    }

    if (avatar !== undefined) {
      updateData.avatar = avatar;
    }

    if (favoriteTeamId !== undefined) {
      if (favoriteTeamId !== null) {
        const team = await prisma.team.findUnique({ where: { id: favoriteTeamId } });
        if (!team) {
          return errorResponse("Team not found", 404);
        }
      }
      updateData.favoriteTeamId = favoriteTeamId;
    }

    // Password change
    if (newPassword) {
      if (!currentPassword) {
        return errorResponse("Current password is required to set a new password", 400);
      }
      const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
      if (!user?.password || !comparePassword(currentPassword, user.password)) {
        return errorResponse("Current password is incorrect", 401);
      }
      if (newPassword.length < 6) {
        return errorResponse("New password must be at least 6 characters", 400);
      }
      updateData.password = hashPassword(newPassword);
    }

    const user = await prisma.user.update({
      where: { id: authUser.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        avatar: true,
        role: true,
        favoriteTeamId: true,
        updatedAt: true,
        favoriteTeam: {
          select: {
            id: true,
            name: true,
            shortName: true,
            crest: true,
          },
        },
      },
    });

    return jsonResponse({ user });
  } catch (error) {
    console.error("Update profile error:", error);
    return errorResponse("Internal server error", 500);
  }
}

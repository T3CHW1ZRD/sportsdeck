import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/admin/users/[id]/unban
 * Unban a user. Requires admin role.
 */
export async function POST(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return errorResponse("Forbidden: Admin access required", 403);
  }

  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return errorResponse("Invalid user ID", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorResponse("User not found", 404);
    }

    if (!user.isBanned) {
      return errorResponse("User is not banned", 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isBanned: false },
    });

    return jsonResponse({ message: `User ${user.username} has been unbanned` });
  } catch (error) {
    console.error("Unban user error:", error);
    return errorResponse("Internal server error", 500);
  }
}

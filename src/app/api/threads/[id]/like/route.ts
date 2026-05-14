import prisma from "@/lib/prisma";
import { requireAuth, getUserFromRequest } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/threads/[id]/like
 * Toggle like on a thread.
 */
export async function POST(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const threadId = parseInt(id);
    if (isNaN(threadId)) return errorResponse("Invalid thread ID", 400);

    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) return errorResponse("You are banned", 403);

    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isHidden) return errorResponse("Thread not found", 404);

    const existing = await prisma.threadLike.findUnique({
      where: { userId_threadId: { userId: authUser.userId, threadId } },
    });

    if (existing) {
      await prisma.threadLike.delete({ where: { id: existing.id } });
      const likeCount = await prisma.threadLike.count({ where: { threadId } });
      return jsonResponse({ liked: false, likeCount });
    }

    await prisma.threadLike.create({
      data: { userId: authUser.userId, threadId },
    });
    const likeCount = await prisma.threadLike.count({ where: { threadId } });
    return jsonResponse({ liked: true, likeCount }, 201);
  } catch (error) {
    console.error("Like thread error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * GET /api/threads/[id]/like
 * Get like status and count for a thread.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const threadId = parseInt(id);
    if (isNaN(threadId)) return errorResponse("Invalid thread ID", 400);

    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isHidden) return errorResponse("Thread not found", 404);

    const likeCount = await prisma.threadLike.count({ where: { threadId } });
    const authUser = await getUserFromRequest(request);
    let liked = false;
    if (authUser) {
      const existing = await prisma.threadLike.findUnique({
        where: { userId_threadId: { userId: authUser.userId, threadId } },
      });
      liked = !!existing;
    }

    return jsonResponse({ liked, likeCount });
  } catch (error) {
    console.error("Get thread like error:", error);
    return errorResponse("Internal server error", 500);
  }
}

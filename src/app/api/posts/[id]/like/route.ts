import prisma from "@/lib/prisma";
import { requireAuth, getUserFromRequest } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/posts/[id]/like
 * Toggle like on a post. If already liked, unlikes it.
 */
export async function POST(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return errorResponse("Invalid post ID", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot like posts", 403);
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isHidden) {
      return errorResponse("Post not found", 404);
    }

    // Check if already liked — toggle
    const existing = await prisma.postLike.findUnique({
      where: { userId_postId: { userId: authUser.userId, postId } },
    });

    if (existing) {
      await prisma.postLike.delete({ where: { id: existing.id } });
      const likeCount = await prisma.postLike.count({ where: { postId } });
      return jsonResponse({ liked: false, likeCount });
    }

    await prisma.postLike.create({
      data: { userId: authUser.userId, postId },
    });

    const likeCount = await prisma.postLike.count({ where: { postId } });
    return jsonResponse({ liked: true, likeCount }, 201);
  } catch (error) {
    console.error("Like post error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * GET /api/posts/[id]/like
 * Get like status and count for a post.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return errorResponse("Invalid post ID", 400);
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isHidden) {
      return errorResponse("Post not found", 404);
    }

    const likeCount = await prisma.postLike.count({ where: { postId } });

    // Check if current user liked it
    const authUser = await getUserFromRequest(request);
    let liked = false;
    if (authUser) {
      const existing = await prisma.postLike.findUnique({
        where: { userId_postId: { userId: authUser.userId, postId } },
      });
      liked = !!existing;
    }

    return jsonResponse({ liked, likeCount });
  } catch (error) {
    console.error("Get like status error:", error);
    return errorResponse("Internal server error", 500);
  }
}

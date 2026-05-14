import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/posts/[id]
 * Get a specific post with its replies and version history.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return errorResponse("Invalid post ID", 400);
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        thread: { select: { id: true, title: true, type: true } },
        replies: {
          where: { isHidden: false },
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, username: true, avatar: true } },
          },
        },
        versions: {
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { replies: true } },
      },
    });

    if (!post || post.isHidden) {
      return errorResponse("Post not found", 404);
    }

    return jsonResponse({ post });
  } catch (error) {
    console.error("Get post error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/posts/[id]
 * Edit a post. Saves the old version for history.
 */
export async function PUT(request: Request, { params }: { params: Promise<Record<string, string>> }) {
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

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot edit posts", 403);
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { thread: { select: { isHidden: true } } },
    });
    if (!post) {
      return errorResponse("Post not found", 404);
    }
    if (post.isHidden || post.thread?.isHidden) {
      return errorResponse("Cannot edit a post in a hidden thread", 403);
    }
    if (post.authorId !== authUser.userId) {
      return errorResponse("You can only edit your own posts", 403);
    }

    const body = await request.json();
    const { content } = body;

    if (!content || content.trim().length === 0) {
      return errorResponse("Content is required", 400);
    }
    if (content.length > 5000) {
      return errorResponse("Post must be 5000 characters or less", 400);
    }

    // Save old version
    await prisma.postVersion.create({
      data: {
        content: post.content,
        postId: post.id,
      },
    });

    // Update post
    const updated = await prisma.post.update({
      where: { id: postId },
      data: { content },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        versions: { orderBy: { createdAt: "desc" } },
      },
    });

    return jsonResponse({ post: updated });
  } catch (error) {
    console.error("Update post error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/posts/[id]
 * Delete a post. Only the author or admin can delete.
 */
export async function DELETE(request: Request, { params }: { params: Promise<Record<string, string>> }) {
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

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot delete posts", 403);
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { thread: { select: { isHidden: true } } },
    });
    if (!post) {
      return errorResponse("Post not found", 404);
    }
    if (post.isHidden || post.thread?.isHidden) {
      return errorResponse("Cannot delete a post in a hidden thread", 403);
    }
    if (post.authorId !== authUser.userId && authUser.role !== "ADMIN") {
      return errorResponse("You can only delete your own posts", 403);
    }

    await prisma.post.delete({ where: { id: postId } });

    return jsonResponse({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Delete post error:", error);
    return errorResponse("Internal server error", 500);
  }
}

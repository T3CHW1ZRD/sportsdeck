import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/posts/[id]/versions
 * Get the edit history of a post.
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
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        versions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!post) {
      return errorResponse("Post not found", 404);
    }

    return jsonResponse({
      currentContent: post.content,
      versions: post.versions,
      totalEdits: post.versions.length,
    });
  } catch (error) {
    console.error("Get versions error:", error);
    return errorResponse("Internal server error", 500);
  }
}

import prisma from "@/lib/prisma";
import { requireAuth, getUserFromRequest } from "@/lib/auth";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";
import { detectToxicity } from "@/lib/ai";

/**
 * GET /api/threads/[id]/posts
 * List posts (comments/replies) in a thread.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const threadId = parseInt(id);

    if (isNaN(threadId)) {
      return errorResponse("Invalid thread ID", 400);
    }

    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isHidden) {
      return errorResponse("Thread not found", 404);
    }

    // Check if thread is within active window for match threads
    if (thread.matchId) {
      const match = await prisma.match.findUnique({ where: { id: thread.matchId } });
      if (match) {
        const now = new Date();
        const twoWeeksBefore = new Date(match.utcDate.getTime() - 14 * 24 * 60 * 60 * 1000);
        const twoWeeksAfter = new Date(match.utcDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        // We still allow reading posts even outside the window
      }
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const where = {
      threadId,
      isHidden: false,
      parentId: null, // Top-level posts only
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, username: true, avatar: true, favoriteTeamId: true } },
          replies: {
            where: { isHidden: false },
            orderBy: { createdAt: "asc" },
            include: {
              author: { select: { id: true, username: true, avatar: true, favoriteTeamId: true } },
              _count: { select: { replies: true, likes: true } },
            },
          },
          _count: { select: { replies: true, versions: true, likes: true } },
        },
      }),
      prisma.post.count({ where }),
    ]);

    // Attach user's like status if authenticated
    const authUser = await getUserFromRequest(request);
    let likedPostIds = new Set();
    if (authUser) {
      const postIds = posts.flatMap((p) => [p.id, ...p.replies.map((r) => r.id)]);
      const userLikes = await prisma.postLike.findMany({
        where: { userId: authUser.userId, postId: { in: postIds } },
        select: { postId: true },
      });
      likedPostIds = new Set(userLikes.map((l) => l.postId));
    }

    const postsWithLikes = posts.map((p) => ({
      ...p,
      liked: likedPostIds.has(p.id),
      replies: p.replies.map((r) => ({ ...r, liked: likedPostIds.has(r.id) })),
    }));

    return jsonResponse(paginatedResponse(postsWithLikes, total, page, limit));
  } catch (error) {
    console.error("Get posts error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/threads/[id]/posts
 * Create a new post (comment) in a thread. Requires authentication.
 */
export async function POST(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const threadId = parseInt(id);

    if (isNaN(threadId)) {
      return errorResponse("Invalid thread ID", 400);
    }

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot post", 403);
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: { match: true },
    });

    if (!thread || thread.isHidden) {
      return errorResponse("Thread not found", 404);
    }

    // Check if match thread is within active window
    if (thread.match) {
      const now = new Date();
      const twoWeeksBefore = new Date(thread.match.utcDate.getTime() - 14 * 24 * 60 * 60 * 1000);
      const twoWeeksAfter = new Date(thread.match.utcDate.getTime() + 14 * 24 * 60 * 60 * 1000);

      if (now < twoWeeksBefore || now > twoWeeksAfter) {
        return errorResponse("This match thread is closed for new posts", 400);
      }
    }

    const body = await request.json();
    const { content, parentId } = body;

    if (!content || content.trim().length === 0) {
      return errorResponse("Content is required", 400);
    }
    if (content.length > 5000) {
      return errorResponse("Post must be 5000 characters or less", 400);
    }

    // Validate parent post if replying
    if (parentId) {
      const parent = await prisma.post.findUnique({ where: { id: parseInt(parentId) } });
      if (!parent || parent.threadId !== threadId) {
        return errorResponse("Parent post not found in this thread", 404);
      }
      if (parent.isHidden) {
        return errorResponse("Cannot reply to a hidden post", 400);
      }
    }

    const post = await prisma.post.create({
      data: {
        content,
        threadId,
        authorId: authUser.userId,
        parentId: parentId ? parseInt(parentId) : null,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    // Auto-flag for toxicity in the background (non-blocking)
    detectToxicity(content).then(async (result: any) => {
      if (result.isToxic) {
        try {
          // Use admin as the reporter for auto-flags
          const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
          const reporterId = admin ? admin.id : authUser.userId;

          const autoReport = await prisma.report.create({
            data: {
              reason: "Auto-flagged by AI: potentially inappropriate content",
              status: result.score > 0.8 ? "APPROVED" : "PENDING",
              reporterId,
              postId: post.id,
              aiVerdict: `Toxicity detected: ${JSON.stringify(result.details)}`,
              aiScore: result.score,
            },
          });

          // Auto-hide highly toxic content (score > 0.8)
          if (result.score > 0.8) {
            await prisma.post.update({
              where: { id: post.id },
              data: { isHidden: true },
            });
            console.log(`Auto-hidden post ${post.id} (toxicity score: ${result.score})`);
          }
        } catch (e) {
          console.error("Auto-flag error:", e);
        }
      }
    }).catch((e) => console.error("Toxicity check error:", e));

    return jsonResponse({ post }, 201);
  } catch (error) {
    console.error("Create post error:", error);
    return errorResponse("Internal server error", 500);
  }
}

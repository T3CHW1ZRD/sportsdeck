import prisma from "@/lib/prisma";
import { requireAuth, getUserFromRequest } from "@/lib/auth";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/threads/[id]
 * Get a specific thread with its posts, polls, and details.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const threadId = parseInt(id);

    if (isNaN(threadId)) {
      return errorResponse("Invalid thread ID", 400);
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        team: { select: { id: true, name: true, shortName: true, crest: true } },
        match: {
          include: {
            homeTeam: { select: { id: true, name: true, shortName: true, crest: true } },
            awayTeam: { select: { id: true, name: true, shortName: true, crest: true } },
          },
        },
        tags: { include: { tag: true } },
        polls: {
          where: { isHidden: false },
          include: {
            author: { select: { id: true, username: true } },
            options: {
              include: {
                _count: { select: { votes: true } },
              },
            },
            _count: { select: { votes: true } },
          },
        },
        _count: { select: { posts: true } },
      },
    });

    if (!thread || thread.isHidden) {
      return errorResponse("Thread not found", 404);
    }

    // Attach user's vote to each poll
    const authUser = await getUserFromRequest(request);
    let userVotes: Record<number, number> = {};
    if (authUser && thread.polls.length > 0) {
      const pollIds = thread.polls.map((p) => p.id);
      const votes = await prisma.pollVote.findMany({
        where: { userId: authUser.userId, pollId: { in: pollIds } },
        select: { pollId: true, pollOptionId: true },
      });
      userVotes = Object.fromEntries(votes.map((v) => [v.pollId, v.pollOptionId]));
    }

    return jsonResponse({
      thread: {
        ...thread,
        tags: thread.tags.map((tt) => tt.tag),
        polls: thread.polls.map((p) => ({ ...p, userVote: userVotes[p.id] || null })),
      },
    });
  } catch (error) {
    console.error("Get thread error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/threads/[id]
 * Update a thread. Only the author can edit.
 */
export async function PUT(request: Request, { params }: { params: Promise<Record<string, string>> }) {
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
      return errorResponse("You are banned and cannot edit threads", 403);
    }

    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) {
      return errorResponse("Thread not found", 404);
    }
    if (thread.isHidden) {
      return errorResponse("This thread has been hidden by a moderator", 403);
    }
    if (thread.authorId !== authUser.userId && authUser.role !== "ADMIN") {
      return errorResponse("You can only edit your own threads", 403);
    }

    const body = await request.json();
    const { title, content, tags } = body;
    if (title && title.length > 200) return errorResponse("Title must be 200 characters or less", 400);
    if (content && content.length > 10000) return errorResponse("Content must be 10000 characters or less", 400);

    const updateData: any = {};
    if (title) updateData.title = title;
    if (content) updateData.content = content;

    // Update tags if provided
    if (tags && Array.isArray(tags)) {
      // Remove old tags
      await prisma.threadTag.deleteMany({ where: { threadId } });

      // Add new tags
      for (const tagName of tags) {
        const normalizedName = tagName.trim().toLowerCase();
        if (!normalizedName) continue;

        let tag = await prisma.tag.findUnique({ where: { name: normalizedName } });
        if (!tag) {
          tag = await prisma.tag.create({ data: { name: normalizedName } });
        }
        await prisma.threadTag.create({
          data: { threadId, tagId: tag.id },
        });
      }
    }

    const updated = await prisma.thread.update({
      where: { id: threadId },
      data: updateData,
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        tags: { include: { tag: true } },
      },
    });

    return jsonResponse({
      thread: {
        ...updated,
        tags: updated.tags.map((tt) => tt.tag),
      },
    });
  } catch (error) {
    console.error("Update thread error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/threads/[id]
 * Delete a thread. Only the author or admin can delete.
 */
export async function DELETE(request: Request, { params }: { params: Promise<Record<string, string>> }) {
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
      return errorResponse("You are banned and cannot delete threads", 403);
    }

    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) {
      return errorResponse("Thread not found", 404);
    }
    if (thread.isHidden) {
      return errorResponse("Cannot delete a hidden thread", 403);
    }
    if (thread.authorId !== authUser.userId && authUser.role !== "ADMIN") {
      return errorResponse("You can only delete your own threads", 403);
    }

    await prisma.thread.delete({ where: { id: threadId } });

    return jsonResponse({ message: "Thread deleted successfully" });
  } catch (error) {
    console.error("Delete thread error:", error);
    return errorResponse("Internal server error", 500);
  }
}

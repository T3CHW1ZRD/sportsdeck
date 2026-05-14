import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/polls/[id]
 * Get a specific poll with options and vote counts.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const pollId = parseInt(id);

    if (isNaN(pollId)) {
      return errorResponse("Invalid poll ID", 400);
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        author: { select: { id: true, username: true } },
        thread: { select: { id: true, title: true } },
        options: {
          include: {
            _count: { select: { votes: true } },
          },
        },
        _count: { select: { votes: true } },
      },
    });

    if (!poll || poll.isHidden) {
      return errorResponse("Poll not found", 404);
    }

    const isExpired = new Date() > new Date(poll.deadline);

    return jsonResponse({
      poll: {
        ...poll,
        isExpired,
      },
    });
  } catch (error) {
    console.error("Get poll error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/polls/[id]
 * Update a poll. Only the author can edit.
 */
export async function PUT(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const pollId = parseInt(id);

    if (isNaN(pollId)) {
      return errorResponse("Invalid poll ID", 400);
    }

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot edit polls", 403);
    }

    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) {
      return errorResponse("Poll not found", 404);
    }
    if (poll.isHidden) {
      return errorResponse("Cannot edit a hidden poll", 403);
    }
    if (poll.authorId !== authUser.userId) {
      return errorResponse("You can only edit your own polls", 403);
    }

    const body = await request.json();
    const { question, deadline } = body;

    const updateData: any = {};
    if (question) updateData.question = question;
    if (deadline) {
      const deadlineDate = new Date(deadline);
      if (deadlineDate <= new Date()) {
        return errorResponse("Deadline must be in the future", 400);
      }
      updateData.deadline = deadlineDate;
    }

    const updated = await prisma.poll.update({
      where: { id: pollId },
      data: updateData,
      include: {
        options: {
          include: { _count: { select: { votes: true } } },
        },
      },
    });

    return jsonResponse({ poll: updated });
  } catch (error) {
    console.error("Update poll error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/polls/[id]
 * Delete a poll. Only the author or admin can delete.
 */
export async function DELETE(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const pollId = parseInt(id);

    if (isNaN(pollId)) {
      return errorResponse("Invalid poll ID", 400);
    }

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot delete polls", 403);
    }

    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) {
      return errorResponse("Poll not found", 404);
    }
    if (poll.authorId !== authUser.userId && authUser.role !== "ADMIN") {
      return errorResponse("You can only delete your own polls", 403);
    }

    await prisma.poll.delete({ where: { id: pollId } });

    return jsonResponse({ message: "Poll deleted successfully" });
  } catch (error) {
    console.error("Delete poll error:", error);
    return errorResponse("Internal server error", 500);
  }
}

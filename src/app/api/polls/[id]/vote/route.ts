import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/polls/[id]/vote
 * Vote on a poll option. Requires authentication.
 */
export async function POST(request: Request, { params }: { params: Promise<Record<string, string>> }) {
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
      return errorResponse("You are banned and cannot vote", 403);
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });

    if (!poll || poll.isHidden) {
      return errorResponse("Poll not found", 404);
    }

    // Check deadline
    if (new Date() > new Date(poll.deadline)) {
      return errorResponse("This poll has expired", 400);
    }

    const body = await request.json();
    const { optionId } = body;

    if (!optionId) {
      return errorResponse("optionId is required", 400);
    }

    // Validate option belongs to this poll
    const option = poll.options.find((o) => o.id === parseInt(optionId));
    if (!option) {
      return errorResponse("Invalid option for this poll", 400);
    }

    // Check if already voted
    const existingVote = await prisma.pollVote.findUnique({
      where: { userId_pollId: { userId: authUser.userId, pollId } },
    });

    if (existingVote) {
      // Update vote
      const vote = await prisma.pollVote.update({
        where: { id: existingVote.id },
        data: { pollOptionId: parseInt(optionId) },
      });
      return jsonResponse({ vote, message: "Vote updated" });
    }

    // Create new vote
    const vote = await prisma.pollVote.create({
      data: {
        userId: authUser.userId,
        pollId,
        pollOptionId: parseInt(optionId),
      },
    });

    return jsonResponse({ vote, message: "Vote recorded" }, 201);
  } catch (error) {
    console.error("Vote error:", error);
    return errorResponse("Internal server error", 500);
  }
}

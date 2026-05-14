import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/polls/[id]/results
 * Get the results of a poll.
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
        options: {
          include: {
            _count: { select: { votes: true } },
            votes: {
              select: {
                user: { select: { id: true, username: true } },
              },
            },
          },
        },
        _count: { select: { votes: true } },
      },
    });

    if (!poll || poll.isHidden) {
      return errorResponse("Poll not found", 404);
    }

    const totalVotes = poll._count.votes;
    const results = poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      votes: option._count.votes,
      percentage: totalVotes > 0 ? ((option._count.votes / totalVotes) * 100).toFixed(1) : "0.0",
    }));

    return jsonResponse({
      question: poll.question,
      deadline: poll.deadline,
      isExpired: new Date() > new Date(poll.deadline),
      totalVotes,
      results,
    });
  } catch (error) {
    console.error("Get poll results error:", error);
    return errorResponse("Internal server error", 500);
  }
}

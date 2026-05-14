import prisma from "@/lib/prisma";
import { getStandings } from "@/lib/footballApi";
import { jsonResponse, errorResponse } from "@/lib/helpers";
import { generateText } from "@/lib/ai";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * GET /api/ai/digest
 * Get the daily digest. If one doesn't exist for today, generate it.
 */
export async function GET(request: Request) {
  try {
    const today = formatLocalDate(new Date());

    // Check for existing digest
    const existing = await prisma.dailyDigest.findUnique({
      where: { date: today },
    });

    if (existing) {
      return jsonResponse({ digest: existing });
    }

    // Generate a new digest
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Get recent matches (last 7 days)
    const recentMatches = await prisma.match.findMany({
      where: {
        status: "FINISHED",
        utcDate: { gte: oneWeekAgo },
      },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { utcDate: "desc" },
      take: 10,
    });

    // Get recent active threads (last 7 days)
    const recentThreads = await prisma.thread.findMany({
      where: {
        isHidden: false,
        createdAt: { gte: oneWeekAgo },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
      include: {
        author: { select: { username: true } },
        _count: { select: { posts: true } },
        posts: {
          where: { isHidden: false },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            content: true,
            author: { select: { username: true } },
          },
        },
      },
    });

    // Build digest content
    let digestContent = `# SportsDeck Daily Digest - ${today}\n\n`;

    // Match results section
    if (recentMatches.length > 0) {
      digestContent += "## Recent Match Results\n\n";
      recentMatches.forEach((m) => {
        digestContent += `- **${m.homeTeam.name}** ${m.homeScore ?? "?"} - ${m.awayScore ?? "?"} **${m.awayTeam.name}**\n`;
      });
      digestContent += "\n";
    } else {
      digestContent += "## Recent Matches\nNo recent match results to report.\n\n";
    }

    // Standings summary
    try {
      const standingsData = await getStandings();
      if (standingsData.standings && standingsData.standings.length > 0) {
        const total = standingsData.standings.find((s: any) => s.type === "TOTAL");
        if (total && total.table) {
          digestContent += "## Current Top 5 Standings\n\n";
          total.table.slice(0, 5).forEach((entry: any, i: number) => {
            digestContent += `${i + 1}. **${entry.team.name}** - ${entry.points} pts (${entry.won}W ${entry.draw}D ${entry.lost}L)\n`;
          });
          digestContent += "\n";
        }
      }
    } catch (e) {
      digestContent += "## Standings\nStandings data currently unavailable.\n\n";
    }

    // Top discussions
    if (recentThreads.length > 0) {
      digestContent += "## Hot Discussions\n\n";
      recentThreads.forEach((t) => {
        digestContent += `- **${t.title}** by ${t.author.username} (${t._count.posts} replies)\n`;
        if (t.posts.length > 0) {
          t.posts.forEach((p) => {
            digestContent += `  - ${p.author.username}: "${p.content}"\n`;
          });
        }
      });
    }

    // use the parsed content to generate a daily digest

    const aiResult = await generateText(digestContent);
    const finalContent = aiResult.text || digestContent;

    // Save digest. If another request created today's digest first, return it.
    let digest;
    try {
      digest = await prisma.dailyDigest.create({
        data: {
          content: finalContent,
          date: today,
        },
      });
    } catch (createError: unknown) {
      const isDuplicateDateError =
        typeof createError === "object" &&
        createError !== null &&
        "code" in createError &&
        (createError as { code?: string }).code === "P2002";

      if (!isDuplicateDateError) {
        throw createError;
      }

      const existingDigest = await prisma.dailyDigest.findUnique({
        where: { date: today },
      });

      if (!existingDigest) {
        throw createError;
      }

      digest = existingDigest;
    }

    return jsonResponse({ digest, status: 200 });
  } catch (error) {
    console.error("Digest error:", error);
    return errorResponse("Failed to generate digest: " + (error instanceof Error ? error.message : String(error)), 500);
  }
}

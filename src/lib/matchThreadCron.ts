import prisma from "./prisma";

const ONE_DAY = 24 * 60 * 60 * 1000;
const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

async function createMatchThreads() {
  try {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) {
      console.log("[MatchThreadCron] No admin user found, skipping.");
      return;
    }

    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + TWO_WEEKS);
    const twoWeeksAgo = new Date(now.getTime() - TWO_WEEKS);

    const matches = await prisma.match.findMany({
      where: {
        utcDate: { gte: twoWeeksAgo, lte: twoWeeksFromNow },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    });

    let created = 0;
    for (const match of matches) {
      const existing = await prisma.thread.findFirst({
        where: { matchId: match.id, isAutoCreated: true },
      });
      if (existing) continue;

      const title = `${match.homeTeam.name} vs ${match.awayTeam.name} - Matchday ${match.matchday || ""}`;
      const dateStr = match.utcDate.toISOString().split("T")[0];
      const content = `Auto-generated discussion thread for the match between ${match.homeTeam.name} and ${match.awayTeam.name} on ${dateStr}. Share your thoughts, predictions, and reactions!`;

      await prisma.thread.create({
        data: {
          title,
          content,
          type: "MATCH",
          isAutoCreated: true,
          authorId: admin.id,
          matchId: match.id,
          teamId: match.homeTeamId,
        },
      });
      created++;
    }

    if (created > 0) {
      console.log(`[MatchThreadCron] Created ${created} match discussion threads.`);
    }
  } catch (error) {
    console.error("[MatchThreadCron] Error:", error);
  }
}

export function startMatchThreadCron() {
  console.log("[MatchThreadCron] Starting — runs daily.");

  // Run immediately on startup
  createMatchThreads();

  // Then once a day
  setInterval(createMatchThreads, ONE_DAY);
}

/**
 * Seed script: Fetches teams and matches from football-data.org
 * and stores them in the local database. Also creates auto-generated
 * match discussion threads and a default admin user.
 *
 * Usage: node scripts/seed.js
 */

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const BASE_URL = "https://api.football-data.org/v4";
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const COMPETITION = process.env.COMPETITION_CODE || "PL";

async function fetchFromAPI(endpoint: string) {
  if (!API_KEY) {
    throw new Error("FOOTBALL_DATA_API_KEY is not configured");
  }
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { "X-Auth-Token": API_KEY },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  return response.json();
}

async function seedTeams() {
  console.log("Fetching teams...");
  const data = await fetchFromAPI(`/competitions/${COMPETITION}/teams`);
  const teams = data.teams || [];

  for (const team of teams) {
    await prisma.team.upsert({
      where: { externalId: team.id },
      update: {
        name: team.name,
        shortName: team.shortName,
        tla: team.tla,
        crest: team.crest,
        venue: team.venue,
      },
      create: {
        externalId: team.id,
        name: team.name,
        shortName: team.shortName,
        tla: team.tla,
        crest: team.crest,
        venue: team.venue,
      },
    });
  }

  console.log(`Synced ${teams.length} teams.`);
}

async function seedMatches() {
  console.log("Fetching matches...");
  const data = await fetchFromAPI(`/competitions/${COMPETITION}/matches`);
  const matches = data.matches || [];

  let created = 0;
  let updated = 0;

  for (const match of matches) {
    const homeTeam = await prisma.team.findUnique({
      where: { externalId: match.homeTeam.id },
    });
    const awayTeam = await prisma.team.findUnique({
      where: { externalId: match.awayTeam.id },
    });

    if (!homeTeam || !awayTeam) {
      console.log(`  Skipping match ${match.id}: teams not found`);
      continue;
    }

    const matchData = {
      externalId: match.id,
      matchday: match.matchday,
      utcDate: new Date(match.utcDate),
      status: match.status,
      stage: match.stage,
      group: match.group,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore: match.score?.fullTime?.home ?? null,
      awayScore: match.score?.fullTime?.away ?? null,
      venue: match.venue || homeTeam.venue || null,
    };

    const existing = await prisma.match.findUnique({
      where: { externalId: match.id },
    });

    let dbMatch;
    if (existing) {
      dbMatch = await prisma.match.update({
        where: { externalId: match.id },
        data: matchData,
      });
      updated++;
    } else {
      dbMatch = await prisma.match.create({ data: matchData });
      created++;
    }
  }

  console.log(`Synced matches: ${created} created, ${updated} updated (${matches.length} total).`);
}

async function createMatchThreads() {
  console.log("Creating auto-generated match threads...");

  // Get the admin user to be the author of auto-created threads
  let admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.log("  No admin user found, creating one...");
    if (!process.env.ADMIN_PASSWORD) {
      throw new Error("ADMIN_PASSWORD is required to seed the initial admin user. Set it in your .env before running this script.");
    }
    admin = await prisma.user.create({
      data: {
        email: process.env.ADMIN_EMAIL || "admin@sportsdeck.com",
        password: bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10),
        username: process.env.ADMIN_USERNAME || "admin",
        role: "ADMIN",
      },
    });
  }

  // Get all matches that should have discussion threads (within 2 weeks window)
  const now = new Date();
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      utcDate: {
        gte: twoWeeksAgo,
        lte: twoWeeksFromNow,
      },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });

  let count = 0;
  for (const match of matches) {
    // Check if auto-created thread already exists for this match
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
        teamId: match.homeTeamId, // Associate with home team
      },
    });
    count++;
  }

  console.log(`Created ${count} match discussion threads.`);
}

async function createDefaultTags() {
  console.log("Creating default tags...");
  const defaultTags = [
    "match-discussion",
    "pre-match",
    "post-match",
    "transfer",
    "injury",
    "highlights",
    "tactics",
    "lineup",
    "predictions",
    "general",
  ];

  for (const tagName of defaultTags) {
    await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
  }

  console.log(`Created ${defaultTags.length} default tags.`);
}

async function createSampleUsers() {
  console.log("Creating sample users...");

  const users = [
    { email: "john@example.com", username: "john_gunner", password: "password123" },
    { email: "sarah@example.com", username: "sarah_red", password: "password123" },
    { email: "mike@example.com", username: "mike_blue", password: "password123" },
    { email: "emma@example.com", username: "emma_spurs", password: "password123" },
    { email: "alex@example.com", username: "alex_hammer", password: "password123" },
  ];

  const teams = await prisma.team.findMany({ take: 5 });
  const created = [];

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      created.push(existing);
      continue;
    }
    const user = await prisma.user.create({
      data: {
        email: u.email,
        username: u.username,
        password: bcrypt.hashSync(u.password, 10),
        favoriteTeamId: teams[i] ? teams[i].id : null,
      },
    });
    created.push(user);
  }

  console.log(`Created ${created.length} sample users.`);
  return created;
}

async function createSampleContent(users: Array<{ id: number }>) {
  console.log("Creating sample threads, posts, and polls...");

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const allUsers = [admin, ...users].filter(Boolean);
  const teams = await prisma.team.findMany({ take: 5 });
  const tags = await prisma.tag.findMany();

  const threadData = [
    { title: "Who wins the title this season?", content: "With the season heating up, which team do you think takes the crown? Share your predictions and reasoning!", type: "GENERAL" },
    { title: "Best signings of the winter window", content: "The transfer window just closed. Which clubs made the smartest moves? Any sleeper picks that could make a big impact?", type: "GENERAL" },
    { title: "VAR decisions getting out of hand", content: "Another weekend, another controversial VAR call. Are we better off with it or should we scrap the whole thing? Discuss.", type: "GENERAL" },
    { title: "Team discussion: Tactics and formation", content: "Let's break down the latest tactical setups. What's working, what's not, and what would you change?", type: "TEAM", teamIdx: 0 },
    { title: "Matchday predictions thread", content: "Drop your score predictions for this weekend's matches. Let's see who gets the closest!", type: "GENERAL" },
    { title: "Young players to watch this season", content: "Which youngsters are breaking through? Any academy products ready for the first team?", type: "GENERAL" },
    { title: "Manager performance ratings", content: "How would you rate your manager's performance so far? Give them a score out of 10 and explain why.", type: "GENERAL" },
    { title: "Stadium atmosphere rankings", content: "Which ground has the best matchday atmosphere in the league? Share your experiences!", type: "GENERAL" },
  ];

  const samplePosts = [
    "Great take! I completely agree with this.",
    "Not sure about that one, I think you're overlooking the defensive issues.",
    "This is exactly what I've been saying. The midfield needs reinforcement.",
    "Interesting perspective. I hadn't thought about it that way before.",
    "Can we talk about how underrated the keeper has been this season?",
    "The stats don't lie - this team has been the best since Christmas.",
    "I was at the match last weekend and the atmosphere was incredible.",
    "People sleeping on this squad. They're going to surprise everyone.",
    "Fair point, but I think the injuries have been a bigger factor than tactics.",
    "Anyone else notice the change in pressing intensity lately?",
    "Hot take: this season's title race is the best in years.",
    "The youth academy is producing some serious talent right now.",
  ];

  for (let i = 0; i < threadData.length; i++) {
    const td = threadData[i];
    const author = allUsers[i % allUsers.length];

    const thread = await prisma.thread.create({
      data: {
        title: td.title,
        content: td.content,
        type: td.type,
        authorId: author.id,
        teamId: td.teamIdx !== undefined && teams[td.teamIdx] ? teams[td.teamIdx].id : null,
      },
    });

    // Add 1-2 random tags
    const shuffled = [...tags].sort(() => Math.random() - 0.5);
    for (let t = 0; t < Math.min(2, shuffled.length); t++) {
      await prisma.threadTag.create({
        data: { threadId: thread.id, tagId: shuffled[t].id },
      }).catch(() => {}); // ignore duplicate
    }

    // Add 2-4 posts per thread
    const postCount = 2 + Math.floor(Math.random() * 3);
    for (let p = 0; p < postCount; p++) {
      const postAuthor = allUsers[(i + p + 1) % allUsers.length];
      const postContent = samplePosts[(i * 3 + p) % samplePosts.length];
      await prisma.post.create({
        data: {
          content: postContent,
          threadId: thread.id,
          authorId: postAuthor.id,
        },
      });
    }
  }

  // Create a sample poll in the first thread
  const firstThread = await prisma.thread.findFirst({ orderBy: { id: "asc" } });
  if (firstThread) {
    await prisma.poll.create({
      data: {
        question: "Who will win the Premier League title?",
        threadId: firstThread.id,
        authorId: allUsers[0].id,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        options: {
          create: [
            { text: "Arsenal" },
            { text: "Manchester City" },
            { text: "Liverpool" },
            { text: "Other" },
          ],
        },
      },
    });
  }

  // Create some follow relationships
  for (let i = 0; i < allUsers.length; i++) {
    for (let j = i + 1; j < allUsers.length && j < i + 3; j++) {
      await prisma.follow.create({
        data: { followerId: allUsers[i].id, followingId: allUsers[j].id },
      }).catch(() => {});
    }
  }

  console.log("Created sample threads, posts, polls, and follows.");
}

async function main() {
  console.log("=== SportsDeck Seed Script ===");
  console.log(`Competition: ${COMPETITION}`);
  console.log("");

  try {
    await seedTeams();
    console.log("Waiting 10 seconds for API rate limit...");
    await new Promise((r) => setTimeout(r, 10000));
    await seedMatches();
    await createMatchThreads();
    await createDefaultTags();
    const users = await createSampleUsers();
    await createSampleContent(users);

    console.log("\n=== Seed complete! ===");
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

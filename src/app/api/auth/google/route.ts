import prisma from "@/lib/prisma";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/auth/google
 * Authenticate using a Google OAuth access token (from @react-oauth/google useGoogleLogin).
 * Finds or creates a user based on their Google account, then returns JWT tokens.
 */
export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (!token) return errorResponse("Google token is required", 400);

    const googleRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!googleRes.ok) return errorResponse("Invalid Google token", 401);

    const { id: providerId, email, name, picture } = await googleRes.json();

    if (!email) return errorResponse("Could not retrieve email from Google", 400);

    let user = await prisma.user.findFirst({
      where: { OR: [{ email }, { provider: "google", providerId }] },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        isBanned: true,
        favoriteTeamId: true,
        provider: true,
        providerId: true,
      },
    });

    if (!user) {
      const base = (name || email.split("@")[0])
        .replace(/[^a-zA-Z0-9_]/g, "")
        .toLowerCase()
        .slice(0, 20) || "user";

      let username = base;
      let i = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${base}${i++}`;
      }

      user = await prisma.user.create({
        data: {
          email,
          username,
          avatar: picture ?? null,
          provider: "google",
          providerId,
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          avatar: true,
          isBanned: true,
          favoriteTeamId: true,
          provider: true,
          providerId: true,
        },
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return jsonResponse({ user, accessToken, refreshToken });
  } catch (err) {
    console.error("Google auth error:", err);
    return errorResponse("Internal server error", 500);
  }
}

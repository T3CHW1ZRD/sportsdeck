import prisma from "@/lib/prisma";
import { comparePassword, generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/auth/login
 * Log in with email and password. Returns JWT tokens.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse("Email and password are required", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        role: true,
        avatar: true,
        isBanned: true,
        favoriteTeamId: true,
        provider: true,
      },
    });

    if (!user || !user?.password) {
      return errorResponse("Invalid email or password", 401);
    }

    if (!comparePassword(password, user.password)) {
      return errorResponse("Invalid email or password", 401);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const { password: _, ...userWithoutPassword } = user;

    return jsonResponse({
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse("Internal server error", 500);
  }
}

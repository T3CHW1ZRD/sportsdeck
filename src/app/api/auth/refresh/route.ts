import prisma from "@/lib/prisma";
import { verifyRefreshToken, generateAccessToken, generateRefreshToken, isRefreshTokenBlacklisted } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/auth/refresh
 * Refresh the access token using a refresh token.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return errorResponse("Refresh token is required", 400);
    }

    if (await isRefreshTokenBlacklisted(refreshToken)) {
      return errorResponse("Token has been revoked", 401);
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return errorResponse("Invalid or expired refresh token", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      return errorResponse("User not found", 404);
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    return jsonResponse({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return errorResponse("Internal server error", 500);
  }
}

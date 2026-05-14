import { requireAuth, blacklistRefreshToken, blacklistAccessToken } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/auth/logout
 * Invalidates the provided refresh token so it can no longer be used.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    if (!user) {
      return errorResponse("Unauthorized", 401);
    }

    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return errorResponse("Refresh token is required", 400);
    }

    // Blacklist both tokens
    await blacklistRefreshToken(refreshToken);
    const authHeader = request.headers.get("Authorization");
    const accessToken = authHeader?.split(" ")[1];
    if (accessToken) {
      await blacklistAccessToken(accessToken);
    }

    return jsonResponse({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return errorResponse("Internal server error", 500);
  }
}

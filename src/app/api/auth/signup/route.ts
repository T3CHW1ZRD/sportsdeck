import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/auth/signup
 * Register a new user with email, password, and username.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, username } = body;

    if (!email || !password || !username) {
      return errorResponse("Email, password, and username are required", 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse("Invalid email format", 400);
    }

    // Validate password length
    if (password.length < 6) {
      return errorResponse("Password must be at least 6 characters", 400);
    }

    // Validate username length
    if (username.length < 3 || username.length > 30) {
      return errorResponse("Username must be between 3 and 30 characters", 400);
    }

    // Check if email or username already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return errorResponse("Email already in use", 409);
      }
      return errorResponse("Username already taken", 409);
    }

    const hashedPassword = hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return jsonResponse(
      {
        user,
        accessToken,
        refreshToken,
      },
      201
    );
  } catch (error) {
    console.error("Signup error:", error);
    return errorResponse("Internal server error", 500);
  }
}

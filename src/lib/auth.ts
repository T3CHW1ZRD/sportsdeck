import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getCached, setCached, CACHE_KEYS } from "./cache";
import type { AccessTokenPayload, RefreshTokenPayload } from "@/types/api";

const JWT_SECRET = process.env.JWT_SECRET || "sportsdeck-secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "sportsdeck-refresh-secret";

interface TokenUser {
  id: number;
  email: string;
  role: string;
}

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

function generateAccessToken(user: TokenUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function generateRefreshToken(user: TokenUser): string {
  return jwt.sign(
    { userId: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || typeof decoded === "string") {
      return null;
    }
    if (typeof decoded.userId !== "number" || typeof decoded.role !== "string" || typeof decoded.email !== "string") {
      return null;
    }
    return decoded as AccessTokenPayload;
  } catch {
    return null;
  }
}

function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    if (!decoded || typeof decoded === "string") {
      return null;
    }
    if (typeof decoded.userId !== "number") {
      return null;
    }
    return decoded as RefreshTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extract and verify the user from a request's Authorization header.
 * Returns the decoded payload or null if not authenticated.
 */
async function getUserFromRequest(request: Request): Promise<AccessTokenPayload | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  if (await isAccessTokenBlacklisted(token)) {
    return null;
  }
  return verifyAccessToken(token);
}

/**
 * Require authentication. Returns the user payload or a 401 Response.
 */
async function requireAuth(request: Request): Promise<AccessTokenPayload | null> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return null;
  }
  return user;
}

/**
 * Require admin role. Returns the user payload or null.
 */
async function requireAdmin(request: Request): Promise<AccessTokenPayload | null> {
  const user = await getUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return null;
  }
  return user;
}

async function blacklistRefreshToken(token: string): Promise<void> {
  const decoded = verifyRefreshToken(token);
  if (!decoded) return;
  const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 7 * 86400;
  if (ttl > 0) await setCached(CACHE_KEYS.BLACKLIST_RT(token), true, ttl);
}

async function isRefreshTokenBlacklisted(token: string): Promise<boolean> {
  return !!(await getCached(CACHE_KEYS.BLACKLIST_RT(token)));
}

async function blacklistAccessToken(token: string): Promise<void> {
  const decoded = verifyAccessToken(token);
  if (!decoded) return;
  const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
  if (ttl > 0) await setCached(CACHE_KEYS.BLACKLIST_AT(token), true, ttl);
}

async function isAccessTokenBlacklisted(token: string): Promise<boolean> {
  return !!(await getCached(CACHE_KEYS.BLACKLIST_AT(token)));
}

export {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getUserFromRequest,
  requireAuth,
  requireAdmin,
  blacklistRefreshToken,
  isRefreshTokenBlacklisted,
  blacklistAccessToken,
  isAccessTokenBlacklisted,
};

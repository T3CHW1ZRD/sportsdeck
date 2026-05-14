import type { JwtPayload } from "jsonwebtoken";

export type RouteContext<TParams extends Record<string, string>> = {
  params: Promise<TParams>;
};

export interface AccessTokenPayload extends JwtPayload {
  userId: number;
  email: string;
  role: string;
}

export interface RefreshTokenPayload extends JwtPayload {
  userId: number;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import type { AdminRole } from "./permissions";

export const SESSION_COOKIE = "admin_session";

export interface AdminSession {
  userId: string;
  email: string;
  name: string;
  role: AdminRole;
}

function getSecret() {
  const secret = process.env.JWT_SECRET ?? process.env.ADMIN_KEY;
  if (!secret) throw new Error("JWT_SECRET or ADMIN_KEY must be set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: AdminSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getRequestSession(
  request: NextRequest
): Promise<AdminSession | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Express-compatible session lookup from raw Cookie header */
export async function getSessionFromCookieHeader(
  cookieHeader: string | undefined
): Promise<AdminSession | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`)
  );
  if (!match) return null;
  return verifySessionToken(decodeURIComponent(match[1]));
}

export function sessionCookieOptions(maxAge = 60 * 60 * 8) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

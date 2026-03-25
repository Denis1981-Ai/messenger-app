import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { assertRuntimeConfig } from "@/lib/server/env";
import { toClientUser } from "@/lib/server/user-display";

const shouldUseSecureCookies = () =>
  process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE === "true";

const SESSION_COOKIE_NAME = "messenger_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const getSessionExpiry = () => new Date(Date.now() + SESSION_TTL_MS);

export const assertSessionConfig = () => {
  assertRuntimeConfig();
};

const setSessionCookie = async (sessionId: string, expiresAt: Date) => {
  const cookieStore = await cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
};

export const clearSessionCookie = async () => {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
};

export const createSession = async (userId: string) => {
  assertSessionConfig();

  const id = randomUUID();
  const expiresAt = getSessionExpiry();

  await prisma.session.create({
    data: {
      id,
      userId,
      expiresAt,
    },
  });

  await setSessionCookie(id, expiresAt);

  return {
    id,
    expiresAt,
  };
};

export const destroyCurrentSession = async () => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    await prisma.session.deleteMany({
      where: {
        id: sessionId,
      },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
};

export const getCurrentSessionUser = async () => {
  assertSessionConfig();

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    await clearSessionCookie();
    return null;
  }

  if (session.expiresAt <= new Date() || !session.user.isActive) {
    await prisma.session.deleteMany({
      where: {
        id: sessionId,
      },
    });
    await clearSessionCookie();
    return null;
  }

  return {
    sessionId: session.id,
    user: toClientUser(session.user),
  };
};

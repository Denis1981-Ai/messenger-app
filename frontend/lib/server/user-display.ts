import { resolvePresenceStatus } from "@/lib/presence";

export const MAX_DISPLAY_NAME_LENGTH = 80;

const normalize = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const resolveUserDisplayName = (user: {
  displayName?: string | null;
  login: string;
}) => normalize(user.displayName) || user.login;

export const normalizeDisplayNameInput = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`);
  }

  return trimmed;
};

export const toClientUser = (user: {
  id: string;
  login: string;
  displayName?: string | null;
  lastSeenAt?: string | Date | null;
}) => ({
  id: user.id,
  login: user.login,
  displayName: normalize(user.displayName),
  name: resolveUserDisplayName(user),
  lastSeenAt: user.lastSeenAt ? new Date(user.lastSeenAt).toISOString() : null,
  presence: resolvePresenceStatus(user.lastSeenAt),
});

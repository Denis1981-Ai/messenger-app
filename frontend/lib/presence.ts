export type PresenceStatus = "online" | "offline";

export const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 60 * 1000;

const toDate = (value?: string | Date | null) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const resolvePresenceStatus = (lastSeenAt?: string | Date | null, now = new Date()): PresenceStatus => {
  const seenAt = toDate(lastSeenAt);

  if (!seenAt) {
    return "offline";
  }

  return now.getTime() - seenAt.getTime() <= PRESENCE_ONLINE_WINDOW_MS ? "online" : "offline";
};

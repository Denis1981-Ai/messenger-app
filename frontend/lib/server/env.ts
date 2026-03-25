const REQUIRED_ENV_KEYS = ["DATABASE_URL", "SESSION_SECRET"] as const;
const DANGEROUS_SESSION_SECRETS = new Set([
  "change-me-before-production",
  "dev-session-secret-change-me",
  "changeme",
  "password",
  "secret",
]);

const getEnv = (name: (typeof REQUIRED_ENV_KEYS)[number]) => process.env[name]?.trim() || "";

export const assertRuntimeConfig = () => {
  for (const key of REQUIRED_ENV_KEYS) {
    if (!getEnv(key)) {
      throw new Error(`${key} is not configured.`);
    }
  }

  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
  }

  const sessionSecret = getEnv("SESSION_SECRET");
  if (process.env.NODE_ENV === "production") {
    if (sessionSecret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters in production.");
    }

    if (DANGEROUS_SESSION_SECRETS.has(sessionSecret)) {
      throw new Error("SESSION_SECRET uses an unsafe development value.");
    }

    const secureCookie = process.env.SESSION_COOKIE_SECURE?.trim();
    if (secureCookie !== "true" && secureCookie !== "false") {
      throw new Error("SESSION_COOKIE_SECURE must be explicitly set to true or false in production.");
    }
  }
};
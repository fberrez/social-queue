import "dotenv/config";
import type { Platform } from "./types.js";

interface Config {
  bluesky: {
    service: string;
    identifier: string;
    password: string;
  } | null;
  mastodon: {
    url: string;
    accessToken: string;
  } | null;
  linkedin: {
    accessToken: string;
    personId: string;
  } | null;
  pollIntervalMs: number;
}

function loadPlatformConfig<T>(
  name: string,
  loader: () => T | null,
): T | null {
  try {
    const config = loader();
    if (config) {
      console.log(`[config] ${name}: configured`);
    }
    return config;
  } catch {
    console.log(`[config] ${name}: not configured`);
    return null;
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

export function loadConfig(): Config {
  const bluesky = loadPlatformConfig("bluesky", () => {
    return {
      service: requireEnv("BLUESKY_SERVICE"),
      identifier: requireEnv("BLUESKY_IDENTIFIER"),
      password: requireEnv("BLUESKY_PASSWORD"),
    };
  });

  const mastodon = loadPlatformConfig("mastodon", () => {
    return {
      url: requireEnv("MASTODON_URL"),
      accessToken: requireEnv("MASTODON_ACCESS_TOKEN"),
    };
  });

  const linkedin = loadPlatformConfig("linkedin", () => {
    return {
      accessToken: requireEnv("LINKEDIN_ACCESS_TOKEN"),
      personId: requireEnv("LINKEDIN_PERSON_ID"),
    };
  });

  return {
    bluesky,
    mastodon,
    linkedin,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "60000", 10),
  };
}

export function isPlatformConfigured(
  config: Config,
  platform: Platform,
): boolean {
  return config[platform] !== null;
}

export type { Config };

export type Platform = "bluesky" | "mastodon" | "linkedin";

export interface Post {
  filename: string;
  content: string;
  platforms: Platform[];
  scheduledAt?: Date;
  raw: string;
}

export interface PublishResult {
  platform: Platform;
  success: boolean;
  url?: string;
  error?: string;
}

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Platform, Post } from "./types.js";

const QUEUE_DIR = path.resolve("queue");
const SENT_DIR = path.resolve("sent");
const FAILED_DIR = path.resolve("failed");

const VALID_PLATFORMS: Platform[] = ["bluesky", "mastodon", "linkedin"];

function parsePlatforms(raw: unknown): Platform[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is Platform =>
      typeof p === "string" && VALID_PLATFORMS.includes(p as Platform),
  );
}

export async function getPendingPosts(): Promise<Post[]> {
  const files = await fs.readdir(QUEUE_DIR);
  const mdFiles = files.filter((f) => f.endsWith(".md") && f !== ".gitkeep");

  const posts: Post[] = [];
  const now = new Date();

  for (const filename of mdFiles) {
    const filePath = path.join(QUEUE_DIR, filename);
    const raw = await fs.readFile(filePath, "utf-8");
    const { data, content } = matter(raw);

    const platforms = parsePlatforms(data.platforms);
    if (platforms.length === 0) {
      console.log(`[queue] skipping ${filename}: no valid platforms`);
      continue;
    }

    let scheduledAt: Date | undefined;
    if (data.scheduledAt) {
      scheduledAt = new Date(data.scheduledAt);
      if (scheduledAt > now) {
        console.log(
          `[queue] skipping ${filename}: scheduled for ${scheduledAt.toISOString()}`,
        );
        continue;
      }
    }

    posts.push({
      filename,
      content: content.trim(),
      platforms,
      scheduledAt,
      raw,
    });
  }

  return posts;
}

export async function moveToSent(filename: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(SENT_DIR, `${timestamp}_${filename}`);
  await fs.rename(path.join(QUEUE_DIR, filename), dest);
  console.log(`[queue] moved ${filename} -> sent/`);
}

export async function moveToFailed(
  filename: string,
  errors: string[],
): Promise<void> {
  const filePath = path.join(QUEUE_DIR, filename);
  const raw = await fs.readFile(filePath, "utf-8");
  const { data, content } = matter(raw);

  // Append error details to frontmatter
  data.errors = errors;
  data.failedAt = new Date().toISOString();

  const updated = matter.stringify(content, data);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(FAILED_DIR, `${timestamp}_${filename}`);

  await fs.writeFile(dest, updated, "utf-8");
  await fs.unlink(filePath);
  console.log(`[queue] moved ${filename} -> failed/`);
}

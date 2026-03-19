import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Platform, Post } from "./types.js";
import { parseImages } from "./images.js";

const QUEUE_DIR = path.resolve("queue");
const SENT_DIR = path.resolve("sent");
const FAILED_DIR = path.resolve("failed");

const VALID_PLATFORMS: Platform[] = ["bluesky", "mastodon", "linkedin", "medium", "devto", "substack"];
const BLOG_PLATFORMS: Platform[] = ["medium", "devto", "substack"];

const loggedScheduled = new Set<string>();

function parsePlatforms(raw: unknown): Platform[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is Platform =>
      typeof p === "string" && VALID_PLATFORMS.includes(p as Platform),
  );
}

async function isDirectory(fullPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(fullPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function findMdFile(dirPath: string): Promise<string | null> {
  const entries = await fs.readdir(dirPath);
  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  if (mdFiles.length === 1) return mdFiles[0];
  if (mdFiles.length === 0) return null;
  // Multiple .md files: prefer post.md
  if (mdFiles.includes("post.md")) return "post.md";
  return mdFiles[0];
}

export async function getPendingPosts(): Promise<Post[]> {
  const entries = await fs.readdir(QUEUE_DIR);
  const posts: Post[] = [];
  const now = new Date();

  for (const entry of entries) {
    if (entry === ".gitkeep") continue;

    const fullPath = path.join(QUEUE_DIR, entry);
    const isDir = await isDirectory(fullPath);

    let filename: string;
    let mdFilePath: string;
    let postDir: string | undefined;

    if (isDir) {
      const mdFile = await findMdFile(fullPath);
      if (!mdFile) {
        console.log(`[queue] skipping directory ${entry}: no .md file found`);
        continue;
      }
      filename = entry; // use directory name as the post identifier
      mdFilePath = path.join(fullPath, mdFile);
      postDir = fullPath;
    } else if (entry.endsWith(".md")) {
      filename = entry;
      mdFilePath = fullPath;
    } else {
      continue;
    }

    const raw = await fs.readFile(mdFilePath, "utf-8");
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
        if (!loggedScheduled.has(filename)) {
          console.log(
            `[queue] scheduled ${filename} for ${scheduledAt.toISOString()}`,
          );
          loggedScheduled.add(filename);
        }
        continue;
      }
    }

    let images: import("./types.js").ImageAttachment[] = [];
    if (data.images) {
      try {
        images = await parseImages(data.images, postDir ?? path.dirname(mdFilePath));
      } catch (err) {
        console.log(
          `[queue] skipping ${filename}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
    }

    const title: string | undefined = typeof data.title === "string" ? data.title : undefined;
    const hasBlogPlatform = platforms.some((p) => BLOG_PLATFORMS.includes(p));
    if (hasBlogPlatform && !title) {
      console.log(`[queue] skipping ${filename}: title is required for blog platforms (${BLOG_PLATFORMS.join(", ")})`);
      continue;
    }

    posts.push({
      filename,
      content: content.trim(),
      platforms,
      scheduledAt,
      raw,
      title,
      images,
      postDir,
    });
  }

  for (const name of loggedScheduled) {
    if (!entries.includes(name)) {
      loggedScheduled.delete(name);
    }
  }

  return posts;
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function removeDirectory(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export async function moveToSent(post: Post): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (post.postDir) {
    const dest = path.join(SENT_DIR, `${timestamp}_${post.filename}`);
    await copyDirectory(post.postDir, dest);
    await removeDirectory(post.postDir);
  } else {
    const src = path.join(QUEUE_DIR, post.filename);
    const dest = path.join(SENT_DIR, `${timestamp}_${post.filename}`);
    await fs.copyFile(src, dest);
    await fs.unlink(src);
  }

  console.log(`[queue] moved ${post.filename} -> sent/`);
}

export async function moveToFailed(
  post: Post,
  errors: string[],
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (post.postDir) {
    // For directory posts, write error info into the .md file
    const mdFile = await findMdFile(post.postDir);
    if (mdFile) {
      const mdPath = path.join(post.postDir, mdFile);
      const raw = await fs.readFile(mdPath, "utf-8");
      const { data, content } = matter(raw);
      data.errors = errors;
      data.failedAt = new Date().toISOString();
      const updated = matter.stringify(content, data);
      await fs.writeFile(mdPath, updated, "utf-8");
    }

    const dest = path.join(FAILED_DIR, `${timestamp}_${post.filename}`);
    await copyDirectory(post.postDir, dest);
    await removeDirectory(post.postDir);
  } else {
    const filePath = path.join(QUEUE_DIR, post.filename);
    const raw = await fs.readFile(filePath, "utf-8");
    const { data, content } = matter(raw);

    data.errors = errors;
    data.failedAt = new Date().toISOString();

    const updated = matter.stringify(content, data);
    const dest = path.join(FAILED_DIR, `${timestamp}_${post.filename}`);

    await fs.writeFile(dest, updated, "utf-8");
    await fs.unlink(filePath);
  }

  console.log(`[queue] moved ${post.filename} -> failed/`);
}

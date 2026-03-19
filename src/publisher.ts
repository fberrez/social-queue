import type { Config } from "./config.js";
import { isPlatformConfigured } from "./config.js";
import { moveToFailed, moveToSent } from "./queue.js";
import type { Post, PublishResult } from "./types.js";
import { publishToBluesky } from "./platforms/bluesky.js";
import { publishToMastodon } from "./platforms/mastodon.js";
import { publishToLinkedIn } from "./platforms/linkedin.js";
import { publishToMedium } from "./platforms/medium.js";
import { publishToDevto } from "./platforms/devto.js";
import { publishToSubstack } from "./platforms/substack.js";

async function publishToPlatform(
  post: Post,
  platform: Post["platforms"][number],
  config: Config,
): Promise<PublishResult> {
  switch (platform) {
    case "bluesky":
      if (!config.bluesky) throw new Error("Bluesky not configured");
      return publishToBluesky(post.content, config.bluesky, post.images);
    case "mastodon":
      if (!config.mastodon) throw new Error("Mastodon not configured");
      return publishToMastodon(post.content, config.mastodon, post.images);
    case "linkedin":
      if (!config.linkedin) throw new Error("LinkedIn not configured");
      return publishToLinkedIn(post.content, config.linkedin, post.images);
    case "medium":
      if (!config.medium) throw new Error("Medium not configured");
      return publishToMedium(post.content, post.title!, config.medium);
    case "devto":
      if (!config.devto) throw new Error("Dev.to not configured");
      return publishToDevto(post.content, post.title!, config.devto);
    case "substack":
      if (!config.substack) throw new Error("Substack not configured");
      return publishToSubstack(post.content, post.title!, config.substack);
  }
}

export async function publishPost(
  post: Post,
  config: Config,
): Promise<PublishResult[]> {
  // Filter platforms that are actually configured
  const activePlatforms = post.platforms.filter((p) =>
    isPlatformConfigured(config, p),
  );

  if (activePlatforms.length === 0) {
    console.log(`[publisher] ${post.filename}: no configured platforms`);
    await moveToFailed(post, [
      "No configured platforms for: " + post.platforms.join(", "),
    ]);
    return [];
  }

  const settled = await Promise.allSettled(
    activePlatforms.map((platform) =>
      publishToPlatform(post, platform, config),
    ),
  );

  const results: PublishResult[] = settled.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      platform: activePlatforms[i],
      success: false,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    };
  });

  const failures = results.filter((r) => !r.success);
  const successes = results.filter((r) => r.success);

  for (const r of successes) {
    console.log(`[publisher] ${post.filename} -> ${r.platform}: ${r.url}`);
  }
  for (const r of failures) {
    console.log(
      `[publisher] ${post.filename} -> ${r.platform}: FAILED - ${r.error}`,
    );
  }

  if (failures.length === 0) {
    await moveToSent(post);
  } else {
    await moveToFailed(
      post,
      failures.map((r) => `${r.platform}: ${r.error}`),
    );
  }

  return results;
}

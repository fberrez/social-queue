import { loadConfig } from "./config.js";
import { getPendingPosts } from "./queue.js";
import { publishPost } from "./publisher.js";

const config = loadConfig();

async function tick() {
  const posts = await getPendingPosts();

  if (posts.length === 0) return;

  console.log(`[worker] found ${posts.length} pending post(s)`);

  for (const post of posts) {
    console.log(
      `[worker] publishing ${post.filename} to ${post.platforms.join(", ")}`,
    );
    await publishPost(post, config);
  }
}

console.log("[worker] starting social-queue");
console.log(`[worker] polling every ${config.pollIntervalMs}ms`);

// Run immediately on start
tick().catch((err) => console.error("[worker] tick error:", err));

// Poll on interval
const interval = setInterval(() => {
  tick().catch((err) => console.error("[worker] tick error:", err));
}, config.pollIntervalMs);

// Graceful shutdown
function shutdown() {
  console.log("\n[worker] shutting down...");
  clearInterval(interval);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

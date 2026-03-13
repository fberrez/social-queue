import type { Config } from "../config.js";
import type { PublishResult } from "../types.js";
import { toPlaintext } from "../markdown.js";

export async function publishToLinkedIn(
  content: string,
  config: NonNullable<Config["linkedin"]>,
): Promise<PublishResult> {
  const text = toPlaintext(content);

  const body = {
    author: `urn:li:person:${config.personId}`,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
    },
    lifecycleState: "PUBLISHED",
  };

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202602",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LinkedIn API error (${response.status}): ${errorText}`,
    );
  }

  // LinkedIn returns the post ID in the x-restli-id header
  const postId = response.headers.get("x-restli-id");
  const url = postId
    ? `https://www.linkedin.com/feed/update/${postId}`
    : undefined;

  return {
    platform: "linkedin",
    success: true,
    url,
  };
}

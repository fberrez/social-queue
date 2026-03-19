import type { Config } from "../config.js";
import type { PublishResult } from "../types.js";

export async function publishToDevto(
  content: string,
  title: string,
  config: NonNullable<Config["devto"]>,
): Promise<PublishResult> {
  const response = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      article: {
        title,
        body_markdown: content,
        published: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Dev.to API error (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as { url: string };

  return {
    platform: "devto",
    success: true,
    url: data.url,
  };
}

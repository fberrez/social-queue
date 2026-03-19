import type { Config } from "../config.js";
import type { PublishResult } from "../types.js";
import { toHtml } from "../markdown.js";

export async function publishToMedium(
  content: string,
  title: string,
  config: NonNullable<Config["medium"]>,
): Promise<PublishResult> {
  // Get user ID
  const meResponse = await fetch("https://api.medium.com/v1/me", {
    headers: {
      Authorization: `Bearer ${config.integrationToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!meResponse.ok) {
    const errorText = await meResponse.text();
    throw new Error(
      `Medium API error getting user (${meResponse.status}): ${errorText}`,
    );
  }

  const meData = (await meResponse.json()) as { data: { id: string } };
  const userId = meData.data.id;

  // Create post
  const response = await fetch(
    `https://api.medium.com/v1/users/${userId}/posts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.integrationToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        title,
        contentFormat: "html",
        content: toHtml(content),
        publishStatus: "public",
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Medium API error (${response.status}): ${errorText}`,
    );
  }

  const postData = (await response.json()) as { data: { url: string } };

  return {
    platform: "medium",
    success: true,
    url: postData.data.url,
  };
}

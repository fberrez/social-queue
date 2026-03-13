import { AtpAgent, CredentialSession } from "@atproto/api";
import type { Config } from "../config.js";
import type { PublishResult } from "../types.js";
import { toPlaintext } from "../markdown.js";

export async function publishToBluesky(
  content: string,
  config: NonNullable<Config["bluesky"]>,
): Promise<PublishResult> {
  const session = new CredentialSession(new URL(config.service));
  const agent = new AtpAgent(session);

  await agent.login({
    identifier: config.identifier,
    password: config.password,
  });

  const text = toPlaintext(content);

  const response = await agent.post({ text });

  // Build the post URL from the agent's DID and the rkey
  const uri = response.uri; // at://did:plc:xxx/app.bsky.feed.post/rkey
  const parts = uri.split("/");
  const rkey = parts[parts.length - 1];
  const did = session.did;
  const url = `https://bsky.app/profile/${did}/post/${rkey}`;

  return {
    platform: "bluesky",
    success: true,
    url,
  };
}

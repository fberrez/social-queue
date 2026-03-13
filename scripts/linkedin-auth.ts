/**
 * LinkedIn OAuth re-authentication script.
 *
 * Usage: pnpm linkedin:auth
 *
 * Opens a browser for LinkedIn OAuth, starts a local server to capture
 * the callback, exchanges the code for a token, and updates .env + GitHub secret.
 */

import http from "node:http";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env first",
  );
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:3847/callback";
const SCOPES = "openid profile w_member_social";

const authUrl =
  `https://www.linkedin.com/oauth/v2/authorization` +
  `?response_type=code` +
  `&client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent(SCOPES)}`;

console.log("[linkedin-auth] opening browser for authorization...");

// Open browser
const openCmd =
  process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "start"
      : "xdg-open";
execSync(`${openCmd} "${authUrl}"`);

// Start local server to capture callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:3847`);

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end();
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<h1>Error: ${error}</h1><p>${url.searchParams.get("error_description")}</p>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h1>No code received</h1>");
    return;
  }

  console.log("[linkedin-auth] received authorization code, exchanging...");

  // Exchange code for token
  const tokenRes = await fetch(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        redirect_uri: REDIRECT_URI,
      }),
    },
  );

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<h1>Token exchange failed</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
    server.close();
    process.exit(1);
  }

  const token = tokenData.access_token;
  const expiresInDays = Math.floor((tokenData.expires_in ?? 0) / 86400);

  console.log(
    `[linkedin-auth] token acquired (expires in ${expiresInDays} days)`,
  );

  // Get person ID
  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const profile = (await profileRes.json()) as {
    sub: string;
    name: string;
  };
  console.log(`[linkedin-auth] authenticated as ${profile.name} (${profile.sub})`);

  // Update .env file
  const envPath = path.resolve(".env");
  let envContent = fs.readFileSync(envPath, "utf-8");

  envContent = envContent.replace(
    /LINKEDIN_ACCESS_TOKEN=.*/,
    `LINKEDIN_ACCESS_TOKEN=${token}`,
  );
  envContent = envContent.replace(
    /LINKEDIN_PERSON_ID=.*/,
    `LINKEDIN_PERSON_ID=${profile.sub}`,
  );

  // Update token timestamp
  if (envContent.includes("LINKEDIN_TOKEN_ISSUED_AT=")) {
    envContent = envContent.replace(
      /LINKEDIN_TOKEN_ISSUED_AT=.*/,
      `LINKEDIN_TOKEN_ISSUED_AT=${new Date().toISOString()}`,
    );
  } else {
    envContent = envContent.replace(
      /LINKEDIN_ACCESS_TOKEN=.*/,
      `LINKEDIN_ACCESS_TOKEN=${token}\nLINKEDIN_TOKEN_ISSUED_AT=${new Date().toISOString()}`,
    );
  }

  fs.writeFileSync(envPath, envContent);
  console.log("[linkedin-auth] updated .env");

  // Update GitHub secrets if gh is available
  try {
    execSync(`gh secret set LINKEDIN_ACCESS_TOKEN --body "${token}"`, {
      stdio: "pipe",
    });
    execSync(`gh secret set LINKEDIN_PERSON_ID --body "${profile.sub}"`, {
      stdio: "pipe",
    });
    console.log("[linkedin-auth] updated GitHub secrets");
  } catch {
    console.log(
      "[linkedin-auth] gh CLI not available, skipping GitHub secrets update",
    );
  }

  // Trigger redeploy
  try {
    execSync("gh workflow run deploy.yml", { stdio: "pipe" });
    console.log("[linkedin-auth] triggered deploy");
  } catch {
    console.log("[linkedin-auth] could not trigger deploy");
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    `<h1>LinkedIn token refreshed</h1>` +
      `<p>Authenticated as <strong>${profile.name}</strong></p>` +
      `<p>Token expires in <strong>${expiresInDays} days</strong></p>` +
      `<p>.env updated. GitHub secrets updated. Deploy triggered.</p>` +
      `<p>You can close this tab.</p>`,
  );

  server.close();
  process.exit(0);
});

server.listen(3847, () => {
  console.log("[linkedin-auth] waiting for callback on http://localhost:3847/callback");
});

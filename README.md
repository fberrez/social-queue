# social-queue

Minimal social media publishing queue powered by markdown files. Drop a `.md` file into `queue/`, and it gets published to Bluesky, Mastodon, LinkedIn, Medium, Dev.to, and Substack automatically.

No database. No HTTP server. No UI. Just files.

## How it works

```
queue/    ->    [worker polls every 60s]    ->    sent/
                                             ->    failed/
```

1. Write a markdown file with YAML frontmatter specifying target platforms
2. Drop it into `queue/`
3. The worker picks it up, publishes to each platform, and moves the file to `sent/` (or `failed/` with error details in the frontmatter)

## Post format

### Social post (flat file)

```markdown
---
platforms:
  - bluesky
  - mastodon
  - linkedin
scheduledAt: 2026-03-14T10:00:00Z  # optional, omit for immediate
---

Post content here. Supports **markdown**.
```

### Blog post

Blog platforms (Medium, Dev.to, Substack) require a `title` field. You can target both social and blog platforms in the same post — social platforms ignore the title.

```markdown
---
platforms:
  - medium
  - devto
  - substack
title: "Why Posterous Was Ahead of Its Time"
---

Long-form **markdown** content here...
```

### Post with images (subdirectory)

Place the markdown file and images together in a subdirectory of `queue/`:

```
queue/
  my-post/
    post.md
    photo.jpg
    banner.png
```

```markdown
---
platforms:
  - bluesky
  - linkedin
images:
  - path: photo.jpg
    alt: "A sunset over the mountains"
  - path: banner.png
---

Post content here.
```

After publishing, the entire directory is moved to `sent/` (or `failed/`).

### Frontmatter fields

- `platforms` (required): one or more of `bluesky`, `mastodon`, `linkedin`, `medium`, `devto`, `substack`
- `title` (required for blog platforms): post title for Medium, Dev.to, and Substack. Posts targeting any blog platform without a title are skipped.
- `scheduledAt` (optional): ISO 8601 timestamp. The post will wait in the queue until this time. Omit for immediate publishing.
- `images` (optional): array of image attachments. Each entry has `path` (relative to the post directory) and optional `alt` text. Max 4 images. Supported formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`. Bluesky enforces a 1MB limit per image.

## Setup

```bash
git clone https://github.com/fberrez/social-queue.git
cd social-queue
pnpm install
cp .env.example .env
```

Edit `.env` with your credentials. You only need to configure the platforms you want to use.

### Platform credentials

**Bluesky** — uses an [app password](https://bsky.app/settings/app-passwords):
```
BLUESKY_SERVICE=https://bsky.social
BLUESKY_IDENTIFIER=your.handle.bsky.social
BLUESKY_PASSWORD=your-app-password
```

**Mastodon** — generate an access token in Preferences > Development > New Application:
```
MASTODON_URL=https://mastodon.social
MASTODON_ACCESS_TOKEN=your-access-token
```

**LinkedIn** — requires an OAuth 2.0 token with `w_member_social` scope:
1. Create an app at [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Enable **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** products
3. Add `http://localhost:3847/callback` as an authorized redirect URL in the Auth tab
4. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in `.env`
5. Run `pnpm linkedin:auth` to authenticate and get your token

```
LINKEDIN_CLIENT_ID=your-client-id
LINKEDIN_CLIENT_SECRET=your-client-secret
LINKEDIN_ACCESS_TOKEN=your-oauth-token
LINKEDIN_PERSON_ID=your-person-id
```

LinkedIn tokens expire every 60 days. Run `pnpm linkedin:auth` to re-authenticate — it updates `.env`, GitHub secrets, and triggers a redeploy automatically. A weekly GitHub Actions check will open an issue if the token expires.

**Medium** — generate an [integration token](https://medium.com/me/settings/security):
```
MEDIUM_INTEGRATION_TOKEN=your-integration-token
```

**Dev.to** — generate an API key in [Settings > Extensions](https://dev.to/settings/extensions):
```
DEVTO_API_KEY=your-api-key
```

**Substack** — uses SMTP to email posts to your Substack import address. Posts arrive as drafts for review in your Substack dashboard.
```
SUBSTACK_SMTP_HOST=smtp.gmail.com
SUBSTACK_SMTP_PORT=587
SUBSTACK_SMTP_USER=your-email@gmail.com
SUBSTACK_SMTP_PASSWORD=your-app-password
SUBSTACK_FROM_ADDRESS=your-email@gmail.com
SUBSTACK_TO_ADDRESS=your-substack-import@substack.com
```

## Usage

```bash
# Development (watch mode)
pnpm dev

# Production
pnpm start

# Build to JS first, then run
pnpm build
node dist/index.js

# Re-authenticate LinkedIn (every ~60 days)
pnpm linkedin:auth
```

## Deploy

Deploys automatically via GitHub Actions on every push to `main`. The workflow SSHs into the VPS, builds a Docker image, and runs the container with `queue/`, `sent/`, and `failed/` mounted as volumes.

```bash
# Manual deploy
gh workflow run deploy.yml

# Check container logs on VPS
ssh your-vps "docker logs social-queue -f"
```

### Docker

Run locally with Docker:

```bash
docker build -t social-queue .
docker run -d \
  --name social-queue \
  --restart unless-stopped \
  --env-file .env \
  -v $(pwd)/queue:/app/queue \
  -v $(pwd)/sent:/app/sent \
  -v $(pwd)/failed:/app/failed \
  social-queue
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `BLUESKY_SERVICE` | Per platform | — | Bluesky service URL |
| `BLUESKY_IDENTIFIER` | Per platform | — | Bluesky handle or DID |
| `BLUESKY_PASSWORD` | Per platform | — | Bluesky app password |
| `MASTODON_URL` | Per platform | — | Mastodon instance URL |
| `MASTODON_ACCESS_TOKEN` | Per platform | — | Mastodon access token |
| `LINKEDIN_CLIENT_ID` | Per platform | — | LinkedIn app client ID |
| `LINKEDIN_CLIENT_SECRET` | Per platform | — | LinkedIn app client secret |
| `LINKEDIN_ACCESS_TOKEN` | Per platform | — | LinkedIn OAuth token |
| `LINKEDIN_PERSON_ID` | Per platform | — | LinkedIn person URN ID |
| `MEDIUM_INTEGRATION_TOKEN` | Per platform | — | Medium integration token |
| `DEVTO_API_KEY` | Per platform | — | Dev.to API key |
| `SUBSTACK_SMTP_HOST` | Per platform | — | SMTP server hostname |
| `SUBSTACK_SMTP_PORT` | Per platform | — | SMTP server port |
| `SUBSTACK_SMTP_USER` | Per platform | — | SMTP username |
| `SUBSTACK_SMTP_PASSWORD` | Per platform | — | SMTP password |
| `SUBSTACK_FROM_ADDRESS` | Per platform | — | Sender email address |
| `SUBSTACK_TO_ADDRESS` | Per platform | — | Substack import email address |
| `POLL_INTERVAL_MS` | No | `60000` | Queue polling interval in ms |

## Design decisions

- **Filesystem as state** — `queue/` is pending, `sent/` is done, `failed/` has errors. No database needed.
- **No HTTP server** — zero attack surface on your VPS.
- **Docker deploy** — single container, volumes for queue directories, auto-restart on failure.
- **App password for Bluesky** — simpler than OAuth for a single-user tool.
- **Raw fetch for LinkedIn** — it's one API call, no SDK needed.
- **Plaintext for Bluesky and LinkedIn** — both platforms handle their own formatting. Mastodon, Medium, and Substack get HTML. Dev.to receives raw markdown.
- **Failed posts preserve errors** — error details are written into the file's frontmatter so you can inspect and retry.
- **Image uploads** — subdirectory posts can include images uploaded natively to each platform's API. Flat `.md` files still work for text-only posts.
- **Blog platforms require a title** — Medium, Dev.to, and Substack posts need a `title` frontmatter field. Posts missing it are skipped with a log message.
- **Substack via SMTP** — Substack has no public API, so posts are emailed in and arrive as drafts for review. No published URL is returned.
- **Mixed targeting** — a single post can target both social and blog platforms. Social platforms ignore `title`; blog platforms require it.

## License

ISC

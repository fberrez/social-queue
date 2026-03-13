# social-queue

Minimal social media publishing queue powered by markdown files. Drop a `.md` file into `queue/`, and it gets published to Bluesky, Mastodon, and LinkedIn automatically.

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

- `platforms` (required): one or more of `bluesky`, `mastodon`, `linkedin`
- `scheduledAt` (optional): ISO 8601 timestamp. The post will wait in the queue until this time. Omit for immediate publishing.

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
```
LINKEDIN_ACCESS_TOKEN=your-oauth-token
LINKEDIN_PERSON_ID=your-person-id
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
```

## Deploy on a VPS

A systemd unit file is included at `systemd/social-queue.service`.

```bash
# Copy project to your VPS
scp -r . deploy@your-vps:/opt/social-queue

# On the VPS
cd /opt/social-queue
pnpm install
pnpm build
cp .env.example .env  # edit with real credentials

# Install and start the service
sudo cp systemd/social-queue.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now social-queue

# Check logs
sudo journalctl -u social-queue -f
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `BLUESKY_SERVICE` | Per platform | — | Bluesky service URL |
| `BLUESKY_IDENTIFIER` | Per platform | — | Bluesky handle or DID |
| `BLUESKY_PASSWORD` | Per platform | — | Bluesky app password |
| `MASTODON_URL` | Per platform | — | Mastodon instance URL |
| `MASTODON_ACCESS_TOKEN` | Per platform | — | Mastodon access token |
| `LINKEDIN_ACCESS_TOKEN` | Per platform | — | LinkedIn OAuth token |
| `LINKEDIN_PERSON_ID` | Per platform | — | LinkedIn person URN ID |
| `POLL_INTERVAL_MS` | No | `60000` | Queue polling interval in ms |

## Design decisions

- **Filesystem as state** — `queue/` is pending, `sent/` is done, `failed/` has errors. No database needed.
- **No HTTP server** — zero attack surface on your VPS.
- **App password for Bluesky** — simpler than OAuth for a single-user tool.
- **Raw fetch for LinkedIn** — it's one API call, no SDK needed.
- **Plaintext for Bluesky and LinkedIn** — both platforms handle their own formatting. Mastodon gets HTML.
- **Failed posts preserve errors** — error details are written into the file's frontmatter so you can inspect and retry.

## License

ISC

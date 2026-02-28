# ai-socials

Single place to multicast posts to multiple social networks. Uses [@humanwhocodes/crosspost](https://www.npmjs.com/package/@humanwhocodes/crosspost). On-demand only (no scheduling).

## Setup

1. Copy the env template and add your keys:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set the variables for each platform you want to post to. Only the platforms you configure will be used. See `.env.example` for variable names and links.

3. Install dependencies:

   ```bash
   npm install
   ```

## Posting

Post a message to all configured platforms:

```bash
npm run post "Your message here"
```

Post to specific platforms only:

```bash
npm run post -- --twitter --bluesky "Message"
```

Read message from a file:

```bash
npm run post -- --file message.txt
```

With an image:

```bash
npm run post -- --image ./photo.jpg --image-alt "Description" "Your message"
```

Platform flags: `--twitter` / `-t`, `--mastodon` / `-m`, `--bluesky` / `-b`, `--linkedin` / `-l`, `--discord` / `-d`, `--discord-webhook`, `--telegram`, `--devto`, `--slack` / `-s`, `--nostr` / `-n`, `--reddit` / `-r`.

## Agent usage (Cursor)

Run the script from this folder with the message (and optional flags). Example:

```bash
cd /path/to/ai-socials && npm run post -- "New post: Title – https://ai.skorulis.com/posts/slug/"
```

For MCP-based posting, you can run crosspost’s MCP server and point Cursor at it; set `CROSSPOST_DOTENV` to this project’s `.env` path so it uses the same keys.

## Security

- **Do not commit `.env`.** It contains API keys and tokens. It is listed in `.gitignore`.
- Use `.env.example` only as a template; it has no real secrets.
- If you ever expose your keys, rotate them immediately in each platform’s developer console.

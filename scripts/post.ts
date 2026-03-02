#!/usr/bin/env node
/**
 * Post a message to configured social platforms. Loads .env from project root.
 * Usage: npm run post [options] "Message"
 *   --file <path>     Read message from file
 *   --image <path>    Image file to attach (PNG, JPEG, GIF)
 *   --image-alt <text> Alt text for image (default: filename)
 *   --twitter, -t     Post only to Twitter
 *   --mastodon, -m    Post only to Mastodon
 *   --bluesky, -b     Post only to Bluesky
 *   --linkedin, -l    Post only to LinkedIn
 *   --discord, -d     Post only to Discord (bot)
 *   --discord-webhook Post only to Discord (webhook)
 *   --telegram        Post only to Telegram
 *   --devto           Post only to Dev.to
 *   --slack, -s       Post only to Slack
 *   --nostr, -n       Post only to Nostr
 *   --reddit, -r      Post only to Reddit
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  Client,
  TwitterStrategy,
  MastodonStrategy,
  LinkedInStrategy,
  DiscordStrategy,
  DiscordWebhookStrategy,
  TelegramStrategy,
  DevtoStrategy,
  SlackStrategy,
  NostrStrategy,
} from "@humanwhocodes/crosspost";
import type { Strategy } from "@humanwhocodes/crosspost";
import { createRedditBrowserStrategy } from "./reddit-browser-strategy.js";
import { postToBluesky } from "./bluesky.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
config({ path: resolve(projectRoot, ".env") });

const env = (key: string): string | undefined => process.env[key];

type PlatformId =
  | "twitter"
  | "mastodon"
  | "bluesky"
  | "linkedin"
  | "discord"
  | "discord-webhook"
  | "telegram"
  | "devto"
  | "slack"
  | "nostr"
  | "reddit";

function parseArgs(argv: string[]): {
  message: string | null;
  file: string | null;
  image: string | null;
  imageAlt: string | null;
  platforms: PlatformId[] | null;
} {
  const positionals: string[] = [];
  let file: string | null = null;
  let image: string | null = null;
  let imageAlt: string | null = null;
  const platforms: PlatformId[] = [];

  const platformFlags: Record<string, PlatformId> = {
    "--twitter": "twitter",
    "-t": "twitter",
    "--mastodon": "mastodon",
    "-m": "mastodon",
    "--bluesky": "bluesky",
    "-b": "bluesky",
    "--linkedin": "linkedin",
    "-l": "linkedin",
    "--discord": "discord",
    "-d": "discord",
    "--discord-webhook": "discord-webhook",
    "--telegram": "telegram",
    "--devto": "devto",
    "--slack": "slack",
    "-s": "slack",
    "--nostr": "nostr",
    "-n": "nostr",
    "--reddit": "reddit",
    "-r": "reddit",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file" && argv[i + 1]) {
      file = argv[++i];
    } else if (arg === "--image" && argv[i + 1]) {
      image = argv[++i];
    } else if (arg === "--image-alt" && argv[i + 1]) {
      imageAlt = argv[++i];
    } else if (platformFlags[arg]) {
      const id = platformFlags[arg];
      if (!platforms.includes(id)) platforms.push(id);
    } else if (arg.startsWith("-") && arg !== "--") {
      // ignore other flags (e.g. --help from npm)
    } else if (arg !== "--") {
      positionals.push(arg);
    }
  }

  const message = file
    ? readFileSync(resolve(process.cwd(), file), "utf8")
    : positionals.length > 0
      ? positionals.join(" ").replace(/\\n/g, "\n")
      : null;

  return {
    message,
    file,
    image,
    imageAlt,
    platforms: platforms.length > 0 ? platforms : null,
  };
}

function buildStrategies(platformFilter: PlatformId[] | null): Strategy[] {
  const strategies: Strategy[] = [];

  const add = (id: PlatformId, build: () => Strategy | null) => {
    if (id === "bluesky") return;
    if (platformFilter !== null && !platformFilter.includes(id)) return;
    const s = build();
    if (s) strategies.push(s);
  };

  add("twitter", () => {
    const key = env("TWITTER_API_CONSUMER_KEY");
    const secret = env("TWITTER_API_CONSUMER_SECRET");
    const atKey = env("TWITTER_ACCESS_TOKEN_KEY");
    const atSecret = env("TWITTER_ACCESS_TOKEN_SECRET");
    if (!key || !secret || !atKey || !atSecret) return null;
    return new TwitterStrategy({
      apiConsumerKey: key,
      apiConsumerSecret: secret,
      accessTokenKey: atKey,
      accessTokenSecret: atSecret,
    });
  });

  add("mastodon", () => {
    const token = env("MASTODON_ACCESS_TOKEN");
    const host = env("MASTODON_HOST");
    if (!token || !host) return null;
    return new MastodonStrategy({ accessToken: token, host });
  });

  add("linkedin", () => {
    const token = env("LINKEDIN_ACCESS_TOKEN");
    if (!token) return null;
    return new LinkedInStrategy({ accessToken: token });
  });

  add("discord", () => {
    const botToken = env("DISCORD_BOT_TOKEN");
    const channelId = env("DISCORD_CHANNEL_ID");
    if (!botToken || !channelId) return null;
    return new DiscordStrategy({ botToken, channelId });
  });

  add("discord-webhook", () => {
    const webhookUrl = env("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) return null;
    return new DiscordWebhookStrategy({ webhookUrl });
  });

  add("telegram", () => {
    const botToken = env("TELEGRAM_BOT_TOKEN");
    const chatId = env("TELEGRAM_CHAT_ID");
    if (!botToken || !chatId) return null;
    return new TelegramStrategy({ botToken, chatId });
  });

  add("devto", () => {
    const apiKey = env("DEVTO_API_KEY");
    if (!apiKey) return null;
    return new DevtoStrategy({ apiKey });
  });

  add("slack", () => {
    const token = env("SLACK_TOKEN");
    const channel = env("SLACK_CHANNEL");
    if (!token || !channel) return null;
    return new SlackStrategy({ botToken: token, channel });
  });

  add("nostr", () => {
    const [major] = process.versions.node.split(".").map((n) => parseInt(n, 10));
    if (major < 22) return null;
    const privateKey = env("NOSTR_PRIVATE_KEY");
    const relaysStr = env("NOSTR_RELAYS");
    if (!privateKey || !relaysStr) return null;
    const relays = relaysStr.split(",").map((r) => r.trim());
    return new NostrStrategy({ privateKey, relays });
  });

  add("reddit", () => {
    const subreddit = env("REDDIT_SUBREDDIT");
    const browserAuthPath = env("REDDIT_BROWSER_AUTH_PATH") ?? ".reddit-browser-state";
    if (!subreddit) return null;
    const storageStatePath = resolve(projectRoot, browserAuthPath);
    return createRedditBrowserStrategy({ subreddit, storageStatePath });
  });

  return strategies;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { message, image, imageAlt, platforms } = parseArgs(argv);

  if (!message) {
    console.error("Usage: npm run post [options] \"Message\"");
    console.error("   or: npm run post -- --file message.txt");
    console.error("Use --help for platform flags.");
    process.exit(1);
  }

  const selected = platforms;
  const shouldPostToBluesky =
    (selected === null || selected.includes("bluesky")) ?? false;

  const nonBlueskyPlatforms =
    selected === null ? null : selected.filter((p) => p !== "bluesky");

  const strategies = buildStrategies(nonBlueskyPlatforms);

  const postOptions: { images?: [{ data: Uint8Array; alt: string }] } = {};
  if (image) {
    try {
      const imagePath = resolve(process.cwd(), image);
      const data = readFileSync(imagePath);
      const alt = imageAlt ?? image.replace(/^.*[/\\]/, "");
      postOptions.images = [{ data: new Uint8Array(data), alt }];
    } catch (err) {
      console.error("Error reading image file:", (err as Error).message);
      process.exit(1);
    }
  }

  const client = strategies.length > 0 ? new Client({ strategies }) : null;

  const crosspostPromise = client
    ? client.post(message, postOptions)
    : Promise.resolve([]);

  const blueskyPromise = shouldPostToBluesky
    ? postToBluesky({
        text: message,
        imagePath: image,
        imageAlt,
      })
    : Promise.resolve<ReturnType<typeof postToBluesky> extends Promise<infer R> ? R : never>(
        { ok: false, error: null } as never,
      );

  const [responses, blueskyResult] = await Promise.all([
    crosspostPromise,
    blueskyPromise,
  ]);

  let exitCode = 0;

  responses.forEach((response, index) => {
    const strategy = strategies[index];
    if (response.ok) {
      console.log(`✅ ${strategy.name} succeeded.`);
      if (response.url) console.log(response.url);
      else if (response.response) console.log(response.response);
      console.log("");
    } else {
      exitCode = 1;
      console.log(`❌ ${strategy.name} failed.`);
      const reason = (response as { reason?: unknown }).reason;
      console.error(reason instanceof Error ? reason.message : reason);
      console.log("");
    }
  });

  if (shouldPostToBluesky) {
    if (blueskyResult.ok) {
      console.log("✅ Bluesky succeeded.");
      if (blueskyResult.url) {
        console.log(blueskyResult.url);
      }
      console.log("");
    } else {
      exitCode = 1;
      console.log("❌ Bluesky failed.");
      const reason = (blueskyResult as { error?: unknown }).error;
      console.error(
        reason instanceof Error ? reason.message : reason ?? "Unknown error",
      );
      console.log("");
    }
  }

  if (!shouldPostToBluesky && strategies.length === 0) {
    const hint = platforms
      ? "Check that the required env vars for the selected platforms are set in .env"
      : "Set env vars in .env for at least one platform (see .env.example).";
    console.error("No platforms configured. " + hint);
    process.exit(1);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

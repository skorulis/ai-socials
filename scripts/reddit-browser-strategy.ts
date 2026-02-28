/**
 * Reddit strategy that submits via the web form at reddit.com/r/{subreddit}/submit
 * using Playwright and a saved browser session (no API tokens needed).
 * Run `npm run reddit-login` once to log in and save session to REDDIT_BROWSER_AUTH_PATH.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Strategy } from "@humanwhocodes/crosspost";

const REDDIT_TITLE_MAX = 300;
const REDDIT_SELF_POST_BODY_MAX = 40_000;

const URL_REGEX = /https?:\/\/[^\s]+/i;

export type RedditBrowserStrategyOptions = {
  subreddit: string;
  /** Path to Playwright storage state JSON (from reddit-login script). */
  storageStatePath: string;
};

function splitTitleAndBody(message: string): { title: string; body: string } {
  const firstNewline = message.indexOf("\n");
  if (firstNewline === -1) {
    const title = message.slice(0, REDDIT_TITLE_MAX) || "Post";
    return { title, body: message };
  }
  const title = message.slice(0, firstNewline).trim().slice(0, REDDIT_TITLE_MAX) || "Post";
  const body = message.slice(firstNewline + 1).trim();
  return { title, body };
}

/** Detect link post: message contains a URL; use first line as title and first URL as link. */
function parseLinkPost(message: string): { title: string; url: string } | null {
  const match = message.match(URL_REGEX);
  if (!match) return null;
  const url = match[0].replace(/[.)]+$/, ""); // trim trailing punctuation
  const { title } = splitTitleAndBody(message);
  return { title, url };
}

export function createRedditBrowserStrategy(options: RedditBrowserStrategyOptions): Strategy {
  const { subreddit, storageStatePath } = options;
  // storageStatePath is already absolute (resolved in post.ts from project root)
  const resolvedStatePath = storageStatePath;

  return {
    name: "Reddit",
    id: "reddit",
    MAX_MESSAGE_LENGTH: REDDIT_SELF_POST_BODY_MAX,
    calculateMessageLength: (m) => m.length,

    getUrlFromResponse(response: unknown): string | undefined {
      if (response && typeof response === "object" && "url" in response) {
        return (response as { url: string }).url;
      }
      return undefined;
    },

    async post(message: string, postOptions?: { signal?: AbortSignal }): Promise<{ url?: string }> {
      if (!message?.trim()) throw new Error("Missing message to post to Reddit.");
      const linkPost = parseLinkPost(message);
      const { title, body } = splitTitleAndBody(message);

      let submitUrl: string;
      if (linkPost) {
        submitUrl = `https://www.reddit.com/r/${subreddit}/submit?title=${encodeURIComponent(linkPost.title)}&url=${encodeURIComponent(linkPost.url)}`;
      } else {
        submitUrl = `https://www.reddit.com/r/${subreddit}/submit?selftext=true&title=${encodeURIComponent(title)}&text=${encodeURIComponent(body)}`;
      }

      try {
        readFileSync(resolvedStatePath, "utf8");
      } catch {
        throw new Error(
          `Reddit browser auth not found at ${resolvedStatePath}. Run: npm run reddit-login`
        );
      }

      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({
          storageState: resolvedStatePath,
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        if (postOptions?.signal) {
          postOptions.signal.addEventListener("abort", () => page.close());
        }

        await page.goto(submitUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

        // If we're on login page, session expired
        if (page.url().includes("/login")) {
          await browser.close();
          throw new Error("Reddit session expired. Run: npm run reddit-login");
        }

        // Click the main submit button (Reddit uses "Post" or "Submit")
        const submitButton = page.getByRole("button", { name: /^(Post|Submit)$/i }).first();
        await submitButton.click({ timeout: 10_000 });

        // Wait for navigation (to new post or rate-limit/error)
        await page.waitForURL(/\/(comments|r\/\w+\/submit)/, { timeout: 15_000 }).catch(() => {});

        const finalUrl = page.url();
        if (finalUrl.includes("/comments/")) {
          return { url: finalUrl };
        }
        return { url: finalUrl };
      } finally {
        await browser.close();
      }
    },
  };
}

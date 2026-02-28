#!/usr/bin/env node
/**
 * One-time Reddit login: opens a browser for you to log in, then saves the session
 * to REDDIT_BROWSER_AUTH_PATH (default .reddit-browser-state) for use by the Reddit
 * browser strategy. Load .env from project root.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
config({ path: resolve(projectRoot, ".env") });

const authPath = resolve(projectRoot, process.env.REDDIT_BROWSER_AUTH_PATH || ".reddit-browser-state");

async function main(): Promise<void> {
  console.log("Opening browser for Reddit login. Log in, then come back here.");
  console.log("Session will be saved to:", authPath);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.reddit.com/login", { waitUntil: "networkidle" });

  console.log("Log in to Reddit in the browser window. Press Enter here when you're done...");
  await new Promise<void>((res) => {
    process.stdin.once("data", () => res());
  });

  await context.storageState({ path: authPath });
  console.log("Saved session to", authPath);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BskyAgent } from "@atproto/api";

type BlueskyPostResult =
  | { ok: true; url?: string }
  | { ok: false; error: unknown };

export interface BlueskyPostOptions {
  text: string;
  imagePath?: string | null;
  imageAlt?: string | null;
}

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function getServiceHost(): string {
  const host = getEnv("BLUESKY_HOST") ?? "https://bsky.social";
  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host;
  }
  return `https://${host}`;
}

function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
}

function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

export async function postToBluesky(
  options: BlueskyPostOptions,
): Promise<BlueskyPostResult> {
  const identifier = getEnv("BLUESKY_IDENTIFIER");
  const password = getEnv("BLUESKY_PASSWORD");

  if (!identifier || !password) {
    return {
      ok: false,
      error:
        "Bluesky env vars missing: set BLUESKY_IDENTIFIER and BLUESKY_PASSWORD in .env",
    };
  }

  const service = getServiceHost();
  const agent = new BskyAgent({ service });

  try {
    await agent.login({ identifier, password });

    let embed: unknown | undefined;

    if (options.imagePath) {
      const imagePath = resolve(process.cwd(), options.imagePath);
      const data = readFileSync(imagePath);
      const mimeType = guessMimeType(imagePath);
      const alt =
        options.imageAlt ??
        options.imagePath.replace(/^.*[/\\]/, "");

      const uploadRes = await agent.uploadBlob(data, {
        encoding: mimeType,
      });

      if (isVideoMime(mimeType)) {
        // Video-specific embed, following https://docs.bsky.app/docs/tutorials/video (simple method).
        embed = {
          $type: "app.bsky.embed.video",
          video: uploadRes.data.blob,
          // Use a reasonable default aspect ratio; can be refined later if needed.
          aspectRatio: { width: 16, height: 9 },
        };
      } else {
        // Image embed (existing behavior).
        embed = {
          $type: "app.bsky.embed.images",
          images: [
            {
              image: uploadRes.data.blob,
              alt,
            },
          ],
        };
      }
    }

    const createdAt = new Date().toISOString();

    const postRes = await agent.post({
      text: options.text,
      createdAt,
      ...(embed ? { embed } : {}),
    });

    // agent.post returns the created post's URI in strongRef.uri
    const uri = (postRes as { uri?: string }).uri;

    return {
      ok: true,
      url: uri,
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}


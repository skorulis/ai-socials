/**
 * Reddit strategy for posting text (self) posts. Conforms to @humanwhocodes/crosspost Strategy.
 * Uses Reddit OAuth2 API directly (script app: client_id, client_secret, username, password).
 */
import type { Strategy } from "@humanwhocodes/crosspost";

const REDDIT_TITLE_MAX = 300;
const REDDIT_SELF_POST_BODY_MAX = 40_000;

export type RedditStrategyOptions = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  subreddit: string;
  userAgent: string;
};

function splitTitleAndText(message: string): { title: string; text: string } {
  const firstNewline = message.indexOf("\n");
  if (firstNewline === -1) {
    const title = message.length > REDDIT_TITLE_MAX ? message.slice(0, REDDIT_TITLE_MAX) : message;
    const text = message;
    return { title: title || "Post", text };
  }
  const title = message.slice(0, firstNewline).trim().slice(0, REDDIT_TITLE_MAX) || "Post";
  const text = message.slice(firstNewline + 1).trim();
  return { title, text };
}

async function getAccessToken(options: RedditStrategyOptions, signal?: AbortSignal): Promise<string> {
  const { clientId, clientSecret, username, password } = options;
  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": options.userAgent,
    },
    body: body.toString(),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    let errMsg = `${res.status} ${res.statusText}`;
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      if (json.error) errMsg += `: ${json.error}`;
      if (json.message) errMsg += ` - ${json.message}`;
    } catch {
      if (text) errMsg += `: ${text.slice(0, 200)}`;
    }
    throw new Error(errMsg);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Reddit token response missing access_token");
  return data.access_token;
}

async function submitPost(
  options: RedditStrategyOptions,
  accessToken: string,
  title: string,
  text: string,
  signal?: AbortSignal
): Promise<unknown> {
  const body = new URLSearchParams({
    api_type: "json",
    kind: "self",
    sr: options.subreddit,
    title,
    text,
  });
  const res = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": options.userAgent,
    },
    body: body.toString(),
    signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    let errMsg = `${res.status} ${res.statusText}`;
    try {
      const json = JSON.parse(raw) as { message?: string };
      if (json.message) errMsg += `: ${json.message}`;
    } catch {
      if (raw) errMsg += `: ${raw.slice(0, 200)}`;
    }
    throw new Error(errMsg);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Reddit submit returned invalid JSON");
  }
}

/**
 * Parse Reddit submit response for the new post URL.
 * Response may be jQuery-style (jquery array with redirect) or api_type=json (json.errors / json.data).
 */
function getUrlFromSubmitResponse(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;

  const obj = response as Record<string, unknown>;

  // api_type=json success: sometimes redirect URL in json.redirect or in listing
  const json = obj.json as Record<string, unknown> | undefined;
  if (json) {
    const errors = json.errors;
    if (Array.isArray(errors) && errors.length > 0) return undefined;
    const data = json.data as Record<string, unknown> | undefined;
    if (data?.url && typeof data.url === "string") return data.url;
    if (data?.id && typeof data.id === "string") {
      // We don't have subreddit in response; could be built if we stored it
      return undefined;
    }
  }

  // jQuery-style: redirect at jquery[12][3][0] for text post, jquery[18][3][0] for link
  const jquery = obj.jquery as unknown[] | undefined;
  if (Array.isArray(jquery)) {
    for (const entry of jquery) {
      if (Array.isArray(entry) && entry[2] === "redirect" && typeof entry[3]?.[0] === "string") {
        return entry[3][0] as string;
      }
    }
    // Fallback: known indices for success
    const textRedirect = jquery[12] as unknown[] | undefined;
    if (Array.isArray(textRedirect) && textRedirect[2] === "redirect" && typeof textRedirect[3]?.[0] === "string") {
      return textRedirect[3][0] as string;
    }
    const linkRedirect = jquery[18] as unknown[] | undefined;
    if (Array.isArray(linkRedirect) && linkRedirect[2] === "redirect" && typeof linkRedirect[3]?.[0] === "string") {
      return linkRedirect[3][0] as string;
    }
  }

  return undefined;
}

export function createRedditStrategy(options: RedditStrategyOptions): Strategy {
  return {
    name: "Reddit",
    id: "reddit",
    MAX_MESSAGE_LENGTH: REDDIT_SELF_POST_BODY_MAX,
    calculateMessageLength: (message: string) => message.length,

    getUrlFromResponse(response: unknown): string | undefined {
      return getUrlFromSubmitResponse(response);
    },

    async post(message: string, postOptions?: { signal?: AbortSignal }): Promise<unknown> {
      if (!message?.trim()) throw new Error("Missing message to post to Reddit.");
      const { title, text } = splitTitleAndText(message);
      const token = await getAccessToken(options, postOptions?.signal);
      return submitPost(options, token, title, text, postOptions?.signal);
    },
  };
}

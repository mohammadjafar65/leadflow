/**
 * Meta Graph API v21 — thin wrapper for Instagram Messaging use-cases.
 *
 * All public surface is typed; raw fetch is used intentionally to keep
 * the dependency tree small (no axios / got needed).
 *
 * Relevant Meta docs:
 *   https://developers.facebook.com/docs/instagram-api/
 *   https://developers.facebook.com/docs/messenger-platform/instagram/
 */

import crypto from "node:crypto";
import { env } from "../config/env.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
// Meta redirects the browser here after OAuth — must match what's registered in the Meta App dashboard.
// This is the FRONTEND route; the React page reads ?code= and POSTs it to the server.
const REDIRECT_PATH = "/instagram";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IgAccount {
  pageId: string;
  igUserId: string;
  username: string;
  pageAccessToken: string;
  tokenExpiresAt: Date | null;
}


export interface IgTokenExchangeResult {
  accessToken: string;
  expiresIn: number | null;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

/**
 * Returns the Meta OAuth authorization URL to redirect the user to.
 * Scopes used (all available without advanced access approval in dev mode):
 *   instagram_basic, instagram_manage_messages, instagram_manage_comments,
 *   pages_show_list, pages_read_engagement
 *
 * Redirect URI: {CLIENT_ORIGIN}/instagram  ← must match Meta App dashboard exactly
 */
export function buildOAuthUrl(state: string, clientOrigin: string): string {
  const redirectUri = `${clientOrigin}${REDIRECT_PATH}`;
  const scopes = [
    "instagram_basic",
    "instagram_manage_messages",
    "instagram_manage_comments",
    "pages_show_list",
    "pages_read_engagement",
  ].join(",");

  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state,
  });

  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

/**
 * Exchanges a short-lived auth code for an access token,
 * then upgrades it to a 60-day long-lived token.
 */
export async function exchangeCodeForToken(
  code: string,
  clientOrigin: string,
): Promise<IgTokenExchangeResult> {
  const redirectUri = `${clientOrigin}${REDIRECT_PATH}`;

  const shortRes = await graphFetch<{
    access_token: string;
    token_type: string;
  }>("/oauth/access_token", {
    method: "GET",
    params: {
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    },
  });

  // Step 2: long-lived token (60 days)
  return getLongLivedToken(shortRes.access_token);
}

/**
 * Exchanges a short-lived token for a 60-day long-lived token.
 */
export async function getLongLivedToken(
  shortLivedToken: string,
): Promise<IgTokenExchangeResult> {
  const cleanToken = shortLivedToken.trim();
  if (cleanToken.startsWith("IG")) {
    try {
      const res = await fetchWithTimeout(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${env.META_APP_SECRET}&access_token=${cleanToken}`,
      );
      const data = (await res.json()) as { access_token?: string; expires_in?: number };
      if (data.access_token) {
        return {
          accessToken: data.access_token,
          expiresIn: data.expires_in ?? null,
        };
      }
    } catch (err) {
      console.warn("[meta-graph] IG token exchange failed:", err);
    }
  }

  const res = await graphFetch<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>("/oauth/access_token", {
    method: "GET",
    params: {
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: cleanToken,
    },
  });

  return {
    accessToken: res.access_token,
    expiresIn: res.expires_in ?? null,
  };
}

// ─── Account Resolution ───────────────────────────────────────────────────────

/**
 * Resolves the connected Instagram Business account from a user access token.
 * Returns the first IG Business account linked to a managed Facebook Page.
 */
/**
 * Resolves the connected Instagram Business account from an access token.
 * Supports:
 *   1. Direct Instagram token (from Instagram Login or Step 2 Token Generator)
 *   2. User token -> managed Facebook Page -> Instagram Business Account
 */
export async function resolveIgAccount(token: string): Promise<IgAccount | null> {
  const trimmed = token.trim();

  // 1. Try graph.instagram.com (for Instagram User tokens starting with IG...)
  try {
    const igRes = await fetchWithTimeout(
      `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${trimmed}`,
    );
    const igData = (await igRes.json()) as { id?: string; username?: string; error?: any };
    if (igData.id && igData.username) {
      console.log(`[meta-graph] Resolved Instagram account via graph.instagram.com: @${igData.username} (${igData.id})`);
      return {
        pageId: igData.id,
        igUserId: igData.id,
        username: igData.username,
        pageAccessToken: trimmed,
        tokenExpiresAt: null,
      };
    }
  } catch (err) {
    console.warn("[meta-graph] graph.instagram.com resolution error:", err);
  }

  // 2. Try direct /me check on graph.facebook.com
  try {
    const meRes = await graphFetch<{ id: string; username?: string; name?: string }>("/me", {
      method: "GET",
      params: { access_token: trimmed, fields: "id,username,name" },
    });
    if (meRes.username) {
      return {
        pageId: meRes.id,
        igUserId: meRes.id,
        username: meRes.username,
        pageAccessToken: trimmed,
        tokenExpiresAt: null,
      };
    }
  } catch {
    // Continue to Facebook Page resolution
  }

  // 3. Try Facebook Page resolution (/me/accounts)
  try {
    const pagesRes = await graphFetch<{
      data: Array<{ id: string; access_token: string; name: string }>;
    }>("/me/accounts", {
      method: "GET",
      params: { access_token: trimmed, fields: "id,name,access_token" },
    });

    for (const page of pagesRes.data || []) {
      try {
        const igRes = await graphFetch<{
          instagram_business_account?: { id: string; username: string };
        }>(`/${page.id}`, {
          method: "GET",
          params: {
            access_token: page.access_token,
            fields: "instagram_business_account{id,username}",
          },
        });

        if (igRes.instagram_business_account) {
          return {
            pageId: page.id,
            igUserId: igRes.instagram_business_account.id,
            username: igRes.instagram_business_account.username,
            pageAccessToken: page.access_token,
            tokenExpiresAt: null,
          };
        }
      } catch {
        // Continue to next page
      }
    }
  } catch {
    // Fallback: Check if token is already a Page Access Token with an IG account
    try {
      const pageIgRes = await graphFetch<{
        instagram_business_account?: { id: string; username: string };
      }>("/me", {
        method: "GET",
        params: { access_token: trimmed, fields: "instagram_business_account{id,username}" },
      });
      if (pageIgRes.instagram_business_account) {
        return {
          pageId: "me",
          igUserId: pageIgRes.instagram_business_account.id,
          username: pageIgRes.instagram_business_account.username,
          pageAccessToken: trimmed,
          tokenExpiresAt: null,
        };
      }
    } catch {}
  }

  return null;
}

// ─── Messaging ───────────────────────────────────────────────────────────────

/**
 * Sends an Instagram DM to a recipient.
 * The pageAccessToken must belong to the page or Instagram account.
 * Only works within the 24-hour messaging window (standard messaging permission).
 */
export async function sendDM(
  pageAccessToken: string,
  _igAccountId: string,
  recipientIgId: string,
  message: string,
  linkUrl?: string | null,
  buttonLabel?: string | null,
  commentId?: string | null,
): Promise<{ messageId: string }> {
  const cleanToken = pageAccessToken.trim();
  const isDirectIgToken = cleanToken.startsWith("IG");

  // Helper to post to Meta messages API with a given recipient object:
  async function postToMeta(
    targetRecipient: { id: string } | { comment_id: string },
    messagePayload: Record<string, unknown>,
  ): Promise<{ message_id: string }> {
    // 1. If it's an Instagram User Token (IGAA...), talk ONLY to graph.instagram.com
    if (isDirectIgToken) {
      const res = await fetchWithTimeout("https://graph.instagram.com/v21.0/me/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: cleanToken,
          recipient: targetRecipient,
          message: messagePayload,
        }),
      });
      const data = (await res.json()) as {
        message_id?: string;
        error?: { message: string; code: number; error_subcode?: number };
      };
      if (data.message_id) return { message_id: data.message_id };
      if (data.error) {
        throw new GraphApiError(data.error.message, data.error.code, data.error.error_subcode);
      }
      throw new GraphApiError("Unknown Instagram Graph API error", 500);
    }

    // 2. Otherwise it's a Facebook Page Token (EAA...), talk to graph.facebook.com
    // For comment private replies, Meta ONLY accepts /me/messages.
    if ("comment_id" in targetRecipient) {
      return await graphFetch<{ message_id: string }>("/me/messages", {
        method: "POST",
        params: { access_token: cleanToken },
        body: {
          recipient: targetRecipient,
          message: messagePayload,
        },
      });
    }

    return graphFetch<{message_id:string}>("/me/messages", {method:"POST",params:{access_token:cleanToken},body:{recipient:targetRecipient,message:messagePayload}});
  }

  const label = (buttonLabel?.trim() || "Open Link").slice(0, 20); // Meta button title limit is 20 chars
  const hasLink = Boolean(linkUrl && linkUrl.trim().length > 0);
  const cleanUrl = linkUrl ? linkUrl.trim() : "";

  // ─── Case 1: Private reply to a Comment (recipient: { comment_id }) ───────────
  // Meta Instagram API Rules for Private Replies to comments:
  // 1. Must use recipient: { comment_id: commentId }
  // 2. ONLY plain text messages are supported! Templates (button, generic) are strictly rejected.
  // 3. URLs can be embedded in the text body and Instagram renders them as clickable links.
  if (commentId) {
    const textMessage = hasLink
      ? `${message.trim()}\n\n👉 ${label}:\n${cleanUrl}`
      : message.trim();

    try {
      const res = await postToMeta({ comment_id: commentId }, { text: textMessage });
      return { messageId: res.message_id };
    } catch (err) {
      if (err instanceof GraphApiError) {
        // Subcode 2534023: "The comment you are trying to reply to, already has a reply."
        if (err.subcode === 2534023 || err.message?.includes("already has a reply")) {
          console.log(`[meta-graph] Comment ${commentId} already received a private reply.`);
          return { messageId: "already_replied" };
        }
      }
      throw err;
    }
  }

  const text = hasLink ? message.trim()+"\n\n"+cleanUrl : message.trim();
  const res = await postToMeta({id:recipientIgId},{text});
  return {messageId:res.message_id};
}



// ─── Comments ─────────────────────────────────────────────────────────────────

/**
 * Retrieves the sender's IG user ID from a comment ID.
 */
export async function getCommentSenderIgId(
  commentId: string,
  pageAccessToken: string,
): Promise<string | null> {
  const cleanToken = pageAccessToken.trim();
  if (cleanToken.startsWith("IG")) {
    try {
      const res = await fetchWithTimeout(
        `https://graph.instagram.com/v21.0/${commentId}?fields=from&access_token=${cleanToken}`,
      );
      const data = (await res.json()) as { from?: { id: string; username: string } };
      return data.from?.id ?? null;
    } catch {
      return null;
    }
  }

  try {
    const res = await graphFetch<{ from?: { id: string; username: string } }>(`/${commentId}`, {
      method: "GET",
      params: { access_token: cleanToken, fields: "from" },
    });
    return res.from?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Replies publicly to an Instagram comment on a post or Reel.
 * Uses the official Graph API endpoint: POST /{comment_id}/replies
 */
export async function replyToComment(
  pageAccessToken: string,
  commentId: string,
  message: string,
): Promise<{ id: string } | null> {
  const cleanToken = pageAccessToken.trim();
  // 1. If it's an Instagram token, talk ONLY to graph.instagram.com
  if (cleanToken.startsWith("IG")) {
    try {
      const res = await fetchWithTimeout(`https://graph.instagram.com/v21.0/${commentId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: cleanToken,
          message,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: any };
      if (data.id) return { id: data.id };
      if (data.error) {
        console.warn(`[meta-graph] graph.instagram.com replyToComment error:`, data.error);
        return null;
      }
    } catch (err) {
      console.warn("[meta-graph] graph.instagram.com replyToComment network error:", err);
      return null;
    }
    return null;
  }

  // 2. Facebook Page token (EAA...)
  try {
    const res = await graphFetch<{ id: string }>(`/${commentId}/replies`, {
      method: "POST",
      params: { access_token: cleanToken },
      body: { message },
    });
    return { id: res.id };
  } catch (err) {
    console.error(`[meta-graph] Failed to reply to comment ${commentId}:`, err);
    return null;
  }
}

/**
 * Checks if our Instagram account has already posted a public reply to this comment.
 */
export async function hasAccountRepliedToComment(
  pageAccessToken: string,
  commentId: string,
  ourIgUserId?: string,
  ourUsername?: string,
): Promise<boolean> {
  const cleanToken = pageAccessToken.trim();
  const url = cleanToken.startsWith("IG")
    ? `https://graph.instagram.com/v21.0/${commentId}/replies?fields=id,from,timestamp&access_token=${cleanToken}`
    : `https://graph.facebook.com/v21.0/${commentId}/replies?fields=id,from,timestamp&access_token=${cleanToken}`;

  try {
    const res = await fetchWithTimeout(url);
    const data = (await res.json()) as {
      data?: Array<{ id: string; from?: { id: string; username?: string } }>;
      error?: any;
    };
    if (data.error) {
      console.warn(`[meta-graph] hasAccountRepliedToComment returned error for ${commentId}:`, data.error);
      return false;
    }
    if (Array.isArray(data.data) && data.data.length > 0) {
      if (!ourIgUserId && !ourUsername) {
        return true;
      }
      return data.data.some((reply) => {
        const fromId = reply.from?.id;
        const fromUser = reply.from?.username?.toLowerCase();
        return (
          (ourIgUserId && fromId === ourIgUserId) ||
          (ourUsername && fromUser === ourUsername.toLowerCase())
        );
      });
    }
  } catch (err) {
    console.warn(`[meta-graph] Exception in hasAccountRepliedToComment for ${commentId}:`, err);
  }
  return false;
}

export interface InstagramCommentItem {
  id: string;
  text: string;
  timestamp: string;
  from?: {
    id: string;
    username: string;
  };
  likeCount?: number;
  isReply?: boolean;
  parentId?: string;
}

/**
 * Fetches all comments for a specific Reel or Post directly from Instagram.
 * Follows cursor pagination on top-level comments and extracts nested replies
 * for every comment so that 100% of comments on that particular Reel are loaded.
 */
export async function getMediaComments(
  token: string,
  mediaId: string,
  maxComments = 10000,
): Promise<InstagramCommentItem[]> {
  const cleanToken = token.trim();
  const fields = "id,text,timestamp,from,like_count";
  const isDirectIg = cleanToken.startsWith("IG");

  let nextUrl: string | null = isDirectIg
    ? `https://graph.instagram.com/v21.0/${mediaId}/comments?fields=${fields}&limit=50&access_token=${cleanToken}`
    : `https://graph.facebook.com/v21.0/${mediaId}/comments?fields=${fields}&limit=50&access_token=${cleanToken}`;

  const topLevelComments: InstagramCommentItem[] = [];
  const seenIds = new Set<string>();
  let pageCount = 0;
  const MAX_PAGES = 100;

  // 1. Paginate through all top-level comments without nested replies (which breaks cursor pagination on Meta)
  while (nextUrl && topLevelComments.length < maxComments && pageCount < MAX_PAGES) {
    pageCount++;
    try {
      const res = await fetchWithTimeout(nextUrl);
      const data = (await res.json()) as {
        data?: Array<{
          id: string;
          text: string;
          timestamp: string;
          from?: { id: string; username: string };
          like_count?: number;
        }>;
        paging?: { next?: string; cursors?: { after?: string } };
        error?: any;
      };

      if (data.error) {
        console.warn(`[meta-graph] getMediaComments error on page ${pageCount} for media ${mediaId}:`, data.error);
        break;
      }

      const items = data.data || [];
      for (const c of items) {
        if (c.id && !seenIds.has(c.id)) {
          seenIds.add(c.id);
          topLevelComments.push({
            id: c.id,
            text: c.text,
            timestamp: c.timestamp,
            from: c.from,
            likeCount: c.like_count,
            isReply: false,
          });
        }
      }

      nextUrl = data.paging?.next ?? null;
    } catch (err) {
      console.error(`[meta-graph] getMediaComments network error on page ${pageCount} for ${mediaId}:`, err);
      break;
    }
  }

  // 2. Concurrently fetch threaded replies for each top-level comment
  const replyComments: InstagramCommentItem[] = [];
  const batchSize = 10;
  for (let i = 0; i < topLevelComments.length; i += batchSize) {
    const chunk = topLevelComments.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (parentComment) => {
        try {
          const repliesUrl = isDirectIg
            ? `https://graph.instagram.com/v21.0/${parentComment.id}/replies?fields=${fields}&limit=50&access_token=${cleanToken}`
            : `https://graph.facebook.com/v21.0/${parentComment.id}/replies?fields=${fields}&limit=50&access_token=${cleanToken}`;

          const repRes = await fetchWithTimeout(repliesUrl);
          const repData = (await repRes.json()) as {
            data?: Array<{
              id: string;
              text: string;
              timestamp: string;
              from?: { id: string; username: string };
              like_count?: number;
            }>;
          };

          if (Array.isArray(repData.data)) {
            for (const r of repData.data) {
              if (r.id && !seenIds.has(r.id)) {
                seenIds.add(r.id);
                replyComments.push({
                  id: r.id,
                  text: r.text,
                  timestamp: r.timestamp,
                  from: r.from,
                  likeCount: r.like_count,
                  isReply: true,
                  parentId: parentComment.id,
                });
              }
            }
          }
        } catch {
          // Non-fatal if fetching replies for a specific comment fails
        }
      }),
    );
  }

  const allCombined = [...topLevelComments, ...replyComments];
  allCombined.sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });

  return allCombined;
}

/**
 * Resolves an Instagram Reel/Post by its URL, permalink, shortcode, or ID.
 */
export async function resolveMediaByUrl(
  token: string,
  igAccountId: string,
  urlOrShortcode: string,
): Promise<IgMediaItem | null> {
  const rawInput = urlOrShortcode.trim();
  if (!rawInput) return null;

  // Clean query parameters and trailing slash (e.g. ?igsh=... or /)
  const cleanInput = rawInput.split("?")[0].replace(/\/$/, "");

  // Match reel, reels, p, or tv paths
  const match = cleanInput.match(/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  const shortcode = match ? match[1] : cleanInput;

  // Search in recent 100 media (increased from 50)
  const mediaList = await getAccountMedia(token, igAccountId, 100);
  const found = mediaList.find(
    (m) =>
      (m.permalink && (m.permalink.includes(`/${shortcode}/`) || m.permalink.includes(`/${shortcode}`) || m.permalink.includes(cleanInput))) ||
      m.id === cleanInput ||
      m.id === shortcode,
  );
  if (found) return found;

  // If numeric ID, try direct lookup
  if (/^\d+$/.test(shortcode) || /^\d+$/.test(cleanInput)) {
    const idToLookup = /^\d+$/.test(cleanInput) ? cleanInput : shortcode;
    try {
      const cleanToken = token.trim();
      const res = await graphFetch<{
        id: string;
        caption?: string;
        media_type?: string;
        media_product_type?: string;
        permalink?: string;
        thumbnail_url?: string;
        timestamp?: string;
      }>(`/${idToLookup}`, {
        method: "GET",
        params: {
          access_token: cleanToken,
          fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp",
        },
      });
      if (res.id) {
        return {
          id: res.id,
          caption: res.caption || "",
          mediaType: res.media_type || "VIDEO",
          mediaProductType: res.media_product_type || "REELS",
          permalink: res.permalink || `https://www.instagram.com/p/${res.id}/`,
          thumbnailUrl: res.thumbnail_url,
          timestamp: res.timestamp,
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export interface IgMediaItem {
  id: string;
  caption?: string;
  mediaType: string;
  mediaProductType?: string;
  permalink?: string;
  thumbnailUrl?: string;
  timestamp?: string;
}

/**
 * Fetches recent media (Reels and Posts) published by this Instagram account.
 */
export async function getAccountMedia(
  token: string,
  igAccountId: string,
  limit = 20,
): Promise<IgMediaItem[]> {
  const cleanToken = token.trim();
  const fields = "id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp";

  // 1. If it's an Instagram token, query graph.instagram.com/me/media
  if (cleanToken.startsWith("IG")) {
    try {
      const res = await fetchWithTimeout(
        `https://graph.instagram.com/v21.0/me/media?fields=${fields}&limit=${limit}&access_token=${cleanToken}`,
      );
      const data = (await res.json()) as { data?: any[] };
      if (Array.isArray(data.data)) {
        return data.data.map((item) => ({
          id: item.id,
          caption: item.caption || "",
          mediaType: item.media_type || "IMAGE",
          mediaProductType: item.media_product_type || "FEED",
          permalink: item.permalink || `https://www.instagram.com/p/${item.id}/`,
          thumbnailUrl: item.thumbnail_url || undefined,
          timestamp: item.timestamp,
        }));
      }
    } catch (err) {
      console.warn("[meta-graph] graph.instagram.com getAccountMedia failed:", err);
    }
    return [];
  }

  // 2. Otherwise query Facebook Graph API: /{igAccountId}/media
  try {
    const res = await graphFetch<{
      data: Array<{
        id: string;
        caption?: string;
        media_type?: string;
        media_product_type?: string;
        permalink?: string;
        thumbnail_url?: string;
        timestamp?: string;
      }>;
    }>(`/${igAccountId}/media`, {
      method: "GET",
      params: { access_token: cleanToken, fields, limit: String(limit) },
    });

    return (res.data || []).map((item) => ({
      id: item.id,
      caption: item.caption || "",
      mediaType: item.media_type || "IMAGE",
      mediaProductType: item.media_product_type || "FEED",
      permalink: item.permalink || `https://www.instagram.com/p/${item.id}/`,
      thumbnailUrl: item.thumbnail_url,
      timestamp: item.timestamp,
    }));
  } catch (err) {
    console.error("[meta-graph] getAccountMedia failed:", err);
    return [];
  }
}


// ─── Webhooks ────────────────────────────────────────────────────────────────

/**
 * Subscribes a Facebook Page to the webhook fields needed for Instagram Auto DM.
 * Must be called after connecting an account so Meta sends events to our webhook.
 */
export async function subscribePageToWebhook(
  pageId: string,
  pageAccessToken: string,
): Promise<void> {
  const cleanToken = pageAccessToken.trim();
  if (cleanToken.startsWith("IG")) {
    // Direct Instagram tokens don't support Facebook Page subscription endpoints
    return;
  }
  await graphFetch<{ success: boolean }>(`/${pageId}/subscribed_apps`, {
    method: "POST",
    params: {
      access_token: cleanToken,
      subscribed_fields: "messages,messaging_postbacks,message_reactions,feed,comments",
    },
  });
}


/**
 * Verifies an X-Hub-Signature-256 header from Meta's webhook.
 * Returns true if the signature matches.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
): boolean {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const computed = crypto
    .createHmac("sha256", env.META_APP_SECRET)
    .update(rawBody)
    .digest("hex");
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// ─── Internal fetch helper ───────────────────────────────────────────────────

type FetchOptions =
  | { method: "GET"; params?: Record<string, string> }
  | { method: "POST"; params?: Record<string, string>; body?: unknown };

async function graphFetch<T>(path: string, options: FetchOptions): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);

  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const fetchOptions: RequestInit =
    options.method === "POST"
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: options.body ? JSON.stringify(options.body) : undefined,
        }
      : { method: "GET" };

  const response = await fetchWithTimeout(url.toString(), fetchOptions);
  const data = (await response.json()) as { error?: { message: string; code: number; error_subcode?: number } } & T;

  if (!response.ok || (data as { error?: unknown }).error) {
    const err = (data as { error?: { message: string; code: number; error_subcode?: number } }).error;
    throw new GraphApiError(
      err?.message ?? `Graph API error ${response.status}`,
      err?.code ?? response.status,
      err?.error_subcode,
    );
  }

  return data as T;
}

export class GraphApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public subcode?: number,
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}

async function fetchWithTimeout(input: string | URL, init: RequestInit = {}): Promise<Response> {
 return globalThis.fetch(input,{...init,signal:AbortSignal.timeout(20000)});
}

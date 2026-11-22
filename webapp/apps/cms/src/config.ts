// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The CMS reads only its own settings. It never sees the proof service's
// database URL or signing key; tests/boundary.test.ts enforces that.
import type { ObjectStoreConfig } from "./storage/object-store";

type Env = Record<string, string | undefined>;

export type CmsConfig = {
  environment: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  /** Article images: Cloudflare R2 (or any S3-compatible bucket), else a local directory. */
  media: ObjectStoreConfig;
  /** Database backups, in their own private bucket, and how long to keep them. */
  backups: ObjectStoreConfig & { keepDays: number };
  /** The website the CMS deploys and reports to search engines; absent, nothing is deployed. */
  site?: SiteConfig;
  /** Sign-in to the admin with GitHub; absent, only bearer tokens work. */
  admin?: AdminConfig;
  /** Search Console numbers per post (PRD R12), read by the scheduler; absent, nothing is imported. */
  searchConsole?: SearchConsoleConfig;
  /** Page views and downloads per post from Umami (PRD R11, the funnel), read by the scheduler; absent, nothing is imported. */
  umami?: UmamiConfig;
};

/** Read access to one Umami website, behind Cloudflare Access when a service token is given. */
export type UmamiConfig = {
  url: string;
  websiteId: string;
  /** An Umami API key (Settings > API keys), sent as a bearer token. */
  apiKey: string;
  /** A Cloudflare Access service token, for an Umami that Access protects. */
  access?: { clientId: string; clientSecret: string };
};

/** A Google service account with read-only access to one Search Console property. */
export type SearchConsoleConfig = {
  /** The property, such as sc-domain:behu.sh. */
  site: string;
  key: { clientEmail: string; privateKey: string; tokenUri: string };
};

export type AdminConfig = {
  /** The admin's own origin, such as https://cms.behu.sh: the OAuth callback and the CSRF origin. */
  publicUrl: string;
  github: { clientId: string; clientSecret: string };
  /** Numeric GitHub user ids allowed to sign in (ids, unlike logins, never change). */
  allowedGithubIds: ReadonlySet<number>;
};

export type SiteConfig = {
  url: string;
  coolify: { url: string; token: string; websiteUuid: string };
  /** https://www.indexnow.org key; the site serves it at /<key>.txt. */
  indexNowKey?: string;
};

export function loadConfig(env: Env = process.env): CmsConfig {
  const databaseUrl = env.CMS_DATABASE_URL;
  if (!databaseUrl) throw new Error("CMS_DATABASE_URL is required");
  const environment = env.NODE_ENV ?? "development";
  if (environment !== "development" && environment !== "test" && environment !== "production") {
    throw new Error(`NODE_ENV must be development, test or production, not ${environment}`);
  }
  const production = environment === "production";
  return {
    environment,
    port: Number(env.PORT ?? 3100),
    databaseUrl,
    media: storeConfig(env, "CMS_S3", "CMS_MEDIA_DIR", ".data/media", production),
    backups: {
      ...storeConfig(env, "CMS_BACKUP_S3", "CMS_BACKUP_DIR", ".data/backups", production),
      keepDays: Number(env.CMS_BACKUP_KEEP_DAYS ?? 30),
    },
    site: siteConfig(env),
    admin: adminConfig(env),
    searchConsole: searchConsoleConfig(env),
    umami: umamiConfig(env),
  };
}

/**
 * CMS_UMAMI_URL, CMS_UMAMI_WEBSITE_ID and CMS_UMAMI_API_KEY together turn the
 * import on, set only where it runs (the scheduler); an Umami behind Cloudflare
 * Access also needs CMS_UMAMI_ACCESS_CLIENT_ID and _SECRET. Errors name the
 * setting, never its value.
 */
function umamiConfig(env: Env): UmamiConfig | undefined {
  const url = env.CMS_UMAMI_URL;
  if (!url) return undefined;
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} is required when CMS_UMAMI_URL is set`);
    return value;
  };
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") throw new Error("CMS_UMAMI_URL must use HTTPS");
  const websiteId = required("CMS_UMAMI_WEBSITE_ID");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(websiteId)) throw new Error("CMS_UMAMI_WEBSITE_ID must be the website's id (a UUID)");
  const clientId = env.CMS_UMAMI_ACCESS_CLIENT_ID;
  const clientSecret = env.CMS_UMAMI_ACCESS_CLIENT_SECRET;
  if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error("CMS_UMAMI_ACCESS_CLIENT_ID and CMS_UMAMI_ACCESS_CLIENT_SECRET go together");
  return {
    url: parsed.origin, websiteId, apiKey: required("CMS_UMAMI_API_KEY"),
    ...(clientId && clientSecret ? { access: { clientId, clientSecret } } : {}),
  };
}

/**
 * CMS_SEARCH_CONSOLE_KEY is the service account's JSON key, set only where the
 * import runs (the scheduler). The property defaults to the website's domain
 * property. Errors name the setting, never its value.
 */
function searchConsoleConfig(env: Env): SearchConsoleConfig | undefined {
  const raw = env.CMS_SEARCH_CONSOLE_KEY;
  if (!raw) return undefined;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("CMS_SEARCH_CONSOLE_KEY must be the service account's JSON key");
  }
  const { type, client_email: clientEmail, private_key: privateKey, token_uri: tokenUri } = parsed;
  if (type !== "service_account" || typeof clientEmail !== "string" || typeof privateKey !== "string" || !privateKey.includes("PRIVATE KEY")) {
    throw new Error("CMS_SEARCH_CONSOLE_KEY must be a service account key (type service_account, with client_email and private_key)");
  }
  const siteUrl = env.CMS_SITE_URL;
  const site = env.CMS_SEARCH_CONSOLE_SITE || (siteUrl ? `sc-domain:${new URL(siteUrl).hostname}` : undefined);
  if (!site) throw new Error("CMS_SEARCH_CONSOLE_SITE (or CMS_SITE_URL) is required when CMS_SEARCH_CONSOLE_KEY is set");
  if (!/^(sc-domain:[a-z0-9.-]+|https:\/\/\S+\/)$/.test(site)) throw new Error("CMS_SEARCH_CONSOLE_SITE must be sc-domain:<domain> or a URL-prefix property ending in /");
  return {
    site,
    key: { clientEmail, privateKey, tokenUri: typeof tokenUri === "string" ? tokenUri : "https://oauth2.googleapis.com/token" },
  };
}

function adminConfig(env: Env): AdminConfig | undefined {
  const publicUrl = env.CMS_PUBLIC_URL;
  if (!publicUrl) return undefined;
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} is required when CMS_PUBLIC_URL is set`);
    return value;
  };
  const ids = required("CMS_ADMIN_GITHUB_IDS").split(",").map((id) => id.trim()).filter(Boolean);
  if (!ids.length || ids.some((id) => !/^[1-9][0-9]*$/.test(id))) throw new Error("CMS_ADMIN_GITHUB_IDS must list numeric GitHub user ids, separated by commas");
  const url = new URL(publicUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("CMS_PUBLIC_URL must use HTTPS");
  return {
    publicUrl: url.origin,
    github: { clientId: required("CMS_GITHUB_CLIENT_ID"), clientSecret: required("CMS_GITHUB_CLIENT_SECRET") },
    allowedGithubIds: new Set(ids.map(Number)),
  };
}

function siteConfig(env: Env): SiteConfig | undefined {
  const url = env.CMS_SITE_URL;
  if (!url) return undefined;
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} is required when CMS_SITE_URL is set`);
    return value;
  };
  const indexNowKey = env.CMS_INDEXNOW_KEY || undefined;
  if (indexNowKey && !/^[a-zA-Z0-9-]{8,128}$/.test(indexNowKey)) throw new Error("CMS_INDEXNOW_KEY must be 8 to 128 letters, digits or dashes");
  return {
    url: new URL(url).origin,
    coolify: { url: new URL(required("CMS_COOLIFY_URL")).origin, token: required("CMS_COOLIFY_TOKEN"), websiteUuid: required("CMS_COOLIFY_WEBSITE_UUID") },
    indexNowKey,
  };
}

/** An S3 bucket when <prefix>_BUCKET is set, otherwise a directory. Production must say which. */
function storeConfig(env: Env, prefix: string, directoryVariable: string, fallback: string, production: boolean): ObjectStoreConfig {
  const bucket = env[`${prefix}_BUCKET`];
  if (bucket) {
    const required = (name: string) => {
      const value = env[`${prefix}_${name}`];
      if (!value) throw new Error(`${prefix}_${name} is required when ${prefix}_BUCKET is set`);
      return value;
    };
    return { kind: "s3", bucket, endpoint: required("ENDPOINT"), accessKeyId: required("ACCESS_KEY_ID"), secretAccessKey: required("SECRET_ACCESS_KEY") };
  }
  const directory = env[directoryVariable];
  if (production && !directory) {
    throw new Error(`Production needs ${prefix}_BUCKET (or an explicit ${directoryVariable} on a persistent volume)`);
  }
  return { kind: "local", directory: directory ?? fallback };
}

import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { campaignOf } from "../shared/campaign";
import { coarseAddress, registerAnalytics } from "./analytics";
import { loadConfig } from "./config";

const analytics = { umamiUrl: "https://umami.example", websiteId: "0b6a3f0e-8c1d-4b8e-9d55-0d6c1e2f3a4b" };
const dmg = "https://updates.behu.sh/downloads/hush-0.1.0-alpha.5-build.14.dmg";

function setup(options: { analytics?: typeof analytics; downloadURL?: string } = {}) {
  const sent: Array<{ url: string; init?: RequestInit }> = [];
  const app = new Hono();
  registerAnalytics(app, {
    analytics: "analytics" in options ? options.analytics : analytics,
    publicBaseUrl: "https://behu.sh",
    downloadURL: "downloadURL" in options ? options.downloadURL : dmg,
    fetcher: async (url, init) => {
      sent.push({ url, init });
      return url.endsWith("/script.js") ? new Response("/* umami */") : new Response("token", { status: 200 });
    },
    log: () => {},
  });
  app.get("/blog/dictate-on-mac", (context) => context.html("<html><head></head><body>article</body></html>"));
  app.get("/feed.json", (context) => context.json({ items: [] }));
  return { app, sent };
}

const events = (sent: Array<{ url: string; init?: RequestInit }>) =>
  sent.filter((request) => request.url.endsWith("/api/send")).map((request) => JSON.parse(String(request.init?.body)));

describe("downloads counted at /download (PRD R10)", () => {
  test("redirects to the exact immutable DMG, uncached and unindexed, also without analytics", async () => {
    const { app, sent } = setup({ analytics: undefined });
    const response = await app.request("/download?from=/blog/dictate-on-mac");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(dmg);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(sent).toEqual([]);
  });

  test("sends a phone back to its page instead of the Mac installer, and counts nothing", async () => {
    const { app, sent } = setup();
    const iPhone = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" };
    const response = await app.request("/download?from=/blog/dictate-on-mac", { headers: iPhone });
    expect([response.status, response.headers.get("location"), response.headers.get("cache-control")]).toEqual([302, "/blog/dictate-on-mac", "no-store"]);
    expect((await app.request("/download?from=https://evil.example", { headers: iPhone })).headers.get("location")).toBe("/");
    expect(events(sent)).toEqual([]);
  });

  test("leads to the availability page while the catalog is empty", async () => {
    const { app } = setup({ downloadURL: undefined });
    const response = await app.request("/download?from=/");
    expect(response.headers.get("location")).toBe("/releases");
  });

  test("records a download event with the page it started on, the browser's User-Agent and the shortened address only", async () => {
    const { app, sent } = setup();
    await app.request("/download?from=%2Fde%2Fblog%2Fdiktieren-am-mac", {
      headers: { "user-agent": "Mozilla/5.0 Safari", "cf-connecting-ip": "203.0.113.7" },
    });
    await Bun.sleep(0);
    expect(events(sent)).toEqual([{
      type: "event",
      payload: { website: analytics.websiteId, hostname: "behu.sh", url: "/de/blog/diktieren-am-mac", name: "download", ip: "203.0.113.0" },
    }]);
    const headers = new Headers(sent[0]!.init?.headers);
    expect(headers.get("user-agent")).toBe("Mozilla/5.0 Safari");
    expect([...headers.keys()].sort()).toEqual(["content-type", "user-agent"]);
  });

  test("does not record a page that is not a path on this site", async () => {
    const { app, sent } = setup();
    for (const from of ["https://evil.example/x", "/blog/<script>", ""]) {
      const response = await app.request(`/download?from=${encodeURIComponent(from)}`, { headers: { "cf-connecting-ip": `198.51.100.${from.length}` } });
      expect(response.headers.get("location")).toBe(dmg);
    }
    await Bun.sleep(0);
    expect(events(sent).map((event) => event.payload.url)).toEqual(["/download", "/download", "/download"]);
  });

  test("honours Do Not Track and Global Privacy Control", async () => {
    const { app, sent } = setup();
    await app.request("/download?from=/", { headers: { dnt: "1" } });
    await app.request("/download?from=/", { headers: { "sec-gpc": "1" } });
    await Bun.sleep(0);
    expect(events(sent)).toEqual([]);
  });

  test("counts one client a few times a minute at most, and always redirects", async () => {
    const { app, sent } = setup();
    for (let index = 0; index < 8; index++) {
      const response = await app.request("/download?from=/", { headers: { "cf-connecting-ip": "203.0.113.9" } });
      expect(response.status).toBe(302);
    }
    await Bun.sleep(0);
    expect(events(sent)).toHaveLength(5);
  });

  test("still redirects when Umami is down", async () => {
    const app = new Hono();
    registerAnalytics(app, {
      analytics, publicBaseUrl: "https://behu.sh", downloadURL: dmg,
      fetcher: async () => { throw new Error("connection refused"); }, log: () => {},
    });
    const response = await app.request("/download?from=/");
    expect(response.headers.get("location")).toBe(dmg);
  });
});

describe("page views counted on this server", () => {
  const navigation = {
    "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "user-agent": "Mozilla/5.0 Safari",
    "cf-connecting-ip": "203.0.113.7", "referer": "https://www.google.com/search?q=dictation", "accept-language": "de-DE,de;q=0.9,en;q=0.8",
  };

  test("records a browser's navigation to a page with its path, campaign tags, origin of the referrer, language and shortened address", async () => {
    const { app, sent } = setup();
    const response = await app.request("/blog/dictate-on-mac?utm_source=newsletter&utm_medium=email&gclid=abc123&q=secret", { headers: navigation });
    expect(await response.text()).toContain("article");
    await Bun.sleep(0);
    expect(events(sent)).toEqual([{
      type: "event",
      payload: {
        website: analytics.websiteId, hostname: "behu.sh", url: "/blog/dictate-on-mac?utm_source=newsletter&utm_medium=email",
        referrer: "https://www.google.com/search", language: "de-DE", ip: "203.0.113.0",
      },
    }]);
    expect(new Headers(sent[0]!.init?.headers).get("user-agent")).toBe("Mozilla/5.0 Safari");
  });

  test("ignores prefetches, prerenders, scripts, other methods, files and missing pages", async () => {
    const { app, sent } = setup();
    await app.request("/blog/dictate-on-mac", { headers: { ...navigation, "sec-purpose": "prefetch;prerender" } });
    await app.request("/blog/dictate-on-mac", { headers: { ...navigation, purpose: "prefetch" } });
    await app.request("/blog/dictate-on-mac", { headers: { ...navigation, "sec-fetch-dest": "empty" } });
    await app.request("/blog/dictate-on-mac", { headers: { "user-agent": "curl/8.7" } });
    await app.request("/blog/dictate-on-mac", { method: "HEAD", headers: navigation });
    await app.request("/feed.json", { headers: navigation });
    await app.request("/missing", { headers: navigation });
    await Bun.sleep(0);
    expect(events(sent)).toEqual([]);
  });

  test("honours Do Not Track and Global Privacy Control, and counts one client at most 60 times a minute", async () => {
    const { app, sent } = setup();
    await app.request("/blog/dictate-on-mac", { headers: { ...navigation, dnt: "1" } });
    await app.request("/blog/dictate-on-mac", { headers: { ...navigation, "sec-gpc": "1" } });
    await Bun.sleep(0);
    expect(events(sent)).toEqual([]);
    for (let view = 0; view < 65; view++) await app.request("/blog/dictate-on-mac", { headers: navigation });
    await Bun.sleep(0);
    expect(events(sent)).toHaveLength(60);
  });

  test("counts nothing while analytics is off", async () => {
    const { app, sent } = setup({ analytics: undefined });
    await app.request("/blog/dictate-on-mac", { headers: navigation });
    await Bun.sleep(0);
    expect(sent).toEqual([]);
  });
});

describe("campaign tags", () => {
  test("keeps only the five UTM tags, trimmed and cleaned, and never an ad click id", () => {
    expect(campaignOf("/blog/a?utm_source=reddit&utm_medium=social&utm_campaign=launch&utm_content=r%2Fmacapps&utm_term=dictation")).toBe(
      "?utm_source=reddit&utm_medium=social&utm_campaign=launch&utm_content=rmacapps&utm_term=dictation");
    expect(campaignOf("/blog/a?gclid=x&fbclid=y&email=a%40b.c&ref=z")).toBe("");
    expect(campaignOf("/blog/a")).toBe("");
    expect(campaignOf(`/a?utm_source=${"x".repeat(150)}`)).toBe(`?utm_source=${"x".repeat(100)}`);
    expect(campaignOf("/a?utm_source=%3Cscript%3E")).toBe("?utm_source=script");
  });

  test("a download keeps the campaign of the page it started on", async () => {
    const { app, sent } = setup();
    await app.request("/download?from=/blog/dictate-on-mac&utm_source=creator-anna&utm_medium=social&gclid=abc", { headers: { "user-agent": "Mozilla/5.0" } });
    await Bun.sleep(0);
    expect(events(sent)[0].payload.url).toBe("/blog/dictate-on-mac?utm_source=creator-anna&utm_medium=social");
  });
});

describe("the visitor's address, shortened to its network", () => {
  test("keeps the network of an IPv4 or IPv6 address, never the device", () => {
    expect(coarseAddress("203.0.113.7")).toBe("203.0.113.0");
    expect(coarseAddress("::ffff:203.0.113.7")).toBe("203.0.113.0");
    expect(coarseAddress("2001:0db8:85a3:1234:0:8a2e:370:7334")).toBe("2001:db8:85a3::");
    expect(coarseAddress("2001:db8::1")).toBe("2001:db8:0::");
  });

  test("sends no address it cannot read, and none without Cloudflare's header", async () => {
    expect(coarseAddress("not an address")).toBeUndefined();
    expect(coarseAddress(undefined)).toBeUndefined();
    const { app, sent } = setup();
    await app.request("/download?from=/", { headers: { "user-agent": "Mozilla/5.0", "x-forwarded-for": "198.51.100.9" } });
    await Bun.sleep(0);
    expect(events(sent)[0].payload.ip).toBeUndefined();
  });
});

describe("only this server counts", () => {
  test("has no browser tracker, so a page view or download is never counted twice", async () => {
    const { app } = setup();
    expect((await app.request("/stats/script.js")).status).toBe(404);
    expect((await app.request("/stats/api/send", { method: "POST", body: "{}" })).status).toBe(404);
  });
});

describe("analytics configuration", () => {
  test("is off unless both settings are given, and refuses half of it", () => {
    expect(loadConfig({ NODE_ENV: "test" }).analytics).toBeUndefined();
    expect(() => loadConfig({ NODE_ENV: "test", HUSH_UMAMI_URL: "https://umami.example" })).toThrow(/both/);
    expect(loadConfig({ NODE_ENV: "test", HUSH_UMAMI_URL: "https://umami.example/", HUSH_UMAMI_WEBSITE_ID: analytics.websiteId }).analytics)
      .toEqual(analytics);
  });

  test("needs HTTPS in production and the website's UUID", () => {
    const base = { NODE_ENV: "production", HUSH_PUBLIC_BASE_URL: "https://behu.sh" };
    expect(() => loadConfig({ ...base, HUSH_UMAMI_URL: "http://umami.example", HUSH_UMAMI_WEBSITE_ID: analytics.websiteId })).toThrow(/HTTPS/);
    expect(() => loadConfig({ ...base, HUSH_UMAMI_URL: "https://umami.example", HUSH_UMAMI_WEBSITE_ID: "behu.sh" })).toThrow(/UUID/);
  });
});

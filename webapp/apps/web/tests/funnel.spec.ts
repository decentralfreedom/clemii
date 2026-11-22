// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// FUNNEL-001, the browser half of the funnel's end-to-end check
// (apps/cms/scripts/funnel-e2e.sh): real visits to this server, with a real
// Umami 3.5 behind it, and exactly the ones that should count are counted in
// Umami. The CMS half then imports them and checks the same numbers. Runs only
// when the script provides the Umami it started; otherwise it skips.
import { expect, test, type Browser } from "@playwright/test";
import { blogPosts } from "../shared/blog-posts.generated";

const umamiUrl = process.env.HUSH_UMAMI_URL;
const websiteId = process.env.HUSH_UMAMI_WEBSITE_ID;
const apiKey = process.env.HUSH_FUNNEL_UMAMI_API_KEY;
const article = "/blog/fixture-dictation-without-cloud";
// A browser as visitors have it: Umami drops "HeadlessChrome" as a bot (checked below).
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

test.skip(!umamiUrl || !websiteId || !apiKey, "needs the Umami that apps/cms/scripts/funnel-e2e.sh starts");
test.skip(!blogPosts.some((post) => `/blog/${post.slug}` === article), "fixture articles are not generated");
test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "one browser is enough: the counting is on the server");

/** A visitor: a browser context with its own address, as Cloudflare would pass it on. */
async function visitor(browser: Browser, address: string, headers: Record<string, string> = {}, agent = userAgent) {
  const context = await browser.newContext({ userAgent: agent, extraHTTPHeaders: { "cf-connecting-ip": address, ...headers } });
  // The download itself goes to the release's DMG elsewhere: answered here, as only the redirect to it matters.
  await context.route(/\.dmg($|\?)/, (route) => route.fulfill({ status: 200, contentType: "application/octet-stream", body: "" }));
  return context;
}

async function umami(path: string) {
  const response = await fetch(`${umamiUrl}/api/websites/${websiteId}${path}`, { headers: { authorization: `Bearer ${apiKey}` } });
  expect(response.ok).toBe(true);
  return response.json();
}

test("FUNNEL-001 counts real visits and downloads per page, and nothing that is noise", async ({ browser, baseURL }) => {
  // Counted: two visitors read the article, one of them downloads from it, which also opens the
  // release notes in a new tab (DownloadExperience); that visitor then opens the home page.
  const reader = await visitor(browser, "203.0.113.10");
  const page = await reader.newPage();
  await page.goto(article);
  const download = page.locator(".blog-download-band").getByRole("link", { name: "Download for Mac" });
  await expect(download).toHaveAttribute("href", `/download?from=${encodeURIComponent(article)}`);
  await Promise.all([page.waitForRequest(/\.dmg($|\?)/), download.click()]);
  await page.goto("/");
  await reader.close();
  const second = await visitor(browser, "198.51.100.20");
  await (await second.newPage()).goto(article);
  await second.close();

  // Counted, each through its channel: a search engine, a social site, an AI assistant (their
  // referrers), a tagged Reddit link opened in an app (no referrer), and a tagged newsletter link
  // to the home page whose download keeps the newsletter's tags.
  const arrivals: Array<[string, string, string | undefined]> = [
    ["198.51.100.31", article, "https://www.google.com/"],
    ["198.51.100.32", "/", "https://www.linkedin.com/"],
    ["198.51.100.33", article, "https://chatgpt.com/"],
    ["198.51.100.34", `${article}?utm_source=reddit&utm_medium=social&utm_campaign=launch`, undefined],
  ];
  for (const [address, path, referer] of arrivals) {
    const context = await visitor(browser, address);
    await (await context.newPage()).goto(path, referer ? { referer } : {});
    await context.close();
  }
  const subscriber = await visitor(browser, "198.51.100.35");
  const home = await subscriber.newPage();
  await home.goto("/?utm_source=newsletter&utm_medium=email&utm_campaign=december");
  const homeDownload = home.getByRole("link", { name: "Download for Mac" }).first();
  await expect(homeDownload).toHaveAttribute("href", "/download?from=%2F&utm_source=newsletter&utm_medium=email&utm_campaign=december");
  await Promise.all([home.waitForRequest(/\.dmg($|\?)/), homeDownload.click()]);
  await subscriber.close();

  // Not counted: visitors who ask not to be tracked, a known bot, and requests that are not a page being opened.
  for (const headers of [{ dnt: "1" }, { "sec-gpc": "1" }] as Array<Record<string, string>>) {
    const declined = await visitor(browser, "192.0.2.30", headers);
    const declinedPage = await declined.newPage();
    await declinedPage.goto(article);
    await declinedPage.goto(`/download?from=${encodeURIComponent(article)}`).catch(() => undefined);
    await declined.close();
  }
  const bot = await visitor(browser, "192.0.2.40", {}, "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36");
  await (await bot.newPage()).goto(article);
  await bot.close();
  const prefetch = await fetch(`${baseURL}${article}`, { headers: { "user-agent": userAgent, "cf-connecting-ip": "192.0.2.50", "sec-fetch-dest": "document", "sec-purpose": "prefetch" } });
  expect(prefetch.status).toBe(200);
  const script = await fetch(`${baseURL}${article}`, { headers: { "user-agent": userAgent, "cf-connecting-ip": "192.0.2.60" } });
  expect(script.status).toBe(200);

  // The server sends events after answering: wait until Umami has all that should arrive, then a little longer for any that should not.
  const range = `startAt=${Date.now() - 3_600_000}&endAt=${Date.now() + 3_600_000}`;
  await expect.poll(async () => (await umami(`/stats?${range}`)).pageviews, { timeout: 15_000 }).toBe(10);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const pages = await umami(`/metrics/expanded?type=path&${range}`) as Array<{ name: string; pageviews: string }>;
  const views = Object.fromEntries(pages.map((row) => [row.name, Number(row.pageviews)]));
  const releaseNotes = Object.keys(views).filter((path) => path.startsWith("/releases/"));
  expect(releaseNotes).toHaveLength(1);
  expect(views).toEqual({ [article]: 5, "/": 3, [releaseNotes[0]!]: 2 });
  const { data: downloads } = await umami(`/events?event=download&pageSize=100&${range}`) as { data: Array<{ urlPath: string }> };
  expect(downloads.map((event) => event.urlPath).sort()).toEqual(["/", article]);
});

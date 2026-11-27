import { expect, test } from "@playwright/test";

test("keeps navigation and static artwork usable when studio lighting fails", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/studio-lighting.*\.gz$/, route => route.abort());
  await page.goto("/");
  await expect(page.locator(".clemii-core")).toHaveAttribute("data-scene", "fallback");
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "1");
  await expect(page.locator(".core-fallback")).toHaveCSS("opacity", "1");
  await expect(page.locator(".hero-actions .landing-download")).toBeVisible();
  const rose = page.locator(".freedom-bloom");
  await rose.scrollIntoViewIfNeeded();
  await expect(rose).toHaveAttribute("data-scene", "fallback");
  await expect(rose.locator(".bloom-fallback")).toBeVisible();
  expect(errors).toEqual([]);
});

test("LANDING-ENTRY-001 plays the whole entrance from the first paint, and the 3D logo takes over from the flat one", async ({ page }, testInfo) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  // Hold the scene: the entrance must not wait for it.
  await page.route(/ClemiiScene.*\.js/, async route => { await gate; await route.continue(); });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // The first paint waits for every stylesheet in the head; DOMContentLoaded does not.
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLLinkElement>('head link[rel="stylesheet"]')].every(link => link.sheet));
    await expect(page.locator(".site-header")).toHaveCSS("position", "relative");
    // One CSS calendar from the first paint: the text, the flat logo and the universe.
    const calendar = await page.evaluate(async () => {
      const animations = [".site-header", ".hero-introduction", ".hero-download-area", ".core-fallback", ".orbit-app", ".universe-paths", ".universe-texture", ".universe-halo"]
        .map(selector => ({ selector, animation: document.querySelector(selector)!.getAnimations()[0] }));
      await Promise.all(animations.map(({ animation }) => animation?.ready));
      return animations.map(({ selector, animation }) => {
        if (!animation) return { selector, missing: true, delay: 0, duration: 0, start: 0 };
        const timing = animation.effect!.getTiming();
        return { selector, missing: false, delay: Number(timing.delay), duration: Number(timing.duration), start: Number(animation.startTime) };
      });
    });
    expect(calendar.filter(item => item.missing).map(item => item.selector)).toEqual([]);
    expect(calendar.map(({ delay, duration }) => [delay, duration])).toEqual([
      [120, 1050], [0, 900], [1100, 700], [100, 600], [1000, 1150], [850, 1500], [0, 2400], [300, 1400],
    ]);
    expect(Math.max(...calendar.map(item => item.start)) - Math.min(...calendar.map(item => item.start))).toBeLessThan(1);
    const fade = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".site-header")!;
      const animation = header.getAnimations().find(item => (item as CSSAnimation).animationName === "header-arrive")!;
      const timing = animation.effect!.getTiming();
      const originalTime = animation.currentTime;
      const height = header.offsetHeight, top = header.offsetTop;
      animation.pause();
      animation.currentTime = Number(timing.delay) + Number(timing.duration) * .4;
      const style = getComputedStyle(header);
      const result = { opacity: Number(style.opacity), y: new DOMMatrixReadOnly(style.transform).m42, sameLayout: height === header.offsetHeight && top === header.offsetTop, filter: style.filter };
      animation.currentTime = originalTime;
      animation.play();
      return result;
    });
    expect(fade.opacity).toBeGreaterThan(0);
    expect(fade.opacity).toBeLessThan(1);
    expect(fade.y).toBeGreaterThan(-14);
    expect(fade.y).toBeLessThan(0);
    expect(fade.sameLayout).toBe(true);
    expect(fade.filter).toBe("none");
    // Without the scene the hero is whole: the flat logo stands in its place.
    for (const selector of [".site-header", ".hero-introduction", ".hero-download-area", ".core-fallback"]) {
      await expect(page.locator(selector)).toHaveCSS("opacity", "1", { timeout: 4000 });
    }
    await expect(page.locator(".hero-actions .landing-download")).toBeVisible();
    await expect(page.locator(".landing-loader")).toHaveCount(0);
    await expect(page.locator(".clemii-core canvas")).toHaveCount(0);
    const layout = await page.locator(".hero-introduction").boundingBox();
    release();
    // The 3D logo takes over in place, plays the opening, and neither replays nor moves the text.
    await expect(page.locator(".clemii-core")).toHaveAttribute("data-scene", "ready", { timeout: 15000 });
    await expect(page.locator(".clemii-core canvas")).toHaveCSS("opacity", "1");
    await expect(page.locator(".core-fallback")).toHaveCSS("opacity", "0");
    expect(await page.evaluate(() => [".site-header", ".hero-introduction", ".hero-download-area"].map(selector =>
      document.querySelector(selector)!.getAnimations().every(item => item.playState === "finished")))).toEqual([true, true, true]);
    expect(await page.locator(".hero-introduction").boundingBox()).toEqual(layout);
    await page.waitForFunction(() => performance.getEntriesByName("clemii:opened").length > 0, null, { timeout: 15000 });
  } finally { release(); }
  await expect(page.locator(".hero-introduction")).toHaveCSS("filter", "none");
  await page.screenshot({ path: testInfo.outputPath("entrance-complete.png") });
});

test("LANDING-ENTRY-002 shows the whole hero with the flat logo before a slow scene", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/ClemiiScene.*\.js/, async route => { await gate; await route.continue(); });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // The flat logo has glided in by the time its CSS entrance ends: no deadline, no empty hero.
    await expect(page.locator(".core-fallback")).toHaveCSS("opacity", "1", { timeout: 1500 });
    await expect(page.locator(".site-header")).toHaveCSS("opacity", "1");
    await expect(page.locator(".hero-actions .landing-download")).toBeVisible();
  } finally { release(); }
  // Compiling the deferred WebGL scene on a software renderer has its own readiness budget.
  await expect(page.locator(".clemii-core")).toHaveAttribute("data-scene", "ready", { timeout: 15000 });
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "1");
});

test("LANDING-ENTRY-003 reveals the prerendered page while application JavaScript is delayed", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/assets\/.*\.js(?:\?.*)?$/, async route => { await gate; await route.continue(); });
  try {
    await page.goto("/", { waitUntil: "commit" });
    // The real production CSS must arrive, but neither hydration nor WebGL can run.
    await expect(page.locator(".site-header")).toHaveCSS("position", "relative");
    // Navigation, headline, download and the flat logo arrive without JavaScript.
    await expect(page.locator(".hero-introduction")).toHaveCSS("opacity", "1", { timeout: 2500 });
    await expect(page.locator(".site-header")).toHaveCSS("opacity", "1", { timeout: 2500 });
    await expect(page.locator(".hero-download-area")).toHaveCSS("opacity", "1", { timeout: 2500 });
    await expect(page.locator(".core-fallback")).toHaveCSS("opacity", "1", { timeout: 2500 });
    await expect(page.locator(".site-header a[href='/verified-messages']").first()).toHaveAttribute("href", "/verified-messages");
    await expect(page.locator(".clemii-core canvas")).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator(".hero-introduction")).toHaveCSS("opacity", "1");
});

test("LANDING-ENTRY-004 keeps the public page readable when application JavaScript fails", async ({ page }) => {
  await page.route(/\/assets\/.*\.js(?:\?.*)?$/, route => route.abort());
  await page.goto("/");
  await expect(page.locator(".hero-introduction")).toHaveCSS("opacity", "1");
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "1");
  await expect(page.locator(".hero-download-area")).toHaveCSS("opacity", "1");
  await expect(page.locator(".core-fallback")).toHaveCSS("opacity", "1");
  await expect(page.locator(".clemii-core canvas")).toHaveCount(0);
  await page.locator("footer a[href='/verified-messages']").click();
  await expect(page).toHaveURL(/\/verified-messages$/);
  await expect(page.locator("h1")).toBeVisible();
});

test("LANDING-ENTRY-009 plays the entrance when the landing's stylesheet arrives after the application JavaScript", async ({ page }) => {
  // A slow connection: the page's own stylesheet comes last. The first paint waits for it, so the entrance must too.
  await page.route(/\/assets\/Landing-.*\.css$/, async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue(); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Read the page in the very frame its last stylesheet arrives: a busy machine must not turn this into a race with the entrance itself.
  const arrived = await page.evaluate(async () => {
    const pending = [...document.querySelectorAll<HTMLLinkElement>('head link[rel="stylesheet"]')].filter(link => !link.sheet);
    await Promise.all(pending.map(link => new Promise(resolve => link.addEventListener("load", resolve, { once: true }))));
    await new Promise(requestAnimationFrame);
    return {
      header: document.querySelector(".site-header")!.getAnimations().map(animation => (animation as CSSAnimation).animationName),
      logo: document.querySelector(".core-fallback")!.getAnimations().map(animation => (animation as CSSAnimation).animationName),
    };
  });
  expect(arrived.header).toContain("header-arrive");
  expect(arrived.logo).toContain("logo-arrive");
});

test("LANDING-ENTRY-008 links every page's own styles in its prerendered head", async ({ page, request }) => {
  for (const path of ["/", "/de", "/verified-messages", "/impressum", "/datenschutz"]) {
    const html = await (await request.get(path)).text();
    const head = html.slice(0, html.indexOf("</head>"));
    const linked = [...head.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // A stylesheet the page needs but links only from JavaScript paints the page unstyled first.
    const used = await page.evaluate(() => [...document.styleSheets].flatMap((sheet) => (sheet.href ? [new URL(sheet.href).pathname] : [])));
    expect(used.length, path).toBeGreaterThan(0);
    expect(used.filter((href) => !linked.includes(href)), path).toEqual([]);
  }
});

test("LANDING-ENTRY-007 never loses the page over the router's hydration data", async ({ page, request }) => {
  for (const path of ["/", "/de"]) {
    // The data runs before the app module that reads it, without blocking the first paint.
    const html = await (await request.get(path)).text();
    const head = html.slice(0, html.indexOf("</head>"));
    const data = [...html.matchAll(/<script([^>]*) src="\/assets\/route-[0-9a-f]+\.js"><\/script>/g)];
    expect(data.length, path).toBeGreaterThan(0);
    for (const [tag, attributes] of data) {
      expect(attributes, path).toBe(" defer");
      expect(head.indexOf(tag), path).toBeGreaterThan(-1);
      expect(head.indexOf(tag), path).toBeLessThan(head.indexOf('<script type="module"'));
    }
  }
  // Even if the data never arrives, the app renders instead of removing the page.
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/\/assets\/route-[0-9a-f]+\.js$/, route => route.abort());
  await page.goto("/de");
  await expect(page.locator("h1")).toHaveText("Die Sprachebene für deinen Mac.");
  await expect(page.locator(".hero-actions .landing-download")).toBeVisible();
  expect(errors).toEqual([]);
});

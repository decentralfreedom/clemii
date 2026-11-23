// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Clemens Kressmann
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  // This composition has no external assets or requests.
  await page.route("**/*", route => route.abort());
  // The brand is the site's own mark, drawn in.
  const mark = await Bun.file("public/clemii-mark.svg").text();
  const source = (await Bun.file("scripts/social-card.html").text()).replace("<!--clemii-mark-->", mark);
  await mkdir("public/social", { recursive: true });
  for (const [variant, filename] of [["home", "clemii"], ["verified", "verified-messages"]]) {
    await page.setContent(source.replace('data-page="home"', `data-page="${variant}"`));
    await page.screenshot({ path: `public/social/${filename}.png` });
  }
} finally {
  await browser.close();
}

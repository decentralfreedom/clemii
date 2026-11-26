// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Clemens Kressmann
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Reuse the website's pinned Playwright dependency. No separate toolchain.
const require = createRequire(new URL("../../webapp/apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const browser = await chromium.launch();
// The README cover first: the social preview is drawn from it.
const renders = [
  ["../../macos/docs/assets/readme-cover.html", "../../macos/docs/assets/readme-cover.png", { width: 1280, height: 900 }],
  ["github-social.html", "github-social.png", { width: 1280, height: 640 }],
];
try {
  for (const [source, output, viewport] of renders) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.route(/^https?:/, route => route.abort());
    await page.goto(new URL(source, import.meta.url).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    await page.screenshot({ path: fileURLToPath(new URL(output, import.meta.url)) });
    await page.close();
  }
} finally {
  await browser.close();
}

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Photographs the mascot: opens scripts/mascot/portraits.html in the development server, which poses
// the hero's own clemii figure, and saves each pose as a picture. The outputs are committed; run
// again after changing the figure:  bun scripts/generate-mascot.ts
//   src/media/mascot/clemii-<pose>.webp        listening, sad, peeking, grip, portrait
//   src/media/mascot/clemii-<pose>-soft.webp   peeking and grip, toned down to sit in the marble collage
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const port = 4698;
const server = Bun.spawn(["bunx", "vite", "--port", String(port), "--strictPort"], { stdout: "ignore", stderr: "inherit" });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (let attempt = 0; ; attempt++) {
    try { await page.goto(`http://localhost:${port}/scripts/mascot/portraits.html`); break; }
    catch (error) { if (attempt > 40) throw error; await Bun.sleep(250); }
  }
  await page.waitForFunction(() => Array.isArray(window.portraits));
  await mkdir("src/media/mascot", { recursive: true });
  for (const name of await page.evaluate(() => window.portraits)) {
    const png = Buffer.from((await page.evaluate((pose) => window.portrait(pose), name)).split(",")[1]!, "base64");
    await sharp(png).webp({ quality: 90, alphaQuality: 100 }).toFile(`src/media/mascot/clemii-${name}.webp`);
    if (name === "peeking" || name === "grip") await sharp(png).modulate({ saturation: 0.7 }).webp({ quality: 90, alphaQuality: 100 }).toFile(`src/media/mascot/clemii-${name}-soft.webp`);
  }
  console.info("Wrote the mascot's portraits to src/media/mascot");
} finally {
  await browser.close();
  server.kill();
}

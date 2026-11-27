// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Films the hero for the macOS app's onboarding: opens scripts/hero-film/film.html in the
// development server, saves each frame, and has ffmpeg encode them as HEVC with an alpha channel,
// which AVFoundation plays over any background. Also saves one still for visitors who ask for less
// motion. The outputs are committed; run again after changing the hero:
//   bun scripts/generate-hero-film.ts        (needs ffmpeg with VideoToolbox, as Homebrew's has)
//   macos/Clemii/Clemii/Resources/Onboarding/clemii-hero.mov   the greeting and two rounds of the loop, 19 seconds
//   macos/Clemii/Clemii/Resources/Onboarding/clemii-hero.png   the brothers in calm flight
import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 4697, rate = 30, seconds = 19;
const resources = new URL("../../../../macos/Clemii/Clemii/Resources/Onboarding/", import.meta.url).pathname;
const frames = await mkdtemp(join(tmpdir(), "clemii-hero-film-"));
const server = Bun.spawn(["bunx", "vite", "--port", String(port), "--strictPort"], { stdout: "ignore", stderr: "inherit" });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (let attempt = 0; ; attempt++) {
    try { await page.goto(`http://localhost:${port}/scripts/hero-film/film.html`); break; }
    catch (error) { if (attempt > 160) throw error; await Bun.sleep(250); }
  }
  await page.waitForFunction(() => window.filmReady);
  const png = async (moment: number) => Buffer.from((await page.evaluate((at) => window.frame(at), moment)).split(",")[1]!, "base64");
  for (let index = 0; index < rate * seconds; index++) await Bun.write(join(frames, `${String(index).padStart(4, "0")}.png`), await png(index / rate));
  // Calm flight: after the greeting, before the first squabble.
  await Bun.write(`${resources}clemii-hero.png`, await png(4.4));
  const encode = Bun.spawnSync(["ffmpeg", "-y", "-loglevel", "error", "-framerate", String(rate), "-i", join(frames, "%04d.png"),
    "-c:v", "hevc_videotoolbox", "-alpha_quality", "0.8", "-q:v", "62", "-tag:v", "hvc1", "-pix_fmt", "bgra", `${resources}clemii-hero.mov`], { stderr: "inherit" });
  if (encode.exitCode !== 0) throw new Error("ffmpeg could not encode the film");
  console.info(`Wrote clemii-hero.mov (${seconds} s) and clemii-hero.png to macos/Clemii/Clemii/Resources/Onboarding`);
} finally {
  await browser.close();
  server.kill();
  await rm(frames, { recursive: true, force: true });
}

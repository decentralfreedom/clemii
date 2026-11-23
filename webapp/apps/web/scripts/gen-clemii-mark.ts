// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Draws the clemii mark from the brothers' geometry: the header's mark, the favicon and the hero's
// flat stand-in. Run: bun scripts/gen-clemii-mark.ts, then bun scripts/generate-favicons.ts
import { writeFileSync } from "node:fs";
import { along, big, globe, mix, polar, ribbonEdge, small, smooth, type Brother, type Point } from "../src/landing/hero/brothers";

const web = new URL("..", import.meta.url).pathname;
const R = 200, cx = 256, cy = 256;
const n = (value: number) => +value.toFixed(1);
const at = ([x, y]: Point) => `${n(cx + R * x)} ${n(cy - R * y)}`;
const path = (points: Point[]) => `M${points.map(at).join(" L")} Z`;

let gradients = 0;
/**
 * A brother's ribbon between two angles, and on it an inner band a shade deeper, which gives the
 * ring its depth. SVG has no gradient that runs round a circle, so the ribbon is cut into a few
 * lengths, each with a straight gradient between its ends: few enough shapes to edit by hand.
 */
function ribbon(name: string, me: Brother, other: Brother, from: number, to: number) {
  const out: string[] = [], pieces = Math.ceil((to - from) / 36), span = (to - from) / pieces;
  for (const band of [false, true]) {
    // The band covers the inner part of the ribbon, growing in from where it starts.
    const share = (angle: number) => (band ? 0.44 * smooth((along(me, angle) - 0.06) / 0.22) : 1);
    const colour = (angle: number) => (band ? mix(me.colours, along(me, angle) + 0.2, 0.1) : mix(me.colours, along(me, angle)));
    const edges = (angle: number) => { const low = ribbonEdge(me, other, angle); return [low, low + (1 - low) * share(angle)] as const; };
    for (let piece = 0; piece < pieces; piece++) {
      // Each length runs a little under the next, so no hairline shows between them.
      const start = from + piece * span, end = Math.min(to, start + span + (piece < pieces - 1 ? 0.6 : 0));
      if (share(end) === 0) continue;
      const steps = Math.ceil(end - start), angles = Array.from({ length: steps + 1 }, (_, index) => start + ((end - start) * index) / steps);
      const outline = [...angles.map((angle) => polar(angle, edges(angle)[1])), ...angles.map((angle) => polar(angle, edges(angle)[0])).reverse()];
      const middle = (angle: number) => { const [low, high] = edges(angle); return at(polar(angle, (low + high) / 2)).split(" "); };
      const id = `g${++gradients}`, [x1, y1] = middle(start), [x2, y2] = middle(end);
      out.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${colour(start)}"/><stop offset=".5" stop-color="${colour((start + end) / 2)}"/><stop offset="1" stop-color="${colour(end)}"/></linearGradient><path d="${path(outline)}" fill="url(#${id})"/>`);
    }
  }
  return `<g id="${name}">${out.join("")}</g>`;
}
const sphere = R * globe;
// Each ribbon's end lies over the other's start, so the big one's end is drawn again on top.
const inside = `<defs>
<linearGradient id="globe" x1=".15" y1=".1" x2=".85" y2=".9"><stop offset="0" stop-color="#b874ff"/><stop offset=".45" stop-color="#6a4afd"/><stop offset="1" stop-color="#1f3bdc"/></linearGradient>
<radialGradient id="globe-shade" cx=".7" cy=".76" r=".75"><stop offset="0" stop-color="#1a1a9c" stop-opacity=".55"/><stop offset="1" stop-color="#1a1a9c" stop-opacity="0"/></radialGradient>
</defs>
<g id="globe-ball"><circle cx="${cx}" cy="${cy}" r="${n(sphere)}" fill="url(#globe)"/><circle cx="${cx}" cy="${cy}" r="${n(sphere)}" fill="url(#globe-shade)"/>
<ellipse cx="${n(cx - sphere * 0.36)}" cy="${n(cy - sphere * 0.52)}" rx="${n(sphere * 0.36)}" ry="${n(sphere * 0.15)}" fill="#fff" fill-opacity=".38" transform="rotate(-32 ${n(cx - sphere * 0.36)} ${n(cy - sphere * 0.52)})"/></g>
${ribbon("big-brother-cape", big, small, big.head, big.tip)}
${ribbon("clemii-cape", small, big, small.head, small.tip)}
${ribbon("big-brother-cape-end", big, small, small.head, big.tip)}`;
// A square box about the ring, with a hair of room.
const reach = R * 1.02;
const box = `${n(cx - reach)} ${n(cy - reach)} ${n(reach * 2)} ${n(reach * 2)}`;
const titled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-labelledby="t"><title id="t">clemii</title>${inside}</svg>\n`;
writeFileSync(`${web}public/clemii-mark.svg`, titled);
writeFileSync(`${web}public/favicon.svg`, titled);
writeFileSync(`${web}src/landing/clemii-mark.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" aria-hidden="true">${inside}</svg>\n`);

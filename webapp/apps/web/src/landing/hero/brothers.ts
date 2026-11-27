// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// clemii's two brothers, as the logo draws them: a ring round a globe, as
// Firefox's fox is a band round its own. The ring is the two of them, a warm
// one and a cool one, each a ribbon of cape that sweeps half way round and
// ends in a point lying over the start of his brother's. They fly clockwise,
// so a ribbon runs anticlockwise from where it starts. The logo shows no more
// of them than that; the hero's 3D figures are the same two with bodies and
// faces, and take their eyes from here.
//
// All measures are in the ring's outer radius (1), about its centre, y up,
// angles in degrees anticlockwise from the right.

export type Point = [number, number];
const rad = (degrees: number) => (degrees * Math.PI) / 180;
export const smooth = (value: number) => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
export const polar = (angle: number, radius: number): Point => [radius * Math.cos(rad(angle)), radius * Math.sin(rad(angle))];

/** The globe's radius and the ring's inner edge; between them is air. */
export const globe = 0.45, inner = 0.6;

/** A brother's eyes, as anime draws them: dark at the top, bright below, a glow at the foot; and the ink of his lids and mouth. */
export type Eyes = { top: string; middle: string; bottom: string; glow: string; ink: string; mouth: string };
/**
 * A brother: the angle his ribbon starts at (where his head would be), the angle it ends at, his
 * colours from its start to its tip, and his eyes.
 */
export type Brother = { head: number; tip: number; colours: string[]; eyes: Eyes };
export const big: Brother = {
  head: 45, tip: 45 + 218,
  colours: ["#ff8a1c", "#ffd22a", "#ff8f47", "#ee2a8f", "#b01fb4"],
  eyes: { top: "#1b1c66", middle: "#2f62e0", bottom: "#86dcff", glow: "rgba(190, 240, 255, .85)", ink: "#4a1030", mouth: "#8f1f45" },
};
export const small: Brother = {
  head: 232, tip: 232 + 208,
  colours: ["#16b4f8", "#0c8af3", "#5f80fd", "#b65cfd", "#a52efc"],
  eyes: { top: "#4a1140", middle: "#e2552f", bottom: "#ffc94f", glow: "rgba(255, 236, 170, .85)", ink: "#14204f", mouth: "#8f1f45" },
};

const channels = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
/** A colour between the given ones, by how far along them it is, from 0 to 1; darker by `shade`. */
export function mix(colours: string[], along: number, shade = 0) {
  const at = Math.min(1, Math.max(0, along)) * (colours.length - 1), low = Math.min(colours.length - 2, Math.floor(at));
  const [from, to] = [channels(colours[low]!), channels(colours[low + 1]!)];
  return `#${from.map((value, index) => Math.round((value + (to[index]! - value) * (at - low)) * (1 - shade)).toString(16).padStart(2, "0")).join("")}`;
}
/** How far along his ribbon an angle is, from his head (0) to his cape's tip (1). */
export const along = (me: Brother, angle: number) => (angle - me.head) / (me.tip - me.head);
/**
 * The inner edge of a brother's ribbon at an angle: the ring's inner edge until his brother's head,
 * then out to the rim in a point, so that the end of his cape lies on the outside of his brother.
 */
export function ribbonEdge(me: Brother, other: Brother, angle: number, edge = inner) {
  const from = other.head < me.head ? other.head + 360 : other.head;
  return angle <= from ? edge : edge + (1 - edge) * Math.min(1, (angle - from) / (me.tip - from)) ** 1.25;
}

/**
 * The mark as a glyph of one colour, for a menu bar or a small badge, where there is no room for
 * colour to tell the brothers apart: each ribbon is a comma with air between it and the other, and
 * the globe is a dot. A little bolder than the mark, to hold at 16 points.
 */
export function glyph() {
  const edge = 0.6, air = 0.14, dot = 0.3;
  const ribbons = [[big, small], [small, big]].map(([me, other]) => {
    // Where his brother's cape, lying over his start, comes to its point.
    const over = other!.tip - 360 < me!.head ? other!.tip : other!.tip - 360;
    const outer: Point[] = [], innerSide: Point[] = [];
    for (let angle = me!.head; angle <= me!.tip; angle += 1) {
      const low = ribbonEdge(me!, other!, angle, edge);
      const high = angle < over ? edge + (1 - edge) * ((angle - me!.head) / (over - me!.head)) ** 1.25 - air : 1;
      if (high - low < 0.02) continue;
      outer.push(polar(angle, high));
      innerSide.push(polar(angle, low));
    }
    return [...outer, ...innerSide.reverse()];
  });
  return { ribbons, dot };
}

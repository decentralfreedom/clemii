// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { big, small, mix, polar, ribbonEdge, smooth, type Brother } from "./brothers";

/**
 * The hero's opening: the logo, in 3D, turns to water and the water becomes the brothers.
 *
 * It starts as the mark exactly as the header draws it, a ring of two ribbons round a globe, and as
 * large as the flat mark the page shows before the scene is ready, so the one takes over from the
 * other unseen. Then each ribbon runs off from its tip as a stream of drops, as a jet of water breaks
 * up, the drops flow round the globe after their brother's place on the orbit and gather into one
 * drop there, and out of that drop he comes, with a splash.
 *
 * The drops follow the story by `arrival`, so it lands on time on any machine; springs give them
 * the weight and the overshoot of water. Everything is in the ring's plane, which the scene tilts.
 */

/** The flat mark's ring in scene units: 76% of the core, the ring 200 of the mark's 408. */
export const logoRadius = 1.7;
const thickness = 0.07;

/** A brother's part in the opening: when his ribbon runs off, and when he comes out of his drop. */
type Part = { me: Brother; other: Brother; pop: number };
const parts: Part[] = [{ me: big, other: small, pop: 0.6 }, { me: small, other: big, pop: 0.54 }];
/** Drops per ribbon: few enough that one drop is several cells of the field across. */
const drops = 14;

/**
 * Paint a lit material mostly in its own vertex colours, as the flat mark is: the colours glow, and
 * the light adds only the sheen and the shade that make it 3D. Without this, light darkens the
 * mark's yellow to orange.
 */
export function logoPaint<M extends THREE.MeshPhysicalMaterial>(material: M) {
  material.color.setScalar(0.1);
  material.specularIntensity = 0.35;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.8;");
  };
  material.customProgramCacheKey = () => "clemii-logo-paint";
  return material;
}

/** A seeded random, so every visitor and every test sees the same splash. */
function seeded(seed: number) {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
}

/** `capes` is how far round the globe each brother's cape reaches, in degrees, big brother first. */
export function createLiquidOpening(orbit: number, capes: number[]) {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  // The ribbons: the mark's two, with a rounded section so they catch the light, in the mark's own
  // colours. Not tone-mapped, so they keep the header's colours.
  // A soft sheen, not a mirror: sharp highlights would wash out the mark's yellow and catch the
  // scene's cyan rim light.
  const ribbonSkin = logoPaint(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.15, toneMapped: false }));
  disposables.push(ribbonSkin);
  const rows = 140, columns = 28;
  const ribbons = parts.map(({ me, other }) => {
    const geometry = new THREE.BufferGeometry();
    const count = (rows + 1) * (columns + 1) * 2;
    const spots = new Float32Array(count * 3), paint = new Float32Array(count * 3), faces: number[] = [];
    const colour = new THREE.Color();
    for (let face = 0; face < 2; face++) for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const a = face * (rows + 1) * (columns + 1) + row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
      if (face) faces.push(a, b, c, b, d, c); else faces.push(a, c, b, b, c, d);
    }
    // As the mark: its colours from head to tip, and on the inner side a band a shade deeper that
    // grows in from the head, which gives the ring its depth.
    const band = new THREE.Color(), shade = new THREE.Color();
    for (let face = 0; face < 2; face++) for (let row = 0; row <= rows; row++) {
      const far = row / rows, share = 0.44 * smooth((far - 0.06) / 0.22);
      colour.set(mix(me.colours, far));
      band.set(mix(me.colours, far + 0.2, 0.1));
      for (let column = 0; column <= columns; column++) {
        // The band's edge is a soft step a column wide, so it reads as one line, not a staircase.
        shade.copy(band).lerp(colour, smooth((column / columns - share) * columns + 0.5));
        paint.set([shade.r, shade.g, shade.b], ((face * (rows + 1) + row) * (columns + 1) + column) * 3);
      }
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(spots, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(paint, 3));
    geometry.setIndex(faces);
    disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, ribbonSkin);
    mesh.frustumCulled = false;
    group.add(mesh);
    /** Where his brother's cape lies over his start, his own end rides a little higher. */
    const under = other.head < me.head ? other.head + 360 : other.head;
    /** Lay the ribbon from its head to `tip`, an angle short of or at the mark's own tip. */
    function lay(tip: number) {
      for (let face = 0; face < 2; face++) for (let row = 0; row <= rows; row++) {
        const angle = me.head + (tip - me.head) * (row / rows), low = ribbonEdge(me, other, angle), lift = 0.03 * smooth((angle - under) / 12);
        for (let column = 0; column <= columns; column++) {
          const side = (column / columns) * 2 - 1, radius = logoRadius * (low + (1 - low) * (side + 1) / 2);
          const [x, y] = polar(angle, radius);
          spots.set([x, y, lift + (face ? -1 : 1) * thickness * Math.sqrt(Math.max(0, 1 - side * side))], ((face * (rows + 1) + row) * (columns + 1) + column) * 3);
        }
      }
      geometry.getAttribute("position").needsUpdate = true;
      geometry.computeVertexNormals();
    }
    lay(me.tip);
    return { mesh, lay };
  });

  // The water: one field for both brothers' drops, glossy as the globe.
  const water = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2, toneMapped: false });
  disposables.push(water);
  const span = 2.05, field = new MarchingCubes(60, water, false, true, 60000);
  field.scale.setScalar(span);
  field.frustumCulled = false;
  field.isolation = 80;
  group.add(field);
  const subtract = 12, smallest = (2.5 * 2 * span) / 60 / 2;
  /** A drop of radius `size` in the scene at (x, y, z) of the ring's plane. */
  function addDrop(x: number, y: number, z: number, size: number, colour: THREE.Color) {
    // Smaller than about two and a half of the field's cells a drop comes out faceted: it is gone instead.
    if (size < smallest) return;
    const half = size / (2 * span);
    field.addBall(x / (2 * span) + 0.5, y / (2 * span) + 0.5, z / (2 * span) + 0.5, half * half * (80 + subtract), subtract, colour);
  }

  // Each drop: where it is, how fast it goes, where along the ribbon it came from (0 the head, 1 the tip).
  const streams = parts.map(({ me }) => Array.from({ length: drops }, (_, index) => {
    const from = 1 - index / (drops - 1);
    return { from, born: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), colour: new THREE.Color(mix(me.colours, from)) };
  }));

  // The splash as he comes out: small glossy beads that fly and fall.
  const beads = 12, random = seeded(7);
  const beadShape = new THREE.SphereGeometry(1, 16, 12);
  disposables.push(beadShape);
  // The beads take their colour per bead, not per vertex as the field's water does.
  const beadWater = new THREE.MeshPhysicalMaterial({ roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2, toneMapped: false });
  disposables.push(beadWater);
  const splash = new THREE.InstancedMesh(beadShape, beadWater, beads * parts.length);
  splash.frustumCulled = false;
  group.add(splash);
  const flights = parts.map(() => Array.from({ length: beads }, () => ({ turn: random() * Math.PI * 2, speed: 1.6 + random() * 1.6, lift: 0.6 + random() * 0.9, size: 0.035 + random() * 0.045 })));
  const placing = new THREE.Object3D(), tint = new THREE.Color();
  // Each bead keeps its brother's colour; set before the shader is compiled, which needs to know of them.
  parts.forEach(({ me }, index) => { for (let number = 0; number < beads; number++) splash.setColorAt(index * beads + number, tint.set(mix(me.colours, number / beads))); });

  let last: number | undefined, done = false, played = false;
  const target = new THREE.Vector3(), pull = new THREE.Vector3();
  const stiffness = 70, damping = 2 * Math.sqrt(stiffness) * 0.5;

  return {
    group,
    /**
     * One frame of the opening. `arrival` runs from 0 to 1; `angles` are the brothers' places on
     * the orbit now, in radians, big brother first. Returns how far each brother has come out of his
     * drop, from 0 to 1, for the scene to grow him.
     */
    update(seconds: number, arrival: number, angles: number[]): number[] {
      const step = last === undefined ? 0 : Math.min(0.05, Math.max(0, seconds - last));
      last = seconds;
      // At rest, before any opening (the first pose, less motion), it is only hidden: an opening may
      // still come. Once one has played to its end, it is gone.
      if (arrival >= 1) {
        if (played) this.finish();
        else group.visible = false;
        return [1, 1];
      }
      if (done) return [1, 1];
      played = true;
      group.visible = true;
      // The ribbons run off from their tips, the big brother's a moment before clemii's.
      const runs = parts.map((_, index) => smooth((arrival - 0.03 - index * 0.03) / 0.3));
      ribbons.forEach(({ mesh, lay }, index) => {
        const { me } = parts[index]!, run = runs[index]!;
        mesh.visible = run < 0.995;
        if (mesh.visible && run > 0) lay(me.tip - (me.tip - me.head) * run);
      });
      field.reset();
      const gather = smooth((arrival - 0.34) / 0.2);
      const out = parts.map(({ pop }) => Math.min(1, Math.max(0, (arrival - pop) / 0.2)));
      streams.forEach((stream, index) => {
        const { me, other, pop } = parts[index]!, run = runs[index]!, angle = angles[index]!;
        // As he comes out of his drop, its water runs back along where his cape will be, and drains
        // into it: the water becomes his cape. Just before, the drop swells, as water does before it
        // bursts.
        const flow = smooth((arrival - pop) / 0.14), drain = smooth((arrival - pop - 0.06) / 0.2);
        const swell = 1 + 0.22 * Math.max(0, 1 - Math.abs(arrival - pop + 0.02) / 0.03);
        const cape = (capes[index]! * Math.PI) / 180;
        for (const drop of stream) {
          if (!drop.born) {
            if (run <= 0 || run < 1 - drop.from) continue;
            // A drop is born where the ribbon's tip is now, in the middle of its band.
            const at = me.head + (me.tip - me.head) * drop.from, low = ribbonEdge(me, other, at);
            const [x, y] = polar(at, logoRadius * (low + 1) / 2);
            drop.position.set(x, y, 0);
            drop.velocity.set(0, 0, 0);
            drop.born = true;
          }
          // It flows round the globe after his place, strung out behind him as a stream of water
          // would be, then gathers into one drop where he is.
          const behind = (1 - gather) * drop.from * 1.9 + 0.12 * (1 - gather) * Math.sin(seconds * 6 + drop.from * 9) + flow * drop.from * cape * 0.9;
          const radius = orbit + (1 - gather) * 0.09 * Math.sin(drop.from * 11 + seconds * 4) - flow * 0.12 * drop.from;
          target.set(Math.cos(angle + behind) * radius, Math.sin(angle + behind) * radius, 0.06 * Math.sin(drop.from * 7 + seconds * 3) * (1 - gather));
          for (let left = step; left > 1e-6; left -= 1 / 240) {
            const dt = Math.min(left, 1 / 240);
            pull.copy(target).sub(drop.position).multiplyScalar(stiffness).addScaledVector(drop.velocity, -damping);
            drop.velocity.addScaledVector(pull, dt);
            drop.position.addScaledVector(drop.velocity, dt);
          }
          // Together the drops make one about his head's size; a tip drop is smaller than a head drop.
          const size = (0.11 + 0.03 * (1 - drop.from)) * (1 - 0.15 * gather) * swell * (1 - drain) * (1 - 0.5 * flow * (1 - drop.from));
          addDrop(drop.position.x, drop.position.y, drop.position.z, size, drop.colour);
        }
        // The splash: beads thrown out from his drop, falling and shrinking.
        const flown = Math.max(0, arrival - pop - 0.02) * 2.6;
        flights[index]!.forEach((bead, number) => {
          const slot = index * beads + number, alive = flown > 0 && flown < 0.7;
          const [x, y] = polar(angle * 180 / Math.PI, orbit);
          placing.position.set(
            x + Math.cos(bead.turn) * bead.speed * flown * 0.6,
            y + Math.sin(bead.turn) * bead.speed * flown * 0.6 + bead.lift * flown - 2.4 * flown * flown,
            0.25 * Math.sin(bead.turn * 3) * flown);
          placing.scale.setScalar(alive ? bead.size * (1 - flown / 0.7) : 0);
          placing.updateMatrix();
          splash.setMatrixAt(slot, placing.matrix);
        });
      });
      field.update();
      splash.instanceMatrix.needsUpdate = true;
      return out;
    },
    /** After the opening nothing of it is drawn or computed again. */
    finish() {
      if (done) return;
      done = true;
      group.removeFromParent();
      field.geometry.dispose();
      for (const item of disposables) item.dispose();
    },
    /** How much the opening is still the logo, from 1 at its start to 0 once it has turned. */
    logo(arrival: number) { return arrival >= 1 ? 0 : 1 - smooth((arrival - 0.02) / 0.4); },
  };
}
export type LiquidOpening = ReturnType<typeof createLiquidOpening>;

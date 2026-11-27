// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import * as THREE from "three";
import { big, globe, mix, small, smooth } from "./brothers";
import { figureWorkshop } from "./figure";
import { createLiquidOpening, logoPaint, logoRadius } from "./liquid";

const mixColour = (from: string, to: string, along: number) => mix([from, to], along);

/**
 * The hero's model: a globe of water and two small superheroes who fly round
 * it, each chasing the other's cape: clemii, the little one, with an
 * assistant's headset, and his big brother. They are jointed figures on an
 * orbit that leans back, so they pass behind the globe and before it; they
 * squabble and they make up, as brothers do. The logo is the same pair drawn
 * as one plain ring. The entrance is the scene's own: it opens as that logo in 3D, which turns to
 * water and becomes the brothers (liquid.ts), and they greet. The caller owns the environment texture.
 */
export function createHeroScene(environmentMap: THREE.CompressedCubeTexture) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  camera.position.set(0, 0, 8.5);
  scene.environment = environmentMap;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xf8fcff, 0x4a5a8a, 0.6));
  const light = new THREE.DirectionalLight(0xffffff, 1.9);
  light.position.set(-3, 5, 6);
  scene.add(light);
  const rimLight = new THREE.PointLight(0x8ff3ff, 6, 6);
  rimLight.position.set(1.6, -0.4, 1.4);
  scene.add(rimLight);

  const body = new THREE.Group();
  scene.add(body);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const keep = <G extends THREE.BufferGeometry>(geometry: G) => { geometries.push(geometry); return geometry; };
  function material(options: THREE.MeshPhysicalMaterialParameters) {
    const result = new THREE.MeshPhysicalMaterial(options);
    materials.push(result);
    return result;
  }
  function addLayer(object: THREE.Object3D, x: number, y: number, z: number) {
    object.position.set(x, y, z);
    body.add(object);
  }

  const { hero, ring, orbit, textures } = figureWorkshop({ keep, material, materials });
  // The big brother in warm colours; clemii, the little one, in cool ones. Each wears his brother's
  // colour, and has it in his eyes. Their capes are cut so that a like gap is left at each end.
  const heroes = [
    hero(1.1, 156, { stops: [[0, 0xffab24], [0.3, 0xff7a30], [0.7, 0xf0406a], [1, 0xa02aa0]], wears: 0x3b6cf0, glow: 0xff9a4a, assistant: false, eyes: big.eyes }),
    hero(0.86, 130, { stops: [[0, 0x45c8f2], [0.3, 0x2f9fe6], [0.7, 0x3460d6], [1, 0x4a3fc0]], wears: 0xffb23a, glow: 0x59c8ff, assistant: true, eyes: small.eyes }),
  ];
  /** The gap between a fist and the cape ahead, in degrees, and where each brother starts. */
  const gap = (360 - heroes.reduce((sum, { lead, cape }) => sum + lead + cape, 0)) / 2;
  const starts = [60, 60 + heroes[0]!.cape + gap + heroes[1]!.lead];
  addLayer(ring, 0, 0, 0);
  const opening = createLiquidOpening(orbit, heroes.map(({ cape }) => cape));
  ring.add(opening.group);
  /** The globe as the logo draws it, against the globe of water it becomes. */
  const logoGlobe = (logoRadius * globe) / 0.85;
  const lean = ring.rotation.x;
  const logoWater = new THREE.Color(0x4a2fe8), logoLight = new THREE.Color(0x2a1aa8), deepWater = new THREE.Color(0x051a44), deepLight = new THREE.Color(0x06205c);

  // The globe: a sphere of water, in the manner of liquid glass: dark and clear, lit from within, with
  // a bright edge.
  const orb = new THREE.Group();
  const water = material({ color: 0x051a44, metalness: 0.1, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.9,
    envMapIntensity: 1.1, emissive: 0x06205c, emissiveIntensity: 0.35 });
  const drop = new THREE.Mesh(keep(new THREE.SphereGeometry(0.85, 64, 48)), water);
  const glow = new THREE.Mesh(keep(new THREE.SphereGeometry(0.5, 48, 32)), material({ color: 0x1668d8, roughness: 0.4, emissive: 0x1f7fe8, emissiveIntensity: 0.55 }));
  glow.scale.z = 0.45;
  const edgeLight = new THREE.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.6, side: THREE.BackSide });
  materials.push(edgeLight);
  const edge = new THREE.Mesh(keep(new THREE.SphereGeometry(0.875, 64, 48)), edgeLight);
  orb.add(edge, glow, drop);
  // The opening's globe is the logo's: its own gradient, light violet at the top left to deep blue at
  // the bottom right, glossy. It clears into the globe of water as the logo turns.
  const logoBallShape = keep(new THREE.SphereGeometry(0.86, 64, 48));
  const paint: number[] = [], tone = new THREE.Color(), corner = new THREE.Vector2(-0.7, 0.8).normalize();
  const spot = logoBallShape.getAttribute("position");
  for (let index = 0; index < spot.count; index++) {
    const along = (1 - (spot.getX(index) * corner.x + spot.getY(index) * corner.y) / 0.86) / 2;
    tone.set(along < 0.45 ? mixColour("#b874ff", "#6a4afd", along / 0.45) : mixColour("#6a4afd", "#1f3bdc", (along - 0.45) / 0.55));
    paint.push(tone.r, tone.g, tone.b);
  }
  logoBallShape.setAttribute("color", new THREE.Float32BufferAttribute(paint, 3));
  const logoBallSkin = logoPaint(material({ vertexColors: true, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6, toneMapped: false, transparent: true }));
  const logoBall = new THREE.Mesh(logoBallShape, logoBallSkin);
  opening.group.add(logoBall);
  addLayer(orb, 0, 0, 0);

  // What the globe holds, in front: four strokes of light that are, in turn, the three things clemii
  // does. Your voice as a waveform (dictation); lines of text with a caret (speech to text); a tick
  // (the assistant has done it). All of it stays inside the glass, as all of it stays on your Mac.
  const front = new THREE.Group();
  const ceramic = material({ color: 0xffffff, emissive: 0xd9f6ff, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.2, clearcoat: 1 });
  const stroke = 0.068, margin = -0.33;
  /** Each stroke as [x, y, turn, length] in the waveform, in the text and in the tick; a text line's x is its left end. */
  const strokes: [number, number, number, number][][] = [
    [[-0.3375, 0, 0, 0.26], [margin, 0.2, Math.PI / 2, 0.6], [-0.17, -0.1, Math.PI / 4, 0.3]],
    [[-0.1125, 0, 0, 0.64], [margin, 0, Math.PI / 2, 0.66], [0.1, 0.01, Math.PI - 0.733, 0.62]],
    [[0.1125, 0, 0, 0.45], [margin, -0.2, Math.PI / 2, 0.36], [0.1, 0.01, Math.PI - 0.733, 0]],
    [[0.3375, 0, 0, 0.21], [margin + 0.36 + 0.1, -0.2, 0, 0.2], [0.1, 0.01, 0, 0]],
  ];
  const bars = strokes.map(([wave]) => {
    const bar = new THREE.Mesh(keep(new THREE.CapsuleGeometry(stroke, wave![3] - stroke * 2, 6, 16)), ceramic);
    front.add(bar);
    return bar;
  });
  addLayer(front, 0, 0, 0.88);

  // The heart that rises from the globe when the brothers make up.
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.5);
  heartShape.bezierCurveTo(-0.95, 0.1, -0.5, 0.85, 0, 0.32);
  heartShape.bezierCurveTo(0.5, 0.85, 0.95, 0.1, 0, -0.5);
  const heartGeometry = keep(new THREE.ExtrudeGeometry(heartShape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.09, bevelThickness: 0.09, bevelSegments: 8, curveSegments: 24 }));
  heartGeometry.translate(0, 0, -0.08);
  const heartSkin = material({ color: 0xff5c8a, emissive: 0xff2f6d, emissiveIntensity: 0.45, roughness: 0.2, clearcoat: 1, transparent: true });
  const heart = new THREE.Mesh(heartGeometry, heartSkin);
  heart.visible = false;
  const love = new THREE.Group();
  love.add(heart);
  addLayer(love, 0, 0, 1.05);

  const degrees = Math.PI / 180;
  const facing = new THREE.Quaternion(), turned = new THREE.Quaternion(), nod = new THREE.Euler();
  const bell = (value: number, at: number, width: number) => Math.max(0, 1 - Math.abs(value - at) / width);
  /** When the scene began and when its greeting ended, in the caller's seconds. */
  let born: number | undefined, greeted: number | undefined;
  const backOut = (value: number) => { const t = Math.min(1, Math.max(0, value)) - 1; return 1 + 2.7 * t ** 3 + 1.7 * t ** 2; };
  const model = {
    scene, camera, body,
    /**
     * The brothers, in a loop. They fly round the globe while it listens, each behind the other's
     * cape. Then they squabble: the big one darts ahead and bops his little brother's cape, clemii
     * darts after him and bops him back, and the chase whirls once around. They land, the water
     * lights up and a heart rises: brothers again. Called every frame while the hero is on screen.
     * `arrival` runs from 0 to 1 over the page's entrance, which is a greeting: the globe swells into
     * place and the brothers come out of it, clemii first, wide-eyed, then glad and waving at you,
     * his big brother after him, while a heart rises. So the loop starts where they make up, and
     * the first thing a visitor sees of them is that they are fond.
     */
    animate(now: number, arrival = 1) {
      born ??= now;
      const greeting = arrival < 1;
      if (greeting || greeted === undefined) greeted = now;
      // Two clocks: one that never stops, for flight; and the story's, which the greeting holds at
      // the moment they have made up and lets run on from there.
      const seconds = now - born, cycle = greeting ? 7 : (now - greeted + 7.25) % 8;
      // The opening: the logo's globe swells into the globe of water, and its ring leans back into the orbit.
      const logo = opening.logo(arrival);
      const swell = greeting ? logoGlobe + (1 - logoGlobe) * backOut((arrival - 0.04) / 0.45) : 1;
      ring.rotation.x = lean * (1 - logo);
      water.color.lerpColors(deepWater, logoWater, logo);
      water.emissive.lerpColors(deepLight, logoLight, logo);
      edgeLight.opacity = 0.6 * (1 - logo);
      logoBallSkin.opacity = smooth(logo * 1.4);
      logoBallSkin.depthWrite = logo > 0.98;
      logoBall.visible = logo > 0.005;
      logoBall.scale.setScalar(swell);
      const listening = cycle < 3 ? 1 : cycle < 3.5 ? 1 - (cycle - 3) / 0.5 : cycle > 7.5 ? (cycle - 7.5) / 0.5 : 0;
      // The globe: your voice while they fly, text as they chase, a tick as they land.
      const text = smooth((cycle - 3) / 0.5) - smooth((cycle - 5.55) / 0.3), tick = smooth((cycle - 5.55) / 0.3) - smooth((cycle - 7.5) / 0.4), wave = 1 - text - tick;
      bars.forEach((bar, index) => {
        const [asWave, asText, asTick] = strokes[index]!;
        const voice = Math.sin(seconds * 5.2 + index * 1.3) * Math.sin(seconds * 1.9 + index);
        // The lines are written one after the other, from the left; the caret waits at the end and blinks.
        const written = index < 3 ? asText![3] * (0.25 + 0.75 * smooth((cycle - 3.1 - index * 0.32) / 0.5)) : asText![3];
        const length = wave * asWave![3] * (0.55 + listening * (0.35 + 0.42 * voice)) + text * written + tick * asTick![3];
        bar.position.x = wave * asWave![0] + text * (index < 3 ? asText![0] + written / 2 : asText![0]) + tick * asTick![0];
        bar.position.y = wave * asWave![1] + text * asText![1] + tick * asTick![1];
        bar.rotation.z = wave * asWave![2] + text * asText![2] + tick * asTick![2];
        bar.scale.y = Math.max(length, 0.001) / asWave![3];
        bar.visible = length > stroke * 1.2 && !(index === 3 && text > 0.9 && Math.sin(seconds * 9) < -0.2);
      });
      const turn = THREE.MathUtils.clamp((cycle - 4) / 1.7, 0, 1);
      const whirl = turn < 0.5 ? 4 * turn ** 3 : 1 - (-2 * turn + 2) ** 3 / 2;
      // Head first is clockwise; a flyer surges and glides.
      const spin = seconds * 0.55 + 0.12 * Math.sin(seconds * 2.2) + whirl * Math.PI * 2;
      // A dart that closes the gap between a fist and the cape ahead is a bop.
      const settle = smooth((cycle - 4.2) / 1.4), bop = gap * 0.92 * degrees;
      // He draws back a little before he darts, as anything does that is about to spring.
      const darts = [bop * (smooth((cycle - 3) / 0.35) - settle - 0.3 * bell(cycle, 2.88, 0.2)), 2 * bop * (smooth((cycle - 3.42) / 0.4) - settle) - 0.3 * bop * bell(cycle, 3.34, 0.14)];
      const chase = Math.sin(turn * Math.PI);
      // In the greeting they look at you with open eyes first, and are glad a moment later.
      const cross = smooth((cycle - 3) / 0.3) - smooth((cycle - 5.4) / 0.4), fond = (smooth((cycle - 5.7) / 0.3) - smooth((cycle - 7.3) / 0.4)) * (greeting ? smooth((arrival - 0.74) / 0.1) : 1);
      const angles = heroes.map((_, index) => starts[index]! * degrees - (spin + darts[index]!));
      // The ribbons turn to water and gather where the brothers fly; each comes out of his drop.
      const emerged = opening.update(now, arrival, angles);
      heroes.forEach(({ pivot, figure, trunk, legs, arms, upright, blow, feel }, index) => {
        const beat = seconds * 7 + index * 1.9;
        pivot.rotation.z = angles[index]!;
        // He bobs, rolls a little as he goes, and stretches into the chase.
        // He forms inside his drop, already a third of his size, and grows out of it as the water
        // runs off him, a little past his size and back.
        const out = emerged[index]!, grown = 0.35 + 0.65 * backOut(out);
        pivot.visible = out > 0;
        figure.position.x = orbit + 0.035 * Math.sin(seconds * 2.1 + index * 2);
        figure.rotation.x = 0.14 * Math.sin(seconds * 1.3 + index * 2) + 0.35 * chase;
        figure.scale.set(grown * (1 + 0.07 * chase), grown * (1 - 0.04 * chase), grown);
        trunk.rotation.z = 0.05 * Math.sin(beat * 0.5);
        // The legs kick in turn, from the hip, the knee following a beat behind; harder in the chase.
        for (const { thigh, shin, side } of legs) {
          const stroke = beat + (side > 0 ? Math.PI : 0);
          thigh.rotation.set(0, Math.PI + (0.3 + 0.22 * chase) * Math.sin(stroke), side * 0.1);
          shin.rotation.y = 0.3 + 0.3 * (1 + Math.sin(stroke - 1.1));
        }
        // The arms are spread and swept back, and beat a little as wings do, the forearm trailing the
        // upper arm. To bop his brother he winds the outer arm back, then throws it forward.
        const punch = bell(cycle, index ? 3.82 : 3.35, 0.2), windUp = bell(cycle, index ? 3.58 : 3.08, 0.16), bopped = bell(cycle, index ? 3.4 : 3.86, 0.25);
        for (const { upper, fore, side } of arms) {
          const flap = 0.13 * Math.sin(beat * 0.5 + (side > 0 ? 0 : 0.5)), throwing = side > 0 ? punch : 0, winding = side > 0 ? windUp : 0;
          upper.rotation.set(0, -0.12 - 0.1 * Math.sin(beat * 0.5), side * (2.25 + flap + 0.5 * chase + 0.45 * winding - 1.75 * throwing));
          fore.rotation.z = -side * (0.45 + 0.2 * Math.sin(beat * 0.5 - 0.9) - 0.4 * throwing + 0.5 * winding);
          upper.scale.x = 1 + 0.2 * throwing;
        }
        // In the greeting he lifts his outer arm and waves at you.
        const hello = greeting ? smooth((out - 0.5) / 0.25) * (1 - smooth((arrival - 0.93) / 0.07)) : 0;
        if (hello > 0) {
          const { upper, fore, side } = arms[1]!;
          upper.rotation.y = THREE.MathUtils.lerp(upper.rotation.y, -0.85, hello);
          upper.rotation.z = THREE.MathUtils.lerp(upper.rotation.z, side * (1.35 + 0.45 * Math.sin(seconds * 12)), hello);
          fore.rotation.z = THREE.MathUtils.lerp(fore.rotation.z, -side * (0.35 + 0.45 * Math.sin(seconds * 12 + 0.8)), hello);
        }
        blow(seconds + index * 3, 1 + 1.4 * chase, bopped);
        // The head keeps looking at the viewer whatever the body does: it undoes the turns above it.
        // It nods with the flight, turns to his brother when they quarrel and when they make up,
        // and squashes when he is bopped.
        facing.copy(ring.quaternion).multiply(pivot.quaternion).multiply(figure.quaternion).invert();
        const toBrother = Math.cos(angles[1 - index]!) - Math.cos(angles[index]!);
        nod.set(0.05 * Math.sin(seconds * 1.7 + index), 0.42 * Math.max(cross, fond) * THREE.MathUtils.clamp(toBrother, -1, 1), 0.08 * Math.sin(seconds * 1.3 + index * 2.4) + 0.18 * bopped * Math.sin(cycle * 30));
        upright.quaternion.copy(facing).multiply(turned.setFromEuler(nod));
        upright.scale.set((1 + 0.1 * bopped) / (1 + 0.07 * chase), (1 - 0.1 * bopped) / (1 - 0.04 * chase), 1);
        // He blinks in his own time, and shuts his eyes tight as he is bopped.
        const blink = Math.max(bell((seconds + index * 1.7) % 4.3, 4.1, 0.09), bopped);
        feel({ open: 1 - Math.min(1, blink), cross, fond });
      });
      // Water: it wobbles as a drop does, and glows when the chase lands.
      const flare = bell(cycle, 5.7, 0.5);
      water.emissiveIntensity = 0.35 + 0.1 * listening * (1 + Math.sin(seconds * 5.2)) + flare * 0.9;
      orb.scale.set(swell * (1 + 0.018 * Math.sin(seconds * 1.7)), swell * (1 + 0.018 * Math.sin(seconds * 1.7 + 2.1)), swell);
      front.scale.setScalar(smooth((arrival - 0.6) / 0.3));
      // The heart rises with the greeting, and again whenever they make up.
      const rise = greeting ? THREE.MathUtils.clamp((arrival - 0.62) / 0.38, 0, 1) : THREE.MathUtils.clamp((cycle - 5.7) / 1.7, 0, 1);
      heart.visible = rise > 0 && rise < 1 && (greeting || now - greeted > 1);
      heart.scale.setScalar(0.24 * (smooth(rise / 0.2) + 0.25 * bell(rise, 0.2, 0.12)));
      heart.position.y = 0.35 + 0.75 * smooth(rise);
      heartSkin.opacity = 1 - smooth((rise - 0.7) / 0.3);
    },
    /** How much the opening is still the flat logo, for the caller to hold the scene face-on. */
    logo: (arrival: number) => opening.logo(arrival),
    /** The opening's logo and water, shown only while the caller prepares their shaders. */
    openingGroup: opening.group,
    dispose() {
      opening.finish();
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
  // Posed once, in calm flight, so the hero is whole before its first frame and for visitors who ask for less motion.
  greeted = -2;
  model.animate(0);
  born = greeted = undefined;
  return model;
}

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import * as THREE from "three";
import { smooth, type Eyes } from "./brothers";

/** How a brother feels, each from 0 to 1: how far his eyes are open, how cross he is, how glad, how sad. */
export type Mood = { open: number; cross: number; fond: number; sad?: number };
/** A brother's suit from his head to his cape's tip, what he wears in his brother's colour, his own light, his eyes, and whether he is the assistant with the headset. */
export type Look = { stops: [number, number][]; wears: number; glow: number; eyes: Eyes; assistant: boolean };
/** What a scene lends the workshop: it keeps the geometries and materials, so it can release them. */
export type Kit = {
  keep: <G extends THREE.BufferGeometry>(geometry: G) => G;
  material: (options: THREE.MeshPhysicalMaterialParameters) => THREE.MeshPhysicalMaterial;
  materials: THREE.Material[];
};

/**
 * Where the two brothers are made: jointed figures with drawn faces. The hero flies them round its
 * globe; the mascot's portraits pose one of them and take his picture. `ring` holds whatever is
 * made, on an orbit of radius `orbit`; the caller releases `textures` with the rest.
 */
export function figureWorkshop({ keep, material, materials }: Kit) {
  const textures: THREE.Texture[] = [];
  const shade = new THREE.Color();

  /**
   * A face as anime draws one, on a square that wraps the front of the head. What makes it sweet is
   * the child's proportions: big eyes in the lower half of the face, an eye's width apart, a tiny
   * mouth, no nose, a blush. The eyes are tall, dark at the top and bright below, under a heavy
   * upper lid with one lash, with a large highlight and a small one from the same light. The
   * features keep their places in every mood; only the eyes' and the mouth's shapes change.
   */
  function drawFace(pen: CanvasRenderingContext2D, eyes: Eyes, { open, cross, fond, sad = 0 }: Mood) {
    const full = Math.PI * 2, wide = 52, tall = 68;
    pen.clearRect(0, 0, 512, 512);
    pen.lineCap = pen.lineJoin = "round";
    pen.strokeStyle = eyes.ink;
    for (const side of [-1, 1]) {
      const x = 256 + side * 152, blush = pen.createRadialGradient(x, 348, 0, x, 348, 48);
      blush.addColorStop(0, "rgba(255, 96, 140, .6)");
      blush.addColorStop(1, "rgba(255, 96, 140, 0)");
      pen.fillStyle = blush;
      pen.beginPath(); pen.ellipse(x, 348, 48, 30, 0, 0, full); pen.fill();
    }
    for (const side of [-1, 1]) {
      pen.save();
      pen.translate(256 + side * 92, 292);
      if (fond > 0.5 || open < 0.3) {
        // Shut: an arch when he is glad, a low curve when he blinks.
        pen.lineWidth = 12;
        pen.beginPath();
        if (fond > 0.5) pen.ellipse(0, 22, wide * 0.82, tall * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9);
        else pen.ellipse(0, -14, wide * 0.82, tall * 0.4, 0, Math.PI * 0.12, Math.PI * 0.88);
        pen.stroke();
        pen.restore();
        continue;
      }
      pen.scale(1, 0.6 + 0.4 * open);
      // When he is cross the lid comes down aslant, its inner end the lower.
      const lid = (x: number) => -tall + cross * tall * (0.5 + (0.42 * -side * x) / wide);
      pen.save();
      if (cross > 0.02) {
        pen.beginPath();
        pen.moveTo(-wide - 12, lid(-wide - 12)); pen.lineTo(wide + 12, lid(wide + 12)); pen.lineTo(wide + 12, tall + 12); pen.lineTo(-wide - 12, tall + 12);
        pen.closePath(); pen.clip();
      }
      const iris = pen.createLinearGradient(0, -tall, 0, tall);
      iris.addColorStop(0, eyes.top); iris.addColorStop(0.5, eyes.middle); iris.addColorStop(1, eyes.bottom);
      pen.fillStyle = iris;
      pen.beginPath(); pen.ellipse(0, 0, wide, tall, 0, 0, full); pen.fill();
      pen.fillStyle = "rgba(8, 4, 28, .5)";
      pen.beginPath(); pen.ellipse(0, -8, wide * 0.44, tall * 0.48, 0, 0, full); pen.fill();
      const shine = pen.createRadialGradient(0, tall * 0.62, 0, 0, tall * 0.62, wide * 0.95);
      shine.addColorStop(0, eyes.glow); shine.addColorStop(1, "rgba(255, 255, 255, 0)");
      pen.fillStyle = shine;
      pen.beginPath(); pen.ellipse(0, 0, wide, tall, 0, 0, full); pen.fill();
      pen.lineWidth = 6;
      pen.beginPath(); pen.ellipse(0, 0, wide, tall, 0, 0, full); pen.stroke();
      pen.fillStyle = "#fff";
      pen.beginPath(); pen.ellipse(-wide * 0.36, -tall * 0.42, wide * 0.36, tall * 0.27, -0.35, 0, full); pen.fill();
      pen.beginPath(); pen.arc(wide * 0.38, tall * 0.4, wide * 0.16, 0, full); pen.fill();
      pen.beginPath(); pen.arc(wide * 0.1, tall * 0.62, wide * 0.07, 0, full); pen.fill();
      pen.restore();
      // The upper lid, heavy, and a lash at its outer end.
      pen.lineWidth = 13;
      pen.beginPath();
      if (cross > 0.02) { pen.moveTo(-wide - 6, lid(-wide - 6)); pen.lineTo(wide + 6, lid(wide + 6)); }
      else pen.ellipse(0, 0, wide + 3, tall + 3, 0, Math.PI * 1.06, Math.PI * 1.94);
      pen.stroke();
      const endX = side * (wide + 3) * 0.98, endY = cross > 0.02 ? lid(endX) : -(tall + 3) * 0.19;
      pen.lineWidth = 8;
      pen.beginPath(); pen.moveTo(endX, endY); pen.lineTo(endX + side * 15, endY - 15); pen.stroke();
      // A worried brow when he is sad: its inner end the higher.
      if (sad > 0.5) { pen.lineWidth = 8; pen.beginPath(); pen.moveTo(-side * wide * 0.7, -tall - 34); pen.lineTo(side * wide * 0.75, -tall - 16); pen.stroke(); }
      pen.restore();
    }
    // The mouth: a kitten's when he is content, open when he is glad, a pout when he is cross.
    pen.lineWidth = 8;
    pen.beginPath();
    if (fond > 0.5) {
      pen.moveTo(237, 366); pen.quadraticCurveTo(256, 361, 275, 366); pen.quadraticCurveTo(273, 396, 256, 396); pen.quadraticCurveTo(239, 396, 237, 366);
      pen.fillStyle = eyes.mouth; pen.fill();
    } else if (cross > 0.5 || sad > 0.5) { pen.moveTo(242, 380); pen.quadraticCurveTo(256, 364, 270, 380); }
    else { pen.moveTo(238, 368); pen.quadraticCurveTo(247, 384, 256, 370); pen.quadraticCurveTo(265, 384, 274, 368); }
    pen.stroke();
    if (sad > 0.5) {
      // A tear under one eye.
      pen.fillStyle = "#d4f2ff";
      pen.beginPath(); pen.moveTo(384, 352); pen.quadraticCurveTo(366, 384, 384, 394); pen.quadraticCurveTo(402, 384, 384, 352); pen.fill();
      pen.lineWidth = 3; pen.stroke();
    }
  }

  /** How far from the globe's centre the brothers fly, and how far their orbit leans back, so that they pass behind the globe at the top and before it at the bottom. */
  const orbit = 1.5, lean = -0.5;
  const ring = new THREE.Group();
  ring.rotation.x = lean;
  /**
   * A bone: a rounded limb that runs from its joint along the joint's own x. Turning the joint
   * swings the limb and all that hangs from its `end`.
   */
  function bone(length: number, radius: number, surface: THREE.Material) {
    const joint = new THREE.Group(), end = new THREE.Group();
    const geometry = keep(new THREE.CapsuleGeometry(radius, length, 6, 16));
    geometry.rotateZ(-Math.PI / 2);
    geometry.translate(length / 2, 0, 0);
    end.position.x = length;
    joint.add(new THREE.Mesh(geometry, surface), end);
    return { joint, end };
  }
  /**
   * One brother, as a jointed figure, seen from above his back as he flies. His frame: he flies along
   * x, away from the globe is y, toward the viewer is z; his chest is the origin. The skeleton is
   * chest, hips, two legs of thigh and shin, two arms of upper arm and forearm with a fist, and a
   * head that keeps looking at the viewer. His arms are spread and swept back, as a child's who
   * plays at flying, one hand trailing over the globe; so both hang plainly from his shoulders. His suit
   * runs from a light head to a deep cape tip; his gloves, boots and belt are his brother's colour.
   * `size` is 1 for the middle of the two; `cape` is how far round the globe his cape reaches, in degrees.
   */
  function hero(size: number, cape: number, look: Look) {
    const stops = look.stops.map(([offset, colour]) => [offset, new THREE.Color(colour)] as const);
    function suitAt(along: number) {
      const upper = stops.findIndex(([offset]) => offset >= along);
      const [low, high] = [stops[Math.max(upper - 1, 0)]!, stops[Math.max(upper, 0)]!];
      return shade.copy(low[1]).lerp(high[1], high[0] === low[0] ? 0 : (along - low[0]) / (high[0] - low[0]));
    }
    const cloth = { metalness: 0, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.3 };
    const suit = (along: number) => material({ color: suitAt(along).getHex(), ...cloth });
    const worn = material({ color: look.wears, ...cloth });
    const ball = (radius: number, surface: THREE.Material) => new THREE.Mesh(keep(new THREE.SphereGeometry(radius, 32, 24)), surface);
    const pivot = new THREE.Group(), figure = new THREE.Group();
    figure.position.x = orbit;
    figure.rotation.z = -Math.PI / 2;
    pivot.add(figure);
    ring.add(pivot);

    // The trunk: a small round body from the hips to the shoulders, and a belt.
    const body = suit(0.2), limbs = suit(0.32);
    const trunk = new THREE.Group();
    const chest = bone(0.2 * size, 0.17 * size, body);
    chest.joint.position.x = -0.27 * size;
    const belt = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.178 * size, 0.178 * size, 0.07 * size, 32)), worn);
    belt.rotation.z = Math.PI / 2;
    belt.position.x = -0.3 * size;
    trunk.add(chest.joint, belt);
    figure.add(trunk);
    // The legs trail behind, side by side, each a thigh and a shin with a boot; they kick toward the
    // viewer and away, as a swimmer's do.
    const legs = [-1, 1].map((side) => {
      const thigh = bone(0.15 * size, 0.078 * size, limbs), shin = bone(0.14 * size, 0.072 * size, limbs);
      thigh.joint.position.set(-0.33 * size, side * 0.09 * size, 0);
      thigh.end.add(shin.joint);
      const boot = ball(0.1 * size, worn);
      boot.scale.set(1.3, 1, 1);
      boot.position.x = 0.05 * size;
      shin.end.add(boot);
      trunk.add(thigh.joint);
      return { thigh: thigh.joint, shin: shin.joint, side };
    });
    // The arms, one to each side: the shoulder under the head's edge, the elbow, the fist.
    const arms = [-1, 1].map((side) => {
      const upper = bone(0.21 * size, 0.064 * size, limbs), fore = bone(0.19 * size, 0.06 * size, limbs);
      upper.joint.position.set(-0.06 * size, side * 0.15 * size, 0.02 * size);
      upper.end.add(fore.joint);
      const fist = ball(0.1 * size, worn);
      fist.position.x = 0.03 * size;
      fore.end.add(fist);
      trunk.add(upper.joint);
      return { upper: upper.joint, fore: fore.joint, fist, side };
    });

    // The cape: cloth in a grid, tied at his neck under a collar. It lies narrow over his back,
    // between the shoulders, lifts clear of his kicking legs, and past his boots it spreads and
    // streams back along the way he came. Each frame it is laid out so and a wave runs down it.
    const collar = new THREE.Mesh(keep(new THREE.TorusGeometry(0.15 * size, 0.04 * size, 12, 32)), worn);
    collar.rotation.y = Math.PI / 2;
    collar.position.x = -0.08 * size;
    trunk.add(collar);
    const along = 40, across = 4, reach = (cape * Math.PI) / 180;
    const capeGeometry = keep(new THREE.BufferGeometry());
    const spots = new Float32Array((along + 1) * (across + 1) * 3), paint = new Float32Array(spots.length), faces: number[] = [];
    for (let row = 0; row <= along; row++) {
      suitAt(0.12 + 0.88 * (row / along));
      for (let column = 0; column <= across; column++) paint.set([shade.r, shade.g, shade.b], (row * (across + 1) + column) * 3);
      if (row < along) for (let column = 0; column < across; column++) {
        const a = row * (across + 1) + column, b = a + 1, c = a + across + 1, d = c + 1;
        faces.push(a, c, b, b, c, d);
      }
    }
    capeGeometry.setAttribute("position", new THREE.BufferAttribute(spots, 3));
    capeGeometry.setAttribute("color", new THREE.BufferAttribute(paint, 3));
    capeGeometry.setIndex(faces);
    const cloak = new THREE.Mesh(capeGeometry, material({ vertexColors: true, metalness: 0, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.3, side: THREE.DoubleSide }));
    figure.add(cloak);
    /** Lay the cape out at a moment: `gust` is how hard it blows (1 in calm flight), `flick` a jolt when it is bopped. */
    function blow(seconds: number, gust: number, flick: number) {
      for (let row = 0; row <= along; row++) {
        const far = row / along, turn = far * reach, radius = orbit - 0.12 * far;
        // As wide as his neck where it is tied, broad past his boots, a point at the end, as a flame is.
        const half = size * (0.1 + 0.22 * smooth((far - 0.15) / 0.2)) * (1 - far) ** 0.75 * (0.92 + 0.08 * Math.cos(far * Math.PI * 5));
        // Over his back it rides high; behind him it sinks to the level he flies at.
        const height = size * (0.2 - 0.3 * smooth((far - 0.16) / 0.4));
        const sway = 0.05 * far * gust * Math.sin(far * 9 - seconds * 4.2) + 0.07 * flick * far * Math.sin(far * 14 - seconds * 30);
        for (let column = 0; column <= across; column++) {
          const side = (column / across) * 2 - 1, out = radius + sway + side * half;
          const billow = 0.11 * far * gust * Math.sin(far * 11 - seconds * 5.5 + side * 0.9) + 0.04 * size * (1 - side * side) * (1 - far);
          spots.set([-out * Math.sin(turn) - 0.06 * size, out * Math.cos(turn) - orbit, height + billow], (row * (across + 1) + column) * 3);
        }
      }
      capeGeometry.getAttribute("position").needsUpdate = true;
      capeGeometry.computeVertexNormals();
    }

    // The head: raised, as a flyer's is, and turned to the viewer. Not quite a ball, a little broad at the cheeks.
    const radius = 0.36 * size;
    const neck = new THREE.Group(), upright = new THREE.Group();
    neck.position.set(0.14 * size, 0, 0.13 * size);
    neck.add(upright);
    figure.add(neck);
    const skin = suit(0.05);
    const skull = new THREE.Group();
    skull.scale.set(1.06, 0.97, 0.92);
    skull.add(new THREE.Mesh(keep(new THREE.SphereGeometry(radius, 48, 36)), skin));
    // The face, drawn on a patch that wraps the front of the head.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const pen = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    const drawn = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false });
    materials.push(drawn);
    const spread = Math.PI / 3;
    skull.add(new THREE.Mesh(keep(new THREE.SphereGeometry(radius * 1.012, 48, 32, Math.PI / 2 - spread, spread * 2, Math.PI / 2 - spread, spread * 2)), drawn));
    if (look.assistant) {
      // clemii's headset: a band over the head, a cup at each ear, a microphone at his mouth.
      skull.add(new THREE.Mesh(keep(new THREE.TorusGeometry(radius * 1.03, 0.032 * size, 12, 48, Math.PI)), worn));
      for (const side of [-1, 1]) {
        const cup = ball(0.105 * size, worn);
        cup.position.set(side * radius * 1.01, 0, 0);
        cup.scale.set(0.6, 1.15, 1);
        skull.add(cup);
      }
      const onHead = (x: number, y: number, lift: number) => new THREE.Vector3(x, y, Math.sqrt(Math.max(0, radius ** 2 - x * x - y * y))).multiplyScalar(lift);
      const end = onHead(-0.2 * size, -0.25 * size, 1.14);
      const boom = new THREE.CatmullRomCurve3([new THREE.Vector3(-radius * 1.02, -0.04 * size, 0.04 * size), onHead(-0.31 * size, -0.19 * size, 1.1), end]);
      const microphone = ball(0.04 * size, worn);
      microphone.position.copy(end);
      skull.add(new THREE.Mesh(keep(new THREE.TubeGeometry(boom, 24, 0.015 * size, 8)), worn), microphone);
    } else {
      // The big brother's quiff, swept back, in his cape's colour.
      const quiff = suit(1);
      const crest = ball(1, quiff);
      crest.position.set(0.03 * size, radius * 0.97, 0.05 * size);
      crest.scale.set(0.2 * size, 0.1 * size, 0.13 * size);
      crest.rotation.z = 0.5;
      const tip = ball(1, quiff);
      tip.position.set(0.16 * size, radius * 1.1, 0.05 * size);
      tip.scale.set(0.12 * size, 0.07 * size, 0.09 * size);
      tip.rotation.z = 0.9;
      skull.add(crest, tip);
    }
    upright.add(skull);
    // His own light, in his colour: it glints on the globe as he passes.
    const aura = new THREE.PointLight(look.glow, 2.2, 2.4);
    aura.position.set(0, -0.3, 0.35);
    figure.add(aura);
    let shown = "";
    /** Show a mood on his face, redrawing only when it has changed enough to see. */
    function feel(mood: Mood) {
      const key = `${Math.round(mood.open * 8)} ${Math.round(mood.cross * 8)} ${Math.round(mood.fond * 2)} ${Math.round((mood.sad ?? 0) * 2)}`;
      if (key === shown) return;
      shown = key;
      drawFace(pen, look.eyes, mood);
      texture.needsUpdate = true;
    }
    feel({ open: 1, cross: 0, fond: 0 });
    blow(0, 1, 0);
    // How far ahead of his chest his fist reaches, in degrees round the globe.
    return { pivot, figure, trunk, legs, arms, neck, upright, cloak, blow, feel, size, lead: ((0.55 * size) / orbit) * (180 / Math.PI), cape };
  }
  return { hero, ring, orbit, textures };
}
export type Figure = ReturnType<ReturnType<typeof figureWorkshop>["hero"]>;

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The mascot's portraits: clemii, the little brother of the hero's pair, made in the same workshop as
// the hero's figures, stood up to face the viewer, posed, and photographed. The site shows the
// pictures, so the mascot is the hero's own figure without a second 3D scene on the page.
// scripts/generate-mascot.ts opens this page and saves what `window.portrait` returns.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { small } from "../../src/landing/hero/brothers";
import { figureWorkshop } from "../../src/landing/hero/figure";

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0xffffff, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(room, 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xf8fcff, 0x4a5a8a, 0.7));
const light = new THREE.DirectionalLight(0xffffff, 1.9);
light.position.set(-3, 5, 6);
scene.add(light);

const materials: THREE.Material[] = [];
const { hero, ring, orbit } = figureWorkshop({
  keep: (geometry) => geometry,
  material: (options) => { const made = new THREE.MeshPhysicalMaterial(options); materials.push(made); return made; },
  materials,
});
const clemii = hero(1, 27, { stops: [[0, 0x45c8f2], [0.3, 0x2f9fe6], [0.7, 0x3460d6], [1, 0x4a3fc0]], wears: 0xffb23a, glow: 0x59c8ff, assistant: true, eyes: small.eyes });
// He stands: his head up, his face and chest to the viewer, his cape behind him.
const stand = new THREE.Group();
ring.rotation.set(0, 0, 0);
stand.rotation.set(0, Math.PI, Math.PI);
stand.position.x = -orbit;
stand.add(ring);
scene.add(stand);
clemii.neck.position.z = -0.04;
clemii.cloak.position.z = 0.3;
// The cape was cut to follow his orbit; standing, it hangs straight down his back.
clemii.cloak.rotation.z = -0.35;
clemii.blow(0, 0, 0);
// His legs hang straight down, a little apart.
for (const { thigh, shin, side } of clemii.legs) { thigh.rotation.set(0, Math.PI, side * 0.12); shin.rotation.y = 0; }
const headHeight = 0.14;
const fists = clemii.arms.map(({ fist }) => fist);
// What the ledge hides is left out of the peeking picture, so nothing of it shows through the collage's gaps.
const lower = new Set<THREE.Object3D>();
for (const { thigh } of clemii.legs) thigh.traverse((part) => lower.add(part));
const facing = new THREE.Quaternion(), tilt = new THREE.Quaternion();

/** A pose: each arm as [how far it swings out from pointing up, how far it comes forward, how far the forearm bends], and the head's tilt. */
type Pose = { arms: [number, number, number][]; nod: [number, number, number]; mood: { open: number; cross: number; fond: number; sad?: number } };
const relaxed: [number, number, number] = [2.62, 0.15, 0.3];
const poses: Record<string, Pose & { frame: "figure" | "head" | "face"; only?: "fists" | "upper" }> = {
  // One hand at his headset, to hear better.
  listening: { frame: "figure", arms: [relaxed, [1.8, 0.35, 1.7]], nod: [0, 0, -0.1], mood: { open: 1, cross: 0, fond: 0 } },
  sad: { frame: "figure", arms: [[2.86, 0.1, 0.12], [2.86, 0.1, 0.12]], nod: [0.2, 0, 0.1], mood: { open: 0.9, cross: 0, fond: 0, sad: 1 } },
  // He looks over a ledge, a hand on it to each side; the second picture is his hands alone, to lay over the ledge.
  peeking: { frame: "head", only: "upper", arms: [[1.78, 0.45, 0], [1.78, 0.45, 0]], nod: [0, 0, -0.06], mood: { open: 1, cross: 0, fond: 0 } },
  grip: { frame: "head", only: "fists", arms: [[1.78, 0.45, 0], [1.78, 0.45, 0]], nod: [0, 0, -0.06], mood: { open: 1, cross: 0, fond: 0 } },
  portrait: { frame: "face", arms: [relaxed, relaxed], nod: [0, 0, 0], mood: { open: 1, cross: 0, fond: 0 } },
};
// The frames, as the pictures' own boxes: the whole figure and the head share a box of 200 by 190
// with the head at the same size; the face is the box's middle, 122 by 112.
const box = 1.62;
const frames = { figure: { wide: box, tall: (box * 190) / 200, y: -0.15, pixels: [800, 760] }, head: { wide: box, tall: (box * 190) / 200, y: headHeight - 0.02, pixels: [800, 760] },
  face: { wide: (box * 122) / 200, tall: (box * 112) / 200, y: headHeight + 0.02, pixels: [488, 448] } };

declare global { interface Window { portrait: (name: string) => string; portraits: string[] } }
window.portraits = Object.keys(poses);
window.portrait = (name) => {
  const pose = poses[name]!, frame = frames[pose.frame];
  clemii.arms.forEach(({ upper, fore, side }, index) => {
    const [out, forward, bend] = pose.arms[index]!;
    upper.rotation.set(0, forward, side * out);
    fore.rotation.z = -side * bend;
  });
  clemii.feel(pose.mood);
  scene.updateMatrixWorld(true);
  clemii.neck.getWorldQuaternion(facing).invert();
  clemii.upright.quaternion.copy(facing).multiply(tilt.setFromEuler(new THREE.Euler(...pose.nod)));
  clemii.figure.traverse((part) => { if (part instanceof THREE.Mesh) part.visible = pose.only === "fists" ? fists.includes(part) : !(pose.only === "upper" && (lower.has(part) || part === clemii.cloak)); });
  const camera = new THREE.OrthographicCamera(-frame.wide / 2, frame.wide / 2, frame.y + frame.tall / 2, frame.y - frame.tall / 2, 0.1, 20);
  camera.position.z = 7;
  renderer.setSize(frame.pixels[0]!, frame.pixels[1]!, false);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
};

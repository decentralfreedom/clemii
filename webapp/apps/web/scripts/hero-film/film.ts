// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The hero as a film, for places that cannot run the scene itself: the macOS app's onboarding. The
// page builds the very scene the landing page shows and draws it one frame at a time, so the film
// is the hero and not a second animation. scripts/generate-hero-film.ts opens this page and saves
// what `window.frame` returns.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createHeroScene } from "../../src/landing/hero/createHeroScene";

const size = 640;
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0xffffff, 0);
renderer.setSize(size, size, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.append(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const model = createHeroScene(pmrem.fromScene(new RoomEnvironment(), 0.04).texture as unknown as THREE.CompressedCubeTexture);

declare global { interface Window { frame: (seconds: number) => string; filmReady: boolean } }
/** The frame at a moment of the film: the three-second greeting, as the landing page plays it, then the loop. */
window.frame = (seconds) => {
  const progress = Math.min(1, seconds / 3), ease = 1 - (1 - progress) ** 4;
  model.body.rotation.set(-0.16, -0.42, -0.09 + (1 - ease) * 0.28);
  model.body.scale.setScalar(1 - (1 - ease) * 0.35 + Math.sin(progress * Math.PI) * 0.12);
  // The scene's clock starts with its first frame; an hour in keeps it clear of that start.
  model.animate(3600 + seconds, progress);
  renderer.render(model.scene, model.camera);
  return renderer.domElement.toDataURL("image/png");
};
window.frame(0);
window.filmReady = true;

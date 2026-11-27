import * as THREE from "three";
import { loadStudioEnvironment } from "./StudioEnvironment";
import { createHeroScene } from "./hero/createHeroScene";
import { startLandingEntrance } from "./entrance/landingEntrance";
import { latestEntry } from "../components/latest-entry";

// Original procedural artwork. No downloaded model or texture is required.
export async function mountClemiiScene(host: HTMLElement, signal: AbortSignal) {
  const environmentMap = await loadStudioEnvironment();
  if (signal.aborted || !host.isConnected) { environmentMap.dispose(); return null; }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "low-power" });
  if (!context) { environmentMap.dispose(); return null; }
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0xffffff, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  canvas.setAttribute("aria-hidden", "true");
  const { scene, camera, body, layers, animate, logo, openingGroup, dispose: disposeScene } = createHeroScene(environmentMap);
  let disposed = false;
  function releaseResources() {
    if (disposed) return;
    disposed = true;
    disposeScene();
    environmentMap.dispose();
    renderer.dispose();
  }
  // Prepare the final material variants before playback. Three.js polls shader
  // completion without blocking where KHR_parallel_shader_compile is available.
  // Dispose immediately on navigation, including while compilation is pending.
  signal.addEventListener("abort", releaseResources, { once: true });
  try {
    // The opening's water is compiled with the rest, so the logo does not stall as it melts.
    openingGroup.visible = true;
    await renderer.compileAsync(scene, camera);
    openingGroup.visible = false;
    if (signal.aborted || !host.isConnected || context.isContextLost()) {
      releaseResources();
      return null;
    }
  } catch (error) {
    releaseResources();
    throw error;
  } finally {
    signal.removeEventListener("abort", releaseResources);
  }

  let frame = 0;
  let visible = true;
  let ready = false;
  let targetX = -0.16, targetY = -0.42;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const entry = host.closest<HTMLElement>(".clemii-landing");
  let started: number | undefined;
  let opening = !reducedMotion.matches && !document.hidden && window.scrollY < 100 && entry?.dataset.opening === "pending";
  // A scene that arrives after the CSS fallback revealed the page (slow first
  // visits) still settles in, shorter and gentler, while it crossfades over the
  // static core. The visible text never moves again.
  let late = false;
  let renderedWidth = 0, renderedHeight = 0;
  function begin() {
    if (reducedMotion.matches || document.hidden) return;
    started = undefined;
    opening = true;
    schedule();
  }
  function finish() {
    opening = false;
    if (entry?.dataset.opening === "playing") entry.dataset.opening = "complete";
    schedule();
  }
  let tiltX = targetX, tiltY = targetY;
  // In development, ?arrival=0.4 holds the opening at that moment, to look at it frame by frame.
  const held = import.meta.env.DEV ? new URLSearchParams(location.search).get("arrival") : null;
  const scrub = held === null ? undefined : Math.min(0.999, Math.max(0, Number(held)));
  if (scrub !== undefined) opening = true;
  body.rotation.set(targetX, targetY, -0.09);
  function schedule() {
    if (!frame && visible && !document.hidden && !disposed) frame = requestAnimationFrame(render);
  }
  function render(now: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    // GPU preparation is not part of the visible three-second assembly.
    if (started === undefined) {
      started = now;
      if (opening) opening = startLandingEntrance(entry);
      const inView = host.getBoundingClientRect().top < innerHeight;
      late = !opening && !reducedMotion.matches && !document.hidden && inView;
    }
    const duration = opening ? 3000 : late ? 1400 : 0;
    const progress = scrub ?? (!duration || reducedMotion.matches ? 1 : Math.max(0, Math.min(1, (now - started) / duration)));
    // A late arrival moves at 40% of the full assembly's distance.
    const ease = 1 - Math.pow(1 - progress, 4) * (late ? 0.4 : 1);
    for (const [index, layer] of layers.entries()) {
      layer.object.position.set(layer.x + (1 - ease) * (index - 1) * 0.35,
        layer.y + (1 - ease) * (index - 1) * 1.6,
        layer.z - (1 - ease) * (2 - index) * 2.4);
    }
    tiltX += (targetX - tiltX) * (reducedMotion.matches ? 1 : 0.12);
    tiltY += (targetY - tiltY) * (reducedMotion.matches ? 1 : 0.12);
    // The opening starts as the flat logo, face-on and at its size, and turns into the scene's tilt.
    const flat = opening || late ? logo(progress) : 0;
    body.rotation.set(tiltX * (1 - flat), tiltY * (1 - flat), -0.09 * (1 - flat));
    // It opens where the flat logo stands, so the one takes over from the other in place; the logo
    // glides up into it and grows the last little way to its size as it fades in.
    const glide = opening || late ? 1 - Math.pow(1 - Math.min(1, progress / 0.17), 3) : 1;
    body.position.y = -0.32 * (1 - glide);
    body.scale.setScalar(0.92 + 0.08 * glide);
    // The mark is alive while it is on screen, and still for visitors who ask for less motion.
    const alive = !reducedMotion.matches;
    if (alive) animate(now / 1000, opening || late ? progress : 1);
    renderer.render(scene, camera);
    if (!ready) { ready = true; host.dataset.scene = "ready"; }
    if (opening && progress === 1) finish();
    if (late && progress === 1) late = false;
    if (alive || progress < 1 || Math.abs(targetX - tiltX) + Math.abs(targetY - tiltY) > 0.001) schedule();
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || (width === renderedWidth && height === renderedHeight)) return;
    renderedWidth = width;
    renderedHeight = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    schedule();
  }
  function move(event: PointerEvent) {
    if (event.pointerType !== "mouse" || reducedMotion.matches) return;
    const rect = host.getBoundingClientRect();
    targetY = -0.42 + ((event.clientX - rect.left) / rect.width - 0.5) * 0.4;
    targetX = -0.16 + ((event.clientY - rect.top) / rect.height - 0.5) * 0.2;
    schedule();
  }
  function reset() { targetX = -0.16; targetY = -0.42; if (reducedMotion.matches) finish(); schedule(); }
  function interrupt() { if (opening) finish(); }
  function visibility() {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else schedule();
  }
  function contextLost(event: Event) {
    event.preventDefault();
    host.dataset.scene = "fallback";
    cancelAnimationFrame(frame);
    frame = 0;
    visible = false;
    finish();
  }
  const resizeObserver = new ResizeObserver(resize);
  const intersectionObserver = new IntersectionObserver((entries) => {
    const entry = latestEntry(entries);
    visible = entry.isIntersecting;
    if (!visible) { cancelAnimationFrame(frame); frame = 0; }
    else schedule();
  });
  resizeObserver.observe(host);
  intersectionObserver.observe(host);
  host.append(canvas);
  host.addEventListener("pointermove", move);
  host.addEventListener("pointerleave", reset);
  canvas.addEventListener("webglcontextlost", contextLost);
  document.addEventListener("visibilitychange", visibility);
  reducedMotion.addEventListener("change", reset);
  window.addEventListener("wheel", interrupt, { passive: true });
  window.addEventListener("keydown", interrupt);
  window.addEventListener("touchstart", interrupt, { passive: true });
  window.addEventListener("pointerdown", interrupt, { passive: true });
  resize();
  if (opening) begin();
  return () => {
    releaseResources();
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerleave", reset);
    document.removeEventListener("visibilitychange", visibility);
    reducedMotion.removeEventListener("change", reset);
    window.removeEventListener("wheel", interrupt);
    window.removeEventListener("keydown", interrupt);
    window.removeEventListener("touchstart", interrupt);
    window.removeEventListener("pointerdown", interrupt);
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.remove();
    delete host.dataset.scene;
  };
}

import * as THREE from "three";
import { loadStudioEnvironment } from "./StudioEnvironment";
import { createHeroScene } from "./hero/createHeroScene";
import { latestEntry } from "../components/latest-entry";

// Original procedural artwork. No downloaded model or texture is required.
export async function mountClemiiScene(host: HTMLElement, signal: AbortSignal) {
  // User Timing marks for each step to the first frame, readable in any browser's performance tools.
  performance.mark("clemii:scene-code");
  const environmentMap = await loadStudioEnvironment();
  performance.mark("clemii:lighting");
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
  const { scene, camera, body, animate, logo, openingGroup, dispose: disposeScene } = createHeroScene(environmentMap);
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
    performance.mark("clemii:built");
    await renderer.compileAsync(scene, camera);
    openingGroup.visible = false;
    performance.mark("clemii:compiled", { detail: { programs: renderer.info.programs?.length } });
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
  // In development, ?arrival=0.4 holds the opening at that moment, to look at it frame by frame.
  const held = import.meta.env.DEV ? new URLSearchParams(location.search).get("arrival") : null;
  const scrub = held === null ? undefined : Math.min(0.999, Math.max(0, Number(held)));
  // The one rule for the opening: it plays when the scene is ready while the hero is in view at the
  // top of a visible page, for a visitor who has not asked for less motion: the 3D logo, whose first
  // frame is the flat logo, turns into the brothers at once. Otherwise the finished scene takes over.
  let opening = scrub !== undefined || (!reducedMotion.matches && !document.hidden && scrollY < 100 &&
    host.getBoundingClientRect().top < innerHeight);
  let started: number | undefined;
  let renderedWidth = 0, renderedHeight = 0;
  let tiltX = targetX, tiltY = targetY;
  body.rotation.set(targetX, targetY, -0.09);
  function schedule() {
    if (!frame && visible && !document.hidden && !disposed) frame = requestAnimationFrame(render);
  }
  function render(now: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    started ??= now;
    const progress = scrub ?? (opening ? Math.min(1, (now - started) / 3000) : 1);
    tiltX += (targetX - tiltX) * (reducedMotion.matches ? 1 : 0.12);
    tiltY += (targetY - tiltY) * (reducedMotion.matches ? 1 : 0.12);
    // The opening starts as the flat logo, face-on and at its size, and turns into the scene's tilt.
    const flat = opening ? logo(progress) : 0;
    body.rotation.set(tiltX * (1 - flat), tiltY * (1 - flat), -0.09 * (1 - flat));
    // The mark is alive while it is on screen, and still for visitors who ask for less motion.
    const alive = !reducedMotion.matches;
    if (alive) animate(now / 1000, progress);
    renderer.render(scene, camera);
    if (!ready) { ready = true; host.dataset.scene = "ready"; performance.mark("clemii:first-frame"); }
    if (opening && progress === 1) { opening = false; performance.mark("clemii:opened"); }
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
  function reset() { targetX = -0.16; targetY = -0.42; if (reducedMotion.matches) opening = false; schedule(); }
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
  resize();
  return () => {
    releaseResources();
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerleave", reset);
    document.removeEventListener("visibilitychange", visibility);
    reducedMotion.removeEventListener("change", reset);
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.remove();
    delete host.dataset.scene;
  };
}

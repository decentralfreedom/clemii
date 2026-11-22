// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import { useEffect, type RefObject } from "react";
import { canStartLandingEntrance } from "./entrance/landingEntrance";

/** Own interruption and CSS fallback; a prepared scene starts the shared timeline. */
export function useLandingEntrance(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const entry = root.current;
    if (!entry) return;
    let disposed = false;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => { if (!disposed) entry.dataset.opening = "complete"; };
    // Read the CSS fallback clock, including after delayed hydration. The scene
    // may start the choreography only while the first composition is unrevealed.
    const decide = () => {
      if (disposed) return;
      if (!canStartLandingEntrance(entry) || motion.matches ||
          scrollY >= 100 || location.hash || document.hidden) finish();
    };
    // The fallback clock lives in the landing's stylesheet. The script can run
    // before a slow stylesheet arrives (the first paint still waits for it), so
    // an absent clock then means "not yet", not "too late".
    const pending = [...document.querySelectorAll<HTMLLinkElement>('head link[rel="stylesheet"]')].filter(link => !link.sheet);
    if (pending.length) {
      void Promise.all(pending.map(link => new Promise(resolve => {
        link.addEventListener("load", resolve, { once: true });
        link.addEventListener("error", resolve, { once: true });
      }))).then(decide);
    } else decide();
    const fallbackEnd = (event: AnimationEvent) => {
      if (event.animationName === "entrance-fallback" && entry.dataset.opening === "pending") finish();
    };
    const visibility = () => { if (document.hidden) finish(); };
    const reduceMotion = () => { if (motion.matches) finish(); };
    entry.addEventListener("animationend", fallbackEnd);
    window.addEventListener("wheel", finish, { passive: true });
    window.addEventListener("keydown", finish);
    window.addEventListener("touchstart", finish, { passive: true });
    window.addEventListener("pointerdown", finish, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", reduceMotion);
    return () => {
      disposed = true;
      entry.removeEventListener("animationend", fallbackEnd);
      window.removeEventListener("wheel", finish);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("touchstart", finish);
      window.removeEventListener("pointerdown", finish);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", reduceMotion);
    };
  }, [root]);
}

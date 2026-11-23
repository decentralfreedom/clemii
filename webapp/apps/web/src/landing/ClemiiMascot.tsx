import { m } from "../paraglide/messages";
import "./mascot.css";
import listening from "../media/mascot/clemii-listening.webp";
import sad from "../media/mascot/clemii-sad.webp";
import portrait from "../media/mascot/clemii-portrait.webp";
import peeking from "../media/mascot/clemii-peeking-soft.webp";
import grip from "../media/mascot/clemii-grip-soft.webp";

export type MascotState = "listening" | "sad";

const descriptions: Record<MascotState, () => string> = {
  listening: m.mascot_listening,
  sad: m.mascot_sad,
};
const pictures: Record<MascotState, string> = { listening, sad };

/** A character in the editorial artwork, never a live microphone or app control. */
export function ClemiiMascot({ state }: { state: MascotState }) {
  return <div className={`clemii-mascot clemii-mascot-${state}`} role="img" aria-label={descriptions[state]()}>
    <ClemiiMascotArtwork state={state} />
  </div>;
}

/**
 * clemii, the little brother of the hero's pair: the hero's own 3D figure, stood up, posed and
 * photographed (scripts/generate-mascot.ts), so the page shows him without a second 3D scene.
 * `portrait` is his face alone, for avatars; `peeking` is him looking over a ledge, toned down to
 * sit in the marble collage.
 */
export function ClemiiMascotArtwork({ state, portrait: face = false, peeking: over = false }: { state: MascotState; portrait?: boolean; peeking?: boolean }) {
  const [width, height] = face ? [488, 448] : [800, 760];
  return <img className="mascot-fallback" src={face ? portrait : over ? peeking : pictures[state]} width={width} height={height} alt="" decoding="async" />;
}

/** His hands alone, in the peeking picture's own frame: laid over the artwork that hides his body. */
export function ClemiiMascotGrip() {
  return <img src={grip} width="800" height="760" alt="" decoding="async" />;
}

import {
  type ComponentProps,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import { siApple } from "simple-icons";
import {
  downloadPath,
  latestRelease,
} from "../../shared/releases";
import { ButtonLink, buttonClassName } from "./ButtonLink";
import { DownloadHandoff } from "./DownloadHandoff";
import { m } from "../paraglide/messages";
import { useBrowserValue } from "./useBrowserValue";
import { campaignOf } from "../../shared/campaign";
import { mobileUserAgent } from "../../shared/devices";

type DownloadLinkProps = Omit<
  ComponentProps<typeof ButtonLink>,
  "href" | "onClick"
> & { mobileLabel?: ReactNode };

export function DownloadLink({ mobileLabel = m.download_mobile(), ...props }: DownloadLinkProps) {
  const mobile = useBrowserValue(() => typeof navigator !== "undefined" && (
    mobileUserAgent.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ), false);
  // The page the button is on, for the blog funnel (server/analytics.ts).
  const page = useRouterState({ select: (state) => state.location.pathname });
  // The page's campaign tags travel with the download, so a newsletter's downloads count for it.
  const campaign = useBrowserValue(() => campaignOf(window.location.href), "");
  const [handoffOpen, setHandoffOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const release = latestRelease;
  if (!release) {
    return (
      <ButtonLink {...props} href="/releases">
        {m.download_coming_soon()}
      </ButtonLink>
    );
  }

  if (mobile) return <>
    <button ref={trigger} type="button" className={buttonClassName(props.variant, `${props.className ?? ""} download-mobile`)} aria-haspopup="dialog" onClick={() => setHandoffOpen(true)}><svg className="download-apple" viewBox="0 0 24 24" aria-hidden="true"><path d={siApple.path} fill="currentColor" /></svg>{mobileLabel}</button>
    {handoffOpen && <DownloadHandoff onClose={() => { setHandoffOpen(false); trigger.current?.focus({ preventScroll: true }); }} />}
  </>;

  // A plain link: the DMG comes as an attachment, so the visitor stays on the page, where Safari asks
  // "Allow downloads?". No `download` attribute: it would also save the page /download sends a phone
  // back to, when the phone taps before this script has offered the handoff.
  return (
    <ButtonLink
      {...props}
      href={downloadPath(page, campaign)}
    />
  );
}

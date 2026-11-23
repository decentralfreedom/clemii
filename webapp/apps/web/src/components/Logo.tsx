import { m } from "../paraglide/messages";
export function Logo({ href = "#top" }: { href?: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-[7px] rounded-md font-display text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4"
      aria-label={m.nav_home()}
    >
      <img src="/clemii-mark.svg" alt="" className="logo-mark" />
      <span className="logo-wordmark" aria-hidden="true">clemii</span>
      <span className="sr-only">clemii</span>
    </a>
  );
}

import Image from "next/image";

import logoMark from "@/assets/venemed-logo-mark.png";

/**
 * VeneMed brand mark — the official logo (hands cradling a medical cross, from
 * the Figma Kit de prensa; the share cards embed the same asset). The mark is
 * the one *branded* use of color (brand identity, not an action), so it is
 * exempt from the single-accent action rule. Server-renderable.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Image
      src={logoMark}
      alt=""
      aria-hidden="true"
      className={`h-9 w-auto shrink-0 ${className}`}
      priority
    />
  );
}

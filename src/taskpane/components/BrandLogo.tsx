import * as React from "react";

export const FOOTNOTE_CHECKER_LOGO_SRC = "assets/fnc-logo-160.png";

interface BrandLogoProps {
  size?: number;
  className?: string;
  decorative?: boolean;
  alt?: string;
}

export function BrandLogo({
  size = 34,
  className,
  decorative = true,
  alt = "Footnote-Checker",
}: BrandLogoProps) {
  return (
    <img
      className={className}
      src={FOOTNOTE_CHECKER_LOGO_SRC}
      width={size}
      height={size}
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      style={{ objectFit: "contain", flex: "0 0 auto" }}
    />
  );
}

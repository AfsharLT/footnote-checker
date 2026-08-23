import * as React from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SpotlightCard({ className, children, onPointerMove, ...props }: SpotlightCardProps) {
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - bounds.top}px`);
    onPointerMove?.(event);
  };

  return (
    <div
      className={cn("fc-spotlight-card", className)}
      onPointerMove={handlePointerMove}
      {...props}
    >
      {children}
    </div>
  );
}

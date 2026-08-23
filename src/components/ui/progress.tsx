import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  label: string;
}

export function Progress({ value, label, className, ...props }: ProgressProps) {
  const normalizedValue = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("fc-progress", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalizedValue}
      {...props}
    >
      <div className="fc-progress__value" style={{ width: `${normalizedValue}%` }} />
    </div>
  );
}

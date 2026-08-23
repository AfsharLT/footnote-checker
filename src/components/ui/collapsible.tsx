import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  label: React.ReactNode;
  children: React.ReactNode | (() => React.ReactNode);
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  className?: string;
  buttonClassName?: string;
  contentClassName?: string;
  ariaLabel?: string;
}

export function Collapsible({
  label,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
  buttonClassName,
  contentClassName,
  ariaLabel,
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const toggle = () => {
    const nextOpen = !open;
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const contentId = React.useId();
  return (
    <div className={className}>
      <button
        type="button"
        className={cn("fc-collapsible-trigger", buttonClassName)}
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={ariaLabel}
        onClick={toggle}
      >
        {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        {label}
      </button>
      {open && (
        <div id={contentId} className={contentClassName}>
          {typeof children === "function" ? children() : children}
        </div>
      )}
    </div>
  );
}

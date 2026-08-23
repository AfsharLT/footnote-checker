import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "fc-button inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.12)] hover:border-[var(--brand-primary-hover)] hover:bg-[var(--brand-primary-hover)]",
        solid:
          "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.12)] hover:border-[var(--brand-primary-hover)] hover:bg-[var(--brand-primary-hover)]",
        secondary:
          "border-[var(--brand-primary-border)] bg-white text-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)]",
        ghost: "border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
        destructive:
          "border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50",
        subtle: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
      },
      size: {
        sm: "min-h-8 px-2.5 py-1.5 text-xs",
        md: "min-h-10 px-3.5 py-2",
        lg: "min-h-11 px-4 py-2.5",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface NeonButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const NeonButton = React.forwardRef<HTMLButtonElement, NeonButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);

NeonButton.displayName = "NeonButton";

export { buttonVariants };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-[oklch(0.880_0.011_85)] bg-card text-foreground",
        positive:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-900",
        watch:
          "border-amber-500/40 bg-amber-500/10 text-amber-900",
        danger:
          "border-rose-500/30 bg-rose-500/10 text-rose-900",
        muted:
          "border-[oklch(0.880_0.011_85)/60] bg-[oklch(0.952_0.007_85)] text-[oklch(0.455_0.016_220)]",
        accent:
          "border-[oklch(0.555_0.155_145)/30] bg-[oklch(0.555_0.155_145)/10] text-[oklch(0.28_0.09_145)]",
        orange:
          "border-[oklch(0.670_0.172_52)/35] bg-[oklch(0.670_0.172_52)/12] text-[oklch(0.32_0.10_52)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

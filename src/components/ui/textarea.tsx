import * as React from "react";

import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-[128px] w-full rounded-2xl border border-border/70 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-[#56a45b] focus:ring-4 focus:ring-[#56a45b]/10 disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

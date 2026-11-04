import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-transparent bg-clip-padding",
    "text-sm font-semibold whitespace-nowrap select-none outline-none",
    "transition-all duration-200",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "active:not-aria-[haspopup]:translate-y-[1px] active:not-aria-[haspopup]:scale-[0.985]",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          // CheetahCost primary — vert #56a45b, bord #3f8f48, calme
          "bg-[#56a45b] text-white border-[#3f8f48]",
          "shadow-[0_1px_2px_rgba(63,143,72,0.35),inset_0_1px_0_rgba(255,255,255,0.16)]",
          "hover:bg-[#3f8f48] hover:border-[#357a3a]",
          "active:bg-[#357a3a]",
        ].join(" "),
        outline: [
          "border-black/[0.13] bg-white text-slate-700",
          "hover:bg-slate-50 hover:text-[#3f8f48] hover:border-[#56a45b]/50",
          "aria-expanded:bg-slate-50",
        ].join(" "),
        secondary: [
          "bg-[rgba(86,164,91,0.12)] text-[#2f6a37] border-[rgba(86,164,91,0.22)]",
          "hover:bg-[rgba(86,164,91,0.18)] hover:text-[#255630]",
        ].join(" "),
        orange: [
          "bg-[#f4a321] text-[#1a0e00] border-[#d97706]",
          "shadow-[0_1px_2px_rgba(217,119,6,0.35),inset_0_1px_0_rgba(255,255,255,0.20)]",
          "hover:bg-[#d97706] hover:border-[#b45309] hover:text-white",
        ].join(" "),
        ghost: [
          "hover:bg-slate-100 hover:text-slate-900",
          "aria-expanded:bg-slate-100",
        ].join(" "),
        destructive: [
          "bg-destructive/10 text-destructive hover:bg-destructive/18 hover:scale-[1.01]",
          "focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        ].join(" "),
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 text-[0.875rem] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import type { VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-layer-selected text-foreground-secondary [a]:hover:bg-border-strong",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        success:
          "border-success/30 bg-success/10 text-success focus-visible:ring-success/20 dark:bg-success/15 [a]:hover:bg-success/20",
        warning:
          "border-warning/30 bg-warning/10 text-warning focus-visible:ring-warning/20 dark:bg-warning/15 [a]:hover:bg-warning/20",
        info: "border-info/30 bg-info/10 text-info focus-visible:ring-info/20 dark:bg-info/15 [a]:hover:bg-info/20",
        outline:
          "border-border-strong text-foreground-secondary [a]:hover:bg-accent [a]:hover:text-foreground",
        property:
          "h-6 gap-1.5 border-border-strong bg-card px-2 font-normal text-foreground-secondary [a]:hover:bg-accent [&>svg]:size-3.5!",
        ghost: "hover:bg-accent hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "",
        lg: "h-6 px-2 text-13",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };

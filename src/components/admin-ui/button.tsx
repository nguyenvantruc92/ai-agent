"use client";

import { cn } from "@/lib/cn";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { buttonVariants } from "@/components/admin-ui/button-variants";
import type { VariantProps } from "class-variance-authority";

function Button({
  className,
  variant = "default",
  size = "sm",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

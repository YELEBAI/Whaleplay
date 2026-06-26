import * as React from "react";
import { cn } from "./lib/utils";

export interface SwitchButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "role"> {
  checked: boolean;
  label: string;
  size?: "default" | "sm" | "xs";
}

const trackClassBySize = {
  default: "h-6 w-11",
  sm: "h-5 w-9",
  xs: "h-4 w-7",
} satisfies Record<NonNullable<SwitchButtonProps["size"]>, string>;

const thumbClassBySize = {
  default: "h-5 w-5",
  sm: "h-4 w-4",
  xs: "h-3 w-3",
} satisfies Record<NonNullable<SwitchButtonProps["size"]>, string>;

const checkedOffsetBySize = {
  default: "translate-x-5",
  sm: "translate-x-4",
  xs: "translate-x-[14px]",
} satisfies Record<NonNullable<SwitchButtonProps["size"]>, string>;

const SwitchButton = React.forwardRef<HTMLButtonElement, SwitchButtonProps>(
  ({ checked, label, size = "default", className, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn(
          "focus-visible:ring-ring relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          trackClassBySize[size],
          checked ? "bg-primary" : "bg-muted-foreground/30",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "bg-background inline-block rounded-full shadow-sm transition-transform",
            thumbClassBySize[size],
            checked ? checkedOffsetBySize[size] : "translate-x-0.5",
          )}
        />
      </button>
    );
  },
);
SwitchButton.displayName = "SwitchButton";

export { SwitchButton };

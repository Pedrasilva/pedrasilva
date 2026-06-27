import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onKeyDown, ...props }, ref) => {
    // Enter commits the current value by blurring (which fires onBlur/onChange
    // listeners) for non-multiline numeric/text inputs. Textareas are unaffected.
    // Skips when the consumer provides its own onKeyDown that calls preventDefault.
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key !== "Enter") return;
      // Allow form submission for submit-style inputs to keep default behavior.
      if (type === "submit" || type === "button") return;
      // Date inputs already handle Enter natively; blurring is still safe.
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    };
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

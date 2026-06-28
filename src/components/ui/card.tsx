import type { ComponentProps, ReactNode } from "react";

type CardProps = ComponentProps<"div"> & { children: ReactNode };

/** White surface card — base for RequestCard, stat/step blocks. */
export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-neutral-100 bg-surface p-4 shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

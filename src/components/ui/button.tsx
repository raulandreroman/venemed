import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "ghost" | "secondary";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-on hover:bg-accent/90",
  secondary:
    "bg-primary-tint text-primary hover:bg-primary-tint/80",
  ghost:
    "bg-transparent text-accent hover:bg-accent/10",
};

const sizes: Record<Size, string> = {
  md: "h-12 px-5 text-[15px]",
  sm: "h-9 px-3 text-sm",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
};

function cls(p: CommonProps) {
  return [
    base,
    variants[p.variant ?? "primary"],
    sizes[p.size ?? "md"],
    p.fullWidth ? "w-full" : "",
    p.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = CommonProps &
  Omit<ComponentProps<"button">, "className" | "children">;
type LinkButtonProps = CommonProps &
  Omit<ComponentProps<typeof Link>, "className" | "children">;

/**
 * Button — renders a <button> by default, or a Next.js <Link> when `href` is set.
 * Server-Component friendly (no client hooks).
 */
export function Button(props: ButtonProps): ReactNode;
export function Button(props: LinkButtonProps): ReactNode;
export function Button(props: ButtonProps | LinkButtonProps) {
  if ("href" in props && props.href != null) {
    const { variant, size, fullWidth, className, children, ...rest } =
      props as LinkButtonProps;
    return (
      <Link
        className={cls({ variant, size, fullWidth, className, children })}
        {...rest}
      >
        {children}
      </Link>
    );
  }
  const { variant, size, fullWidth, className, children, ...rest } =
    props as ButtonProps;
  return (
    <button
      className={cls({ variant, size, fullWidth, className, children })}
      {...rest}
    >
      {children}
    </button>
  );
}

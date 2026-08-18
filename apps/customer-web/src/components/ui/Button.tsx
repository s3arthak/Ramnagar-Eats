import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

export function Button({ children, variant = "primary", loading, className = "", disabled, ...props }: Props) {
  return (
    <button
      className={`ui-button ui-button--${variant} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="btn-spinner" aria-hidden="true" />
      ) : null}
      {loading ? "Please wait…" : children}
    </button>
  );
}

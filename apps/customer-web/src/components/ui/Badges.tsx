import type { ReactNode } from "react";
import { Star } from "lucide-react";

export function VegBadge({ isVeg, size = 16 }: { isVeg: boolean; size?: number }) {
  return (
    <span
      className={`veg-badge ${isVeg ? "veg" : "non-veg"}`}
      style={{ width: size, height: size }}
      title={isVeg ? "Vegetarian" : "Non-vegetarian"}
      aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
    >
      <span />
    </span>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <strong className="rating">
      <Star size={13} fill="currentColor" />
      {value.toFixed(1)}
      {count !== undefined && <small>({count})</small>}
    </strong>
  );
}

/** Swiggy-style solid green rating pill: white star + bold value on green. */
export function RatingPill({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  return (
    <span className={`rating-pill ${size === "sm" ? "rating-pill--sm" : ""}`}>
      <span className="rating-pill-star" aria-hidden="true">
        <Star size={size === "sm" ? 9 : 11} fill="#fff" color="#fff" />
      </span>
      {value.toFixed(1)}
      <span className="sr-only"> rating</span>
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "offer" | "closed" | "open" | "popular" | "recommended" }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

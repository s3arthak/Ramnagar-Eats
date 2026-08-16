import { Minus, Plus } from "lucide-react";

interface Props {
  quantity: number;
  onChange: (delta: number) => void;
  size?: "sm" | "md";
}

export function QuantitySelector({ quantity, onChange, size = "md" }: Props) {
  return (
    <div className={`qty ${size === "sm" ? "qty--sm" : ""}`} aria-label={`Quantity ${quantity}`}>
      <button aria-label="Decrease quantity" onClick={() => onChange(-1)}>
        <Minus size={size === "sm" ? 12 : 14} />
      </button>
      <span>{quantity}</span>
      <button aria-label="Increase quantity" onClick={() => onChange(1)}>
        <Plus size={size === "sm" ? 12 : 14} />
      </button>
    </div>
  );
}

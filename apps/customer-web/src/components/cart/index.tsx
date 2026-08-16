import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Ticket, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import { inr } from "../../lib/format";
import type { CartItem as CartItemType } from "../../lib/cart";
import { VegBadge } from "../ui/Badges";
import { QuantitySelector } from "../ui/QuantitySelector";

export function RestaurantCartHeader({ restaurantName }: { restaurantName: string }) {
  return <p className="cart-restaurant">From {restaurantName}</p>;
}

export function CartItemRow({ item, onChangeQuantity, onRemove }: { item: CartItemType; onChangeQuantity: (delta: number) => void; onRemove: () => void }) {
  return (
    <li className="cart-item">
      <div className="cart-item-copy">
        <div className="cart-item-title">
          <VegBadge isVeg={item.isVeg} size={13} />
          <strong>{item.name}</strong>
        </div>
        {item.customizations.length > 0 && <small>{item.customizations.map((c) => c.optionName).join(", ")}</small>}
        <span className="cart-item-price">{inr(item.unitPrice * item.quantity)}</span>
      </div>
      <div className="cart-item-actions">
        <QuantitySelector quantity={item.quantity} onChange={onChangeQuantity} size="sm" />
        <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${item.name}`}>
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  );
}

export function PriceBreakdown({ subtotal, deliveryFee, discount, total }: { subtotal: number; deliveryFee: number; discount: number; total: number }) {
  return (
    <div className="price-breakdown">
      <div className="price-row">
        <span>Item total</span>
        <span>{inr(subtotal)}</span>
      </div>
      <div className="price-row">
        <span>Delivery fee</span>
        <span>{inr(deliveryFee)}</span>
      </div>
      {discount > 0 && (
        <div className="price-row price-row--discount">
          <span>Discount</span>
          <span>−{inr(discount)}</span>
        </div>
      )}
      <div className="price-row price-row--total">
        <span>To pay</span>
        <strong>{inr(total)}</strong>
      </div>
    </div>
  );
}

export function CartSummary({ subtotal, deliveryFee, discount, children }: { subtotal: number; deliveryFee: number; discount: number; children?: ReactNode }) {
  return (
    <aside className="summary-card">
      <h2>Bill details</h2>
      <PriceBreakdown subtotal={subtotal} deliveryFee={deliveryFee} discount={discount} total={Math.max(0, subtotal + deliveryFee - discount)} />
      {children}
    </aside>
  );
}

export function EmptyCart({ title = "Your cart is empty" }: { title?: string }) {
  return (
    <div className="empty-state">
      <ShoppingBag size={30} />
      <h3>{title}</h3>
      <p>Browse restaurants near you and add your favourites.</p>
      <Link className="filter" to="/restaurants">
        Browse restaurants
      </Link>
    </div>
  );
}

export interface AppliedCoupon {
  code: string;
  discountAmount: number;
}

export function CouponInput({
  restaurantId,
  subtotal,
  applied,
  onApply,
  onRemove,
  code: controlledCode,
  setCode: controlledSetCode,
}: {
  restaurantId: string;
  subtotal: number;
  applied: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon) => void;
  onRemove: () => void;
  code?: string;
  setCode?: (code: string) => void;
}) {
  const [internalCode, setInternalCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const code = controlledCode ?? internalCode;
  const setCode = controlledSetCode ?? setInternalCode;

  async function apply() {
    if (!code.trim()) return;
    setMessage("");
    setError("");
    setChecking(true);
    try {
      const result = await api.post<{ valid: boolean; message?: string; discountAmount?: number }>("/coupons/validate", {
        code: code.trim(),
        restaurantId,
        subtotal,
      });
      if (!result.valid) {
        setError(result.message ?? "This coupon is not valid");
        return;
      }
      onApply({ code: code.trim().toUpperCase(), discountAmount: result.discountAmount ?? 0 });
      setMessage(`Coupon ${code.trim().toUpperCase()} applied`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not validate coupon");
    } finally {
      setChecking(false);
    }
  }

  if (applied) {
    return (
      <div className="coupon-applied">
        <Ticket size={15} />
        <span>
          <b>{applied.code}</b> applied · you save {inr(applied.discountAmount)}
        </span>
        <button onClick={onRemove} aria-label="Remove coupon">
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="coupon-input">
      <Ticket size={15} />
      <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Have a coupon? Enter code" aria-label="Coupon code" />
      <button onClick={() => void apply()} disabled={!code.trim() || checking}>
        {checking ? "Checking…" : "Apply"}
      </button>
      {message && <p className="coupon-msg ok">{message}</p>}
      {error && <p className="coupon-msg err">{error}</p>}
    </div>
  );
}

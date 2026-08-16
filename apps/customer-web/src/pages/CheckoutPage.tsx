import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banknote, CreditCard, MapPin, ShieldCheck, Ticket } from "lucide-react";
import { useCart } from "../context/CartContext";
import { api } from "../lib/api";
import { inr } from "../lib/format";
import type { Address, Order } from "../lib/types";
import { CartItemRow, CartSummary, CouponInput, EmptyCart, type AppliedCoupon } from "../components/cart";
import { Spinner } from "../components/ui/Skeleton";

interface RackCoupon {
  code: string;
  description: string;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  minOrderValue: number;
}

export function CheckoutPage() {
  const { cart, changeQuantity, remove, subtotal, clear, deliveryFee, freeAbove } = useCart();
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [outOfRange, setOutOfRange] = useState<Record<string, boolean>>({});
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [rack, setRack] = useState<RackCoupon[]>([]);
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "MOCK">("COD");
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);

  const loadAddresses = useCallback(async () => {
    setLoadingAddresses(true);
    setError("");
    try {
      const data = await api.get<{ addresses: Address[] }>("/users/addresses");
      setAddresses(data.addresses);
      setSelectedAddressId((current) => current || data.addresses.find((address) => address.isDefault)?.id || data.addresses[0]?.id || "");
      // Hyperlocal rule, rechecked at checkout: flag addresses outside the current
      // delivery area so the user can't order to an unreachable location.
      const flags = await Promise.all(
        data.addresses.map(async (address) => {
          try {
            const result = await api.get<{ serviceable: boolean }>(
              `/locations/serviceability?lat=${address.latitude}&lng=${address.longitude}`,
            );
            return [address.id, !result.serviceable] as const;
          } catch {
            return [address.id, false] as const;
          }
        }),
      );
      setOutOfRange(Object.fromEntries(flags));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your addresses");
    } finally {
      setLoadingAddresses(false);
    }
  }, []);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    if (!cart.restaurantId) return;
    api
      .get<{ coupons: RackCoupon[] }>(`/coupons?restaurantId=${cart.restaurantId}`)
      .then((data) => setRack(data.coupons))
      .catch(() => undefined);
  }, [cart.restaurantId]);

  const selectedAddress = addresses.find((address) => address.id === selectedAddressId);
  const selectedOutOfRange = selectedAddress ? outOfRange[selectedAddress.id] : false;
  const fee = freeAbove > 0 && subtotal >= freeAbove ? 0 : deliveryFee;
  const total = useMemo(() => Math.max(0, subtotal + fee - (coupon?.discountAmount ?? 0)), [subtotal, fee, coupon]);

  if (cart.items.length === 0) {
    return (
      <div className="content page">
        <EmptyCart title="Nothing to check out" />
      </div>
    );
  }

  async function placeOrder() {
    if (!selectedAddress) return;
    if (selectedOutOfRange) {
      setError("We're not delivering to this location yet. Choose another address or update it.");
      return;
    }
    setError("");
    setPlacing(true);
    try {
      const order = await api.post<{ order: Order }>("/orders", {
        restaurantId: cart.restaurantId,
        items: cart.items.map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          customizations: item.customizations.map((customization) => ({ name: customization.name, optionName: customization.optionName })),
        })),
        addressId: selectedAddress.id,
        couponCode: coupon?.code,
        note: note.trim() || undefined,
        paymentMethod,
        idempotencyKey: crypto.randomUUID(),
      });
      clear();
      navigate(`/order/${order.order.id}/success`, { state: { order: order.order } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not place your order");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="content page checkout">
      <h1 className="page-title">Checkout</h1>
      <div className="checkout-layout">
        <div className="checkout-main">
          <section className="checkout-section">
            <div className="checkout-section-head">
              <h2>1 · Delivery address</h2>
              <Link to="/addresses">Manage addresses</Link>
            </div>
            {loadingAddresses ? (
              <Spinner label="Loading addresses…" />
            ) : addresses.length === 0 ? (
              <div className="checkout-empty-address">
                <MapPin size={22} />
                <p>You need a saved address to place an order.</p>
                <Link className="filter" to="/addresses">
                  Add an address
                </Link>
              </div>
            ) : (
              <div className="address-options">
                {addresses.map((address) => (
                  <label key={address.id} className={`address-option ${selectedAddressId === address.id ? "active" : ""} ${outOfRange[address.id] ? "out-of-range" : ""}`}>
                    <input type="radio" name="address" checked={selectedAddressId === address.id} onChange={() => setSelectedAddressId(address.id)} />
                    <span className="address-option-label">{address.label}</span>
                    <span className="address-option-copy">{address.formattedAddress}</span>
                    <small>
                      {address.pincode}
                      {address.deliveryInstructions ? ` · ${address.deliveryInstructions}` : ""}
                    </small>
                    {outOfRange[address.id] && <em className="address-out-of-range">Outside our delivery area</em>}
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="checkout-section">
            <div className="checkout-section-head">
              <h2>2 · Order summary</h2>
            </div>
            <p className="cart-restaurant">From {cart.restaurantName}</p>
            <ul className="cart-items cart-items--page">
              {cart.items.map((item) => (
                <CartItemRow key={item.key} item={item} onChangeQuantity={(delta) => changeQuantity(item.key, delta)} onRemove={() => remove(item.key)} />
              ))}
            </ul>
            <label className="order-note">
              <span>Delivery note for the restaurant (optional)</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Less spicy, extra napkins, ring twice…" maxLength={200} />
            </label>
          </section>

          <section className="checkout-section">
            <div className="checkout-section-head">
              <h2>3 · Coupon</h2>
            </div>
            <CouponInput
              restaurantId={cart.restaurantId ?? ""}
              subtotal={subtotal}
              applied={coupon}
              onApply={setCoupon}
              onRemove={() => {
                setCoupon(null);
                setCouponCode("");
              }}
              code={couponCode}
              setCode={setCouponCode}
            />
            {rack.length > 0 && !coupon && (
              <div className="coupon-rack">
                <p className="coupon-rack-title">Available for you</p>
                {rack.map((rackCoupon) => (
                  <button
                    key={rackCoupon.code}
                    type="button"
                    disabled={subtotal < rackCoupon.minOrderValue}
                    onClick={() => setCouponCode(rackCoupon.code)}
                    title={subtotal < rackCoupon.minOrderValue ? `Needs order of ${inr(rackCoupon.minOrderValue)}+` : "Click to apply"}
                  >
                    <Ticket size={14} />
                    <span>
                      <b>{rackCoupon.code}</b> {rackCoupon.description}
                      {subtotal < rackCoupon.minOrderValue && <em> · min {inr(rackCoupon.minOrderValue)}</em>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="checkout-section">
            <div className="checkout-section-head">
              <h2>4 · Payment method</h2>
            </div>
            <div className="payment-options">
              <label className={`payment-option ${paymentMethod === "COD" ? "active" : ""}`}>
                <input type="radio" name="payment" checked={paymentMethod === "COD"} onChange={() => setPaymentMethod("COD")} />
                <Banknote size={20} />
                <span>
                  <b>Cash on Delivery</b>
                  <small>Pay when your food arrives</small>
                </span>
              </label>
              <label className={`payment-option ${paymentMethod === "MOCK" ? "active" : ""}`}>
                <input type="radio" name="payment" checked={paymentMethod === "MOCK"} onChange={() => setPaymentMethod("MOCK")} />
                <CreditCard size={20} />
                <span>
                  <b>Card / UPI (test)</b>
                  <small>Mock payment for local development</small>
                </span>
              </label>
            </div>
          </section>
        </div>

        <CartSummary subtotal={subtotal} deliveryFee={fee} discount={coupon?.discountAmount ?? 0}>
          {error && (
            <p className="notice notice--error checkout-error" role="alert">
              {error}
            </p>
          )}
          <button className="confirm" disabled={!selectedAddress || placing} onClick={() => void placeOrder()}>
            {placing ? "Placing order…" : `Place order · ${inr(total)}`}
          </button>
          {!selectedAddress && <p className="summary-note">Select a delivery address to continue.</p>}
          {selectedAddress && selectedOutOfRange && (
            <p className="notice notice--error summary-note" role="alert">
              This address is outside our delivery area. Edit it from the addresses page.
            </p>
          )}
          <p className="summary-note checkout-note">
            <ShieldCheck size={13} /> Prices are re-verified by the restaurant before your order is confirmed.
          </p>
        </CartSummary>
      </div>
    </div>
  );
}

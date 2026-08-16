import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useCart } from "../context/CartContext";
import { inr } from "../lib/format";
import { CartItemRow, EmptyCart, RestaurantCartHeader } from "./cart";

export function CartDrawer() {
  const { cart, drawerOpen, setDrawerOpen, changeQuantity, remove, subtotal, itemCount, deliveryFee, freeAbove } = useCart();

  if (!drawerOpen) return null;

  return (
    <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Your cart" onClick={(event) => event.stopPropagation()}>
        <header className="cart-drawer-head">
          <h2>Your cart</h2>
          <button className="close" onClick={() => setDrawerOpen(false)} aria-label="Close cart">
            <X size={20} />
          </button>
        </header>
        {cart.items.length === 0 ? (
          <div className="cart-empty">
            <EmptyCart />
          </div>
        ) : (
          <>
            <RestaurantCartHeader restaurantName={cart.restaurantName} />
            <ul className="cart-items">
              {cart.items.map((item) => (
                <CartItemRow key={item.key} item={item} onChangeQuantity={(delta) => changeQuantity(item.key, delta)} onRemove={() => remove(item.key)} />
              ))}
            </ul>
            <footer className="cart-drawer-foot">
              {freeAbove > 0 && subtotal < freeAbove && (
                <div className="free-delivery">
                  <div className="free-delivery-copy">
                    <span>Add {inr(freeAbove - subtotal)} more for FREE delivery</span>
                  </div>
                  <div className="free-delivery-track">
                    <span style={{ width: `${Math.min(100, Math.round((subtotal / freeAbove) * 100))}%` }} />
                  </div>
                </div>
              )}
              <div className="cart-subtotal">
                <span>
                  {itemCount} item{itemCount === 1 ? "" : "s"} · delivery {subtotal >= freeAbove && freeAbove > 0 ? "FREE" : inr(deliveryFee)}
                </span>
                <strong>{inr(subtotal)}</strong>
              </div>
              <Link className="confirm" to="/cart" onClick={() => setDrawerOpen(false)}>
                View cart & checkout
              </Link>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

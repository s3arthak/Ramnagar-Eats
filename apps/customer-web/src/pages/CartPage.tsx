import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCart } from "../context/CartContext";
import { inr } from "../lib/format";
import { CartItemRow, CartSummary, EmptyCart, RestaurantCartHeader } from "../components/cart";

export function CartPage() {
  const { cart, changeQuantity, remove, subtotal, deliveryFee, freeAbove } = useCart();
  const navigate = useNavigate();

  if (cart.items.length === 0) {
    return (
      <div className="content page">
        <EmptyCart />
      </div>
    );
  }

  const fee = freeAbove > 0 && subtotal >= freeAbove ? 0 : deliveryFee;

  return (
    <div className="content page">
      <button className="back-link" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Continue browsing
      </button>
      <h1 className="page-title">Your cart</h1>
      <div className="cart-layout">
        <section className="cart-section">
          <RestaurantCartHeader restaurantName={cart.restaurantName} />
          {freeAbove > 0 && subtotal < freeAbove && (
            <div className="free-delivery free-delivery--page">
              <div className="free-delivery-copy">
                <span>Add {inr(freeAbove - subtotal)} more for FREE delivery</span>
              </div>
              <div className="free-delivery-track">
                <span style={{ width: `${Math.min(100, Math.round((subtotal / freeAbove) * 100))}%` }} />
              </div>
            </div>
          )}
          <ul className="cart-items cart-items--page">
            {cart.items.map((item) => (
              <CartItemRow key={item.key} item={item} onChangeQuantity={(delta) => changeQuantity(item.key, delta)} onRemove={() => remove(item.key)} />
            ))}
          </ul>
        </section>
        <CartSummary subtotal={subtotal} deliveryFee={fee} discount={0}>
          <button className="confirm" onClick={() => navigate("/checkout")}>
            Proceed to checkout
          </button>
          <p className="summary-note">{freeAbove > 0 && subtotal >= freeAbove ? "You've unlocked FREE delivery 🎉" : "Delivery fee and offers are confirmed at checkout."}</p>
        </CartSummary>
      </div>
    </div>
  );
}

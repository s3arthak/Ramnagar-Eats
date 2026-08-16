import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { addToCart, clearCart, EMPTY_CART, itemCount, removeItem, subtotal, updateQuantity, type Cart, type CartCustomization } from "../lib/cart";
import { api } from "../lib/api";
import { useToast } from "./ToastContext";
import type { MenuItem, Restaurant } from "../lib/types";

const STORAGE_KEY = "customer-cart";

interface PendingAdd {
  restaurant: Pick<Restaurant, "id" | "name">;
  item: MenuItem;
  customizations: CartCustomization[];
  resolve: (added: boolean) => void;
}

interface CartState {
  cart: Cart;
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  freeAbove: number;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  addItem: (restaurant: Pick<Restaurant, "id" | "name">, item: MenuItem, customizations: CartCustomization[]) => Promise<boolean>;
  changeQuantity: (key: string, delta: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartState | null>(null);

function loadCart(): Cart {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw) as Cart;
    return parsed.restaurantId ? parsed : EMPTY_CART;
  } catch {
    return EMPTY_CART;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(loadCart);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(20);
  const [freeAbove, setFreeAbove] = useState(0);
  const pendingRef = useRef<PendingAdd | null>(null);
  const { push } = useToast();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    api
      .get<{ config: { baseDeliveryFee: number; deliveryFeeFreeAbove: number } }>("/config")
      .then((data) => {
        setDeliveryFee(data.config.baseDeliveryFee);
        setFreeAbove(data.config.deliveryFeeFreeAbove);
      })
      .catch(() => undefined);
  }, []);

  const addItem = (restaurant: Pick<Restaurant, "id" | "name">, item: MenuItem, customizations: CartCustomization[]) => {
    return new Promise<boolean>((resolve) => {
      const result = addToCart(cart, restaurant, item, customizations);
      if (!result.conflict) {
        setCart(result.cart);
        push("Added to cart", { body: item.name, tone: "success" });
        resolve(true);
        return;
      }
      const pending = { restaurant, item, customizations, resolve };
      pendingRef.current = pending;
      setPendingAdd(pending);
    });
  };

  const confirmReplace = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    const result = addToCart(clearCart(), pending.restaurant, pending.item, pending.customizations);
    setCart(result.cart);
    push("Cart replaced", { body: `Now ordering from ${pending.restaurant.name}`, tone: "info" });
    pending.resolve(true);
    pendingRef.current = null;
    setPendingAdd(null);
  };

  const cancelReplace = () => {
    pendingRef.current?.resolve(false);
    pendingRef.current = null;
    setPendingAdd(null);
  };

  const changeQuantity = (key: string, delta: number) => setCart((current) => updateQuantity(current, key, delta));
  const remove = (key: string) => setCart((current) => removeItem(current, key));
  const clear = () => setCart(clearCart());

  return (
    <CartContext.Provider
      value={{
        cart,
        itemCount: itemCount(cart),
        subtotal: subtotal(cart),
        deliveryFee,
        freeAbove,
        drawerOpen,
        setDrawerOpen,
        addItem,
        changeQuantity,
        remove,
        clear,
      }}
    >
      {children}
      {pendingAdd && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Replace cart">
          <section className="location-sheet confirm-sheet">
            <h2>Replace your cart?</h2>
            <p className="sheet-copy">
              Your cart contains items from <strong>{cart.restaurantName}</strong>. Would you like to clear it and add items from{" "}
              <strong>{pendingAdd.restaurant.name}</strong> instead?
            </p>
            <div className="confirm-actions">
              <button className="confirm" onClick={confirmReplace}>
                Yes, start fresh
              </button>
              <button className="gps cancel-replace" onClick={cancelReplace}>
                Keep my cart
              </button>
            </div>
          </section>
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCart(): CartState {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}

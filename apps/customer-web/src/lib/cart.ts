import type { MenuItem, Restaurant } from "./types";

export interface CartCustomization {
  name: string;
  optionName: string;
  price: number;
}

export interface CartItem {
  key: string;
  itemId: string;
  name: string;
  basePrice: number;
  unitPrice: number; // base + customizations
  quantity: number;
  isVeg: boolean;
  customizations: CartCustomization[];
}

export interface Cart {
  restaurantId: string | null;
  restaurantName: string;
  items: CartItem[];
}

export const EMPTY_CART: Cart = { restaurantId: null, restaurantName: "", items: [] };

export function lineKey(itemId: string, customizations: CartCustomization[]): string {
  return `${itemId}::${customizations.map((c) => `${c.name}:${c.optionName}`).sort().join("|")}`;
}

export function unitPrice(item: MenuItem, customizations: CartCustomization[]): number {
  return item.price + customizations.reduce((sum, c) => sum + c.price, 0);
}

export function itemCount(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function subtotal(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

/** Add an item. Returns conflict=true when the cart belongs to another restaurant. */
export function addToCart(cart: Cart, restaurant: Pick<Restaurant, "id" | "name">, item: MenuItem, customizations: CartCustomization[]): { cart: Cart; conflict: boolean } {
  if (cart.restaurantId && cart.restaurantId !== restaurant.id) {
    return { cart, conflict: true };
  }
  const key = lineKey(item.id, customizations);
  const existing = cart.items.find((entry) => entry.key === key);
  const price = unitPrice(item, customizations);
  const next: Cart = {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    items: existing
      ? cart.items.map((entry) => (entry.key === key ? { ...entry, quantity: entry.quantity + 1 } : entry))
      : [...cart.items, { key, itemId: item.id, name: item.name, basePrice: item.price, unitPrice: price, quantity: 1, isVeg: item.isVeg, customizations }],
  };
  return { cart: next, conflict: false };
}

export function updateQuantity(cart: Cart, key: string, delta: number): Cart {
  return {
    ...cart,
    items: cart.items
      .map((entry) => (entry.key === key ? { ...entry, quantity: Math.max(0, entry.quantity + delta) } : entry))
      .filter((entry) => entry.quantity > 0),
  };
}

export function removeItem(cart: Cart, key: string): Cart {
  return { ...cart, items: cart.items.filter((entry) => entry.key !== key) };
}

export function clearCart(): Cart {
  return EMPTY_CART;
}

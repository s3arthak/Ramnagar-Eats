export type UserRole = "CUSTOMER" | "RESTAURANT" | "ADMIN";

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: UserRole;
}

export interface RestaurantProfile {
  id: string;
  name: string;
  description: string;
  phone: string;
  address: string;
  cuisines: string[];
  isOpen: boolean;
  isAcceptingOrders: boolean;
  openingTime: string;
  closingTime: string;
  isPureVeg: boolean;
  priceForTwo: number;
  minOrder: number;
  deliveryTimeMin: number;
  deliveryTimeMax: number;
  logo?: string;
  coverImage?: string;
  offers: { title: string; description: string }[];
  location: { lat: number; lng: number } | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  isVeg: boolean;
  isAvailable: boolean;
  isPopular: boolean;
  isRecommended: boolean;
  prepTime: number;
  customizations: { name: string; required: boolean; options: { name: string; price: number }[] }[];
}

export type OrderStatus = "PLACED" | "CONFIRMED" | "PREPARING" | "READY" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  items: { itemId: string; name: string; price: number; quantity: number; customizations: { name: string; optionName: string; price: number }[] }[];
  deliveryAddress: { label: string; formattedAddress: string; pincode: string };
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: "COD" | "MOCK";
  paymentStatus: "PENDING" | "PAID";
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string }[];
  estimatedDeliveryAt?: string;
  createdAt: string;
}

export interface DashboardData {
  restaurant: { id: string; name: string; isOpen: boolean; isAcceptingOrders: boolean };
  stats: { todayOrders: number; pendingOrders: number; activeOrders: number; readyOrders: number; todayRevenue: number; totalOrders: number };
  recentOrders: Order[];
}

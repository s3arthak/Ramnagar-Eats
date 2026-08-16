export type RestaurantAvailabilityStatus = "OPEN" | "CLOSED" | "OPENING_SOON" | "CLOSING_SOON" | "NOT_ACCEPTING" | "TEMPORARILY_UNAVAILABLE";

export interface RestaurantAvailability {
  status: RestaurantAvailabilityStatus;
  canOrder: boolean;
  label: string;
  opensAt?: string;
  closesAt?: string;
}

export type UserRole = "CUSTOMER" | "RESTAURANT" | "ADMIN";

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: UserRole;
  avatar?: string;
}

export interface RestaurantOffer {
  title: string;
  description: string;
}

export interface Restaurant {
  id: string;
  name: string;
  description: string;
  address: string;
  logo?: string;
  coverImage?: string;
  cuisines: string[];
  isOpen: boolean;
  isPureVeg: boolean;
  isAcceptingOrders?: boolean;
  openingTime?: string;
  closingTime?: string;
  availability: RestaurantAvailability;
  rating: number;
  ratingCount: number;
  deliveryTimeMin: number;
  deliveryTimeMax: number;
  priceForTwo: number;
  minOrder: number;
  offers: RestaurantOffer[];
  distanceKm?: number;
}

export interface CustomizationOption {
  name: string;
  price: number;
}

export interface CustomizationGroup {
  name: string;
  required: boolean;
  options: CustomizationOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  isVeg: boolean;
  isAvailable: boolean;
  isPopular: boolean;
  isRecommended?: boolean;
  prepTime?: number;
  customizations: CustomizationGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

export interface CuisineCategory {
  id: string;
  name: string;
  slug: string;
  emoji: string;
}

export interface Address {
  id: string;
  label: "Home" | "Work" | "Other";
  formattedAddress: string;
  pincode: string;
  city?: string;
  state?: string;
  locality?: string;
  latitude: number;
  longitude: number;
  deliveryInstructions?: string;
  isDefault: boolean;
}

export type OrderStatus = "PLACED" | "CONFIRMED" | "PREPARING" | "READY" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  customizations: { name: string; optionName: string; price: number }[];
}

export interface Order {
  id: string;
  orderNumber: string;
  restaurantId: string;
  restaurantName: string;
  items: OrderItem[];
  deliveryAddress: { label: string; formattedAddress: string; pincode: string };
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: "COD" | "MOCK";
  paymentStatus: "PENDING" | "PAID";
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string }[];
  couponCode?: string;
  estimatedDeliveryAt?: string;
  createdAt: string;
}

export interface Place {
  lat: number;
  lng: number;
  label: string;
  pincode: string;
}

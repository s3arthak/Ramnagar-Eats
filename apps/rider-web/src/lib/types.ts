export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: "RIDER";
  avatar?: string;
  riderStatus: "OFFLINE" | "ONLINE" | "BUSY" | "SUSPENDED";
  riderApproval: "PENDING" | "APPROVED" | "REJECTED";
  vehicleType?: string;
  vehicleNumber?: string;
  deliveryArea?: string;
  todayDeliveries: number;
  todayEarnings: number;
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  customizations?: { name: string; optionName: string; price: number }[];
}

export interface DeliveryAddress {
  label?: string;
  formattedAddress?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  polyline: [number, number][}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  restaurantId: string;
  restaurantName: string;
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  riderId?: string;
  deliveryVerified?: boolean;
  estimatedDeliveryAt?: string;
  createdAt: string;
}

export type OrderStatus =
  | "PLACED" | "CONFIRMED" | "PREPARING" | "READY"
  | "RIDER_ASSIGNED" | "RIDER_ACCEPTED" | "PICKED_UP"
  | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "DELIVERY_FAILED";

export interface ActiveDelivery {
  order: (Order & {
    restaurantLocation?: { lat: number; lng: number };
    restaurantPhone?: string;
    route?: RouteResult;
  }) | null;
}

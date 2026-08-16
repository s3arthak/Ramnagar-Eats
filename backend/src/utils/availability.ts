export type RestaurantAvailabilityStatus = "OPEN" | "CLOSED" | "OPENING_SOON" | "CLOSING_SOON" | "NOT_ACCEPTING" | "TEMPORARILY_UNAVAILABLE";

export interface Availability {
  status: RestaurantAvailabilityStatus;
  canOrder: boolean;
  label: string;
  opensAt?: string;
  closesAt?: string;
}

const minutesOfDay = (value: string): number => {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * 60 + (minutes ?? 0);
};

const within = (now: number, start: number, end: number) => (start <= end ? now >= start && now < end : now >= start || now < end);

const labelFor = (status: RestaurantAvailabilityStatus, opensAt?: string, closesAt?: string): string => {
  switch (status) {
    case "OPEN":
      return closesAt ? `Open · closes ${closesAt}` : "Open";
    case "CLOSED":
      return opensAt ? `Closed · opens ${opensAt}` : "Currently closed";
    case "OPENING_SOON":
      return opensAt ? `Opening soon · ${opensAt}` : "Opening soon";
    case "CLOSING_SOON":
      return closesAt ? `Closing soon · ${closesAt}` : "Closing soon";
    case "NOT_ACCEPTING":
      return "Not accepting orders";
    case "TEMPORARILY_UNAVAILABLE":
      return "Temporarily unavailable";
  }
};

/**
 * Derive a restaurant's live availability from its admin state, owner toggles and
 * operating hours. The backend is the authority — order creation re-runs this.
 */
export function restaurantAvailability(restaurant: any, now = new Date()): Availability {
  if (!restaurant.isActive) {
    return { status: "TEMPORARILY_UNAVAILABLE", canOrder: false, label: labelFor("TEMPORARILY_UNAVAILABLE") };
  }
  if (!restaurant.isOpen) {
    return { status: "CLOSED", canOrder: false, label: labelFor("CLOSED", restaurant.openingTime, restaurant.closingTime) };
  }
  if (restaurant.isAcceptingOrders === false) {
    return { status: "NOT_ACCEPTING", canOrder: false, label: labelFor("NOT_ACCEPTING") };
  }

  const opensAt = restaurant.openingTime || undefined;
  const closesAt = restaurant.closingTime || undefined;

  // No hours configured → open whenever the owner says so.
  if (!opensAt || !closesAt) {
    return { status: "OPEN", canOrder: true, label: labelFor("OPEN", opensAt, closesAt) };
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = minutesOfDay(opensAt);
  const closeMin = minutesOfDay(closesAt);

  if (within(nowMin, openMin, closeMin)) {
    const closesIn = closeMin >= openMin ? closeMin - nowMin : closeMin + (1440 - nowMin);
    if (closesIn <= 30) {
      return { status: "CLOSING_SOON", canOrder: true, label: labelFor("CLOSING_SOON", opensAt, closesAt) };
    }
    return { status: "OPEN", canOrder: true, label: labelFor("OPEN", opensAt, closesAt) };
  }

  // Opening soon: within 30 minutes before opening.
  const minutesUntilOpen = openMin >= nowMin ? openMin - nowMin : openMin + (1440 - nowMin);
  if (minutesUntilOpen <= 30) {
    return { status: "OPENING_SOON", canOrder: false, label: labelFor("OPENING_SOON", opensAt, closesAt) };
  }

  return { status: "CLOSED", canOrder: false, label: labelFor("CLOSED", opensAt, closesAt) };
}

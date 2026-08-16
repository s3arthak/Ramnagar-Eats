import { useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, MapPin, Menu } from "lucide-react";
import type { Restaurant } from "../../lib/types";
import { deliveryTime, distanceKm, inr } from "../../lib/format";
import { Rating, VegBadge } from "./Badges";
import { MenuPreviewDrawer } from "../MenuPreviewDrawer";

const CUISINE_EMOJI: Record<string, string> = {
  Biryani: "🍛", Pizza: "🍕", Burgers: "🍔", "North Indian": "🍛", Chinese: "🥡", Healthy: "🥗", Desserts: "🍰",
  Cafe: "☕", "South Indian": "🥞", Mexican: "🌮", Thai: "🍜", Mughlai: "🍢", Italian: "🍝", American: "🍟",
};

function foodEmoji(restaurant: Restaurant): string {
  for (const cuisine of restaurant.cuisines) {
    if (CUISINE_EMOJI[cuisine]) return CUISINE_EMOJI[cuisine];
  }
  return "🍽️";
}

function statusLabel(restaurant: Restaurant): { text: string; tone: string } {
  const availability = restaurant.availability;
  if (!availability) return restaurant.isOpen ? { text: "OPEN", tone: "open" } : { text: "CLOSED", tone: "closed" };
  switch (availability.status) {
    case "OPEN":
      return { text: "OPEN", tone: "open" };
    case "CLOSING_SOON":
      return { text: "CLOSING SOON", tone: "closing" };
    case "OPENING_SOON":
      return { text: "OPENING SOON", tone: "opening" };
    case "NOT_ACCEPTING":
      return { text: "NOT ACCEPTING", tone: "closed" };
    default:
      return { text: "CLOSED", tone: "closed" };
  }
}

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const emoji = foodEmoji(restaurant);
  const [imageFailed, setImageFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const status = statusLabel(restaurant);
  const fastDelivery = restaurant.deliveryTimeMax <= 25;

  return (
    <article className={`restaurant-card ${status.tone === "closed" ? "restaurant-card--closed" : ""}`}>
      <Link to={`/restaurant/${restaurant.id}`} className="restaurant-link">
        <div className="food-image">
          {restaurant.coverImage && !imageFailed ? <img src={restaurant.coverImage} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : <b className="food-emoji">{emoji}</b>}
          <span className={`open ${status.tone}`}>{status.text}</span>
          {restaurant.offers[0] && <span className="offer-tag">🏷 {restaurant.offers[0].title}</span>}
        </div>
        <div className="restaurant-copy">
          <div className="restaurant-title-row">
            <h3>{restaurant.name}</h3>
            {restaurant.isPureVeg && <VegBadge isVeg size={14} />}
          </div>
          <div className="restaurant-meta">
            <Rating value={restaurant.rating} count={restaurant.ratingCount} />
            <p>{restaurant.cuisines.join(" · ") || "Local favourites"}</p>
          </div>
          <small>
            <span className={fastDelivery ? "fast-delivery" : ""}>
              <Clock3 size={13} /> {deliveryTime(restaurant.deliveryTimeMin, restaurant.deliveryTimeMax)}
              {fastDelivery && <em> ⚡ Fast</em>}
            </span>
            <span>{inr(restaurant.priceForTwo)} for two</span>
            {restaurant.distanceKm !== undefined && (
              <span>
                <MapPin size={13} /> {distanceKm(restaurant.distanceKm)}
              </span>
            )}
          </small>
        </div>
      </Link>
      <button
        className="card-menu-btn"
        onClick={() => setPreviewOpen(true)}
        aria-label={`Preview menu of ${restaurant.name}`}
        title="Preview menu"
      >
        <Menu size={15} /> <span>Menu</span>
      </button>
      {previewOpen && <MenuPreviewDrawer restaurantId={restaurant.id} onClose={() => setPreviewOpen(false)} />}
    </article>
  );
}

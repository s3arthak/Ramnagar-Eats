import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock3, MapPin, Search, ShoppingBag, Wallet } from "lucide-react";
import { api } from "../lib/api";
import type { MenuCategory, Restaurant } from "../lib/types";
import { useCart } from "../context/CartContext";
import { useLocation } from "../context/LocationContext";
import { deliveryTime, distanceKm, inr } from "../lib/format";
import { MenuItemCard } from "../components/ui/MenuItemCard";
import { Rating, VegBadge } from "../components/ui/Badges";
import { Spinner } from "../components/ui/Skeleton";
import { ErrorState } from "../components/ui/StateViews";

/** Veg / Non-Veg / All filter tabs — filtering is dynamic over the DB menu. */
type FoodFilter = "ALL" | "VEG" | "NON_VEG";

interface MenuResponse {
  restaurant: Restaurant;
  categories: MenuCategory[];
}

export function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const { place } = useLocation();
  const { cart, addItem, changeQuantity, itemCount, subtotal, setDrawerOpen } = useCart();
  const [data, setData] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [foodFilter, setFoodFilter] = useState<FoodFilter>("ALL");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const categoryRefs = useRef(new Map<string, HTMLElement>());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const suffix = place ? `?lat=${place.lat}&lng=${place.lng}` : "";
      const menu = await api.get<MenuResponse>(`/restaurants/${id}/menu${suffix}`);
      setData(menu);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this restaurant");
    } finally {
      setLoading(false);
    }
  }, [id, place]);

  useEffect(() => {
    void load();
  }, [load]);

  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart.items) {
      map.set(item.itemId, (map.get(item.itemId) ?? 0) + item.quantity);
    }
    return map;
  }, [cart.items]);

  const filteredCategories = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toLowerCase();
    return data.categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          if (foodFilter === "VEG" && !item.isVeg) return false;
          if (foodFilter === "NON_VEG" && item.isVeg) return false;
          if (!term) return true;
          return item.name.toLowerCase().includes(term) || item.description.toLowerCase().includes(term);
        }),
      }))
      .filter((category) => category.items.length > 0);
  }, [data, query, foodFilter]);

  // Category chips (only shown while searching/filtering so they don't fight the scroll nav).
  const showChips = Boolean(query.trim() || foodFilter !== "ALL");
  const chipCategories = useMemo(() => {
    if (!showChips || !data) return [];
    const unique = new Map<string, { id: string; name: string }>();
    for (const category of data.categories) unique.set(category.id, { id: category.id, name: category.name });
    return [...unique.values()];
  }, [showChips, data]);

  function scrollToCategory(categoryId: string) {
    setActiveCategory(categoryId);
    categoryRefs.current.get(categoryId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const activeFilters = Boolean(query.trim()) || foodFilter !== "ALL" || activeCategory !== null;
  const noResults = filteredCategories.length === 0;
  const anyFilteredOut = activeFilters && !noResults;

  if (loading) {
    return (
      <div className="content">
        <Spinner label="Loading restaurant…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="content">
        <ErrorState message={error || "Restaurant not found"} onRetry={() => void load()} />
      </div>
    );
  }

  const { restaurant } = data;
  const emoji = restaurant.cuisines[0] ?? "🍽️";
  const availability = restaurant.availability ?? { status: restaurant.isOpen ? "OPEN" : "CLOSED", canOrder: restaurant.isOpen, label: restaurant.isOpen ? "Open" : "Closed" };
  const closed = !availability.canOrder;
  const availabilityTone = availability.status === "OPEN" || availability.status === "CLOSING_SOON" ? "open" : "closed";

  return (
    <div className="restaurant-page">
      <Link to="/restaurants" className="back-link">
        <ArrowLeft size={16} /> Back to restaurants
      </Link>
      <section className="restaurant-hero">
        <div className="restaurant-cover">
          <span className="cover-emoji">{emoji}</span>
          {restaurant.isPureVeg && <span className="pure-veg-tag">PURE VEG</span>}
          {closed && <span className="closed-cover">TEMPORARILY CLOSED</span>}
        </div>
        <div className="restaurant-header">
          <div className="restaurant-header-copy">
            <h1>{restaurant.name}</h1>
            <div className="restaurant-header-meta">
              <Rating value={restaurant.rating} count={restaurant.ratingCount} />
              <span className="dot">·</span>
              <span>{restaurant.cuisines.join(", ")}</span>
              {restaurant.isPureVeg && <VegBadge isVeg />}
            </div>
            <p className="restaurant-address">
              <MapPin size={13} /> {restaurant.address || "Local neighbourhood"} {restaurant.distanceKm !== undefined && `· ${distanceKm(restaurant.distanceKm)} away`}
            </p>
            <div className="restaurant-facts">
              <span>
                <Clock3 size={15} /> {deliveryTime(restaurant.deliveryTimeMin, restaurant.deliveryTimeMax)}
              </span>
              <span>
                <Wallet size={15} /> {inr(restaurant.priceForTwo)} for two
              </span>
              {restaurant.minOrder > 0 && <span>Min order {inr(restaurant.minOrder)}</span>}
            </div>
          </div>
          <div className={`restaurant-status ${availabilityTone}`}>
            {availability.status === "OPEN" ? "🟢 Open" : availability.status === "CLOSING_SOON" ? "🟡 Closing soon" : availability.status === "OPENING_SOON" ? "🟠 Opening soon" : availability.status === "NOT_ACCEPTING" ? "⏸ Not accepting orders" : "🔴 Closed"}
          </div>
        </div>
        {restaurant.offers.length > 0 && (
          <div className="offer-strip">
            {restaurant.offers.map((offer) => (
              <span key={offer.title}>
                🏷 <b>{offer.title}</b> {offer.description}
              </span>
            ))}
          </div>
        )}
      </section>

      {closed && (
        <div className="notice notice--closed" role="status">
          {availability.status === "OPENING_SOON" ? `Opening soon${availability.opensAt ? ` at ${availability.opensAt}` : ""}. You can browse the menu now.` : availability.status === "NOT_ACCEPTING" ? "This restaurant is not accepting orders right now. You can still browse the menu." : "This restaurant is currently closed. You can browse the menu, but orders can't be placed right now."}
        </div>
      )}

      <div className="menu-toolbar">
        <div className="menu-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dishes in this restaurant…" aria-label="Search dishes" />
        </div>
        <div className="food-filter" role="group" aria-label="Filter by food type">
          <button className={foodFilter === "ALL" ? "active" : ""} onClick={() => setFoodFilter("ALL")}>
            All
          </button>
          <button className={foodFilter === "VEG" ? "active veg" : "veg"} onClick={() => setFoodFilter("VEG")}>
            🥬 Veg
          </button>
          <button className={foodFilter === "NON_VEG" ? "active nonveg" : "nonveg"} onClick={() => setFoodFilter("NON_VEG")}>
            🍗 Non-Veg
          </button>
        </div>
      </div>

      {showChips && chipCategories.length > 0 && (
        <nav className="category-chips" aria-label="Filter by category">
          <button className={activeCategory === null ? "active" : ""} onClick={() => setActiveCategory(null)}>
            All categories
          </button>
          {chipCategories.map((category) => (
            <button key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}>
              {category.name}
            </button>
          ))}
        </nav>
      )}

      {!showChips && filteredCategories.length > 1 && (
        <nav className="category-nav" aria-label="Menu categories">
          {filteredCategories.map((category) => (
            <button key={category.id} onClick={() => scrollToCategory(category.id)}>
              {category.name}
            </button>
          ))}
        </nav>
      )}

      <div className="menu-sections">
        {noResults ? (
          <div className="empty-state menu-empty">
            <p>No dishes found.</p>
            <p className="empty-copy">Try changing your search or filters.</p>
            {(query || foodFilter !== "ALL" || activeCategory) && (
              <button
                className="filter"
                onClick={() => {
                  setQuery("");
                  setFoodFilter("ALL");
                  setActiveCategory(null);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredCategories
            .filter((category) => (activeCategory ? category.id === activeCategory : true))
            .map((category) => (
              <section key={category.id} className="menu-category" ref={(element) => { if (element) categoryRefs.current.set(category.id, element); }}>
                <h2>{category.name}</h2>
                <div className="menu-list">
                  {category.items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      disabled={closed}
                      quantity={quantities.get(item.id) ?? 0}
                      onChangeQuantity={(delta) => {
                        const key = cart.items.find((entry) => entry.itemId === item.id)?.key;
                        if (key) changeQuantity(key, delta);
                      }}
                      onAdd={(customizations) => addItem({ id: restaurant.id, name: restaurant.name }, item, customizations).then((added) => added)}
                    />
                  ))}
                </div>
              </section>
            ))
        )}
      </div>
      {anyFilteredOut && <p className="empty-inline">Some dishes are hidden by your filters.</p>}

      {itemCount > 0 && (
        <div className="cart-bar" role="region" aria-label="Cart summary">
          <button onClick={() => setDrawerOpen(true)}>
            <span className="cart-bar-count">{itemCount}</span>
            <span className="cart-bar-label">
              View cart · <b>{inr(subtotal)}</b>
            </span>
            <ShoppingBag size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

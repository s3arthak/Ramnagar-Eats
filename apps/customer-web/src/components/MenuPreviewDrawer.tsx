import { useEffect, useMemo, useState } from "react";
import { Link, X } from "lucide-react";
import { api } from "../lib/api";
import type { MenuCategory, Restaurant } from "../lib/types";
import { inr } from "../lib/format";
import { VegBadge } from "./ui/Badges";
import { Spinner } from "./ui/Skeleton";
import { ErrorState } from "./ui/StateViews";

interface MenuResponse {
  restaurant: Restaurant;
  categories: MenuCategory[];
}

type FoodFilter = "ALL" | "VEG" | "NON_VEG";

/**
 * Quick menu preview opened from a restaurant card. Bottom sheet on mobile,
 * side drawer on desktop. Includes a compact filter panel (category + food type).
 */
export function MenuPreviewDrawer({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const [data, setData] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [foodFilter, setFoodFilter] = useState<FoodFilter>("ALL");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const menu = await api.get<MenuResponse>(`/restaurants/${restaurantId}/menu`);
      setData(menu);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this menu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visibleItems = useMemo(() => {
    if (!data) return 0;
    return data.categories.reduce(
      (sum, category) =>
        sum +
        category.items.filter((item) => {
          if (selectedCategories.size > 0 && !selectedCategories.has(category.id)) return false;
          if (foodFilter === "VEG" && !item.isVeg) return false;
          if (foodFilter === "NON_VEG" && item.isVeg) return false;
          return true;
        }).length,
      0,
    );
  }, [data, selectedCategories, foodFilter]);

  const hasFilters = selectedCategories.size > 0 || foodFilter !== "ALL";
  const clearFilters = () => {
    setSelectedCategories(new Set());
    setFoodFilter("ALL");
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overlay menu-preview-overlay" role="dialog" aria-modal="true" aria-label="Menu preview">
      <section className="menu-preview">
        <button className="close" onClick={onClose} aria-label="Close menu preview">
          <X size={20} />
        </button>

        <div className="menu-preview-head">
          <p className="eyebrow">QUICK MENU</p>
          <h2>{data?.restaurant.name ?? "Menu"}</h2>
          <p className="menu-preview-link">
            <Link to={`/restaurant/${restaurantId}`} onClick={onClose}>
              Open full restaurant page →
            </Link>
          </p>
        </div>

        {loading ? (
          <Spinner label="Loading menu…" />
        ) : error || !data ? (
          <ErrorState message={error || "Menu unavailable"} onRetry={() => void load()} />
        ) : (
          <>
            <div className="menu-preview-filters">
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
              <div className="menu-preview-cats">
                {data.categories.map((category) => (
                  <label key={category.id} className={`chip-check ${selectedCategories.has(category.id) ? "checked" : ""}`}>
                    <input type="checkbox" checked={selectedCategories.has(category.id)} onChange={() => toggleCategory(category.id)} />
                    <span>{category.name}</span>
                  </label>
                ))}
              </div>
              {hasFilters && (
                <button className="filter menu-preview-clear" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>

            {visibleItems === 0 ? (
              <div className="empty-state menu-empty">
                <p>No dishes match your filters.</p>
                <button className="filter" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="menu-preview-list">
                {data.categories
                  .filter((category) => selectedCategories.size === 0 || selectedCategories.has(category.id))
                  .map((category) => {
                    const items = category.items.filter((item) => {
                      if (foodFilter === "VEG" && !item.isVeg) return false;
                      if (foodFilter === "NON_VEG" && item.isVeg) return false;
                      return true;
                    });
                    if (items.length === 0) return null;
                    return (
                      <li key={category.id}>
                        <h3>{category.name}</h3>
                        <ul>
                          {items.map((item) => (
                            <li key={item.id} className="menu-preview-item">
                              <VegBadge isVeg={item.isVeg} size={14} />
                              <span className="menu-preview-item-copy">
                                <b>{item.name}</b>
                                {item.isPopular && <em>★ Bestseller</em>}
                                {!item.isAvailable && <em className="sold">unavailable</em>}
                              </span>
                              <strong>{inr(item.price)}</strong>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

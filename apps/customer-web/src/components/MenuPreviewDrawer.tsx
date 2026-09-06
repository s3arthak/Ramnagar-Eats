import { useEffect, useState } from "react";
import { X, Search, Clock, ChefHat, UtensilsCrossed } from "lucide-react";
import { api } from "../lib/api";
import type { MenuCategory, MenuItem } from "../lib/types";
import { inr } from "../lib/format";
import { VegBadge } from "./ui/Badges";

interface Props {
  restaurantId: string;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "Rice & Biryani": <UtensilsCrossed size={20} />,
  "Roti & Bread": <UtensilsCrossed size={20} />,
  "Starters": <ChefHat size={20} />,
  "Desserts": <ChefHat size={20} />,
  "Beverages": <ChefHat size={20} />,
  "Curries": <UtensilsCrossed size={20} />,
  "Tandoori": <ChefHat size={20} />,
  "Salads": <ChefHat size={20} />,
};

const DEFAULT_ICONS = <UtensilsCrossed size={20} />;

export function MenuPreviewDrawer({ restaurantId, onClose }: Props) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      try {
        const data = await api.get<{ categories: MenuCategory[] }>(`/restaurants/${restaurantId}/menu`);
        if (!cancelled) setCategories(data.categories);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load menu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMenu();
    return () => { cancelled = true; };
  }, [restaurantId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const visibleCategories = activeCategory ? categories.filter(c => c.id === activeCategory) : categories;

  return (
    <div className="menu-drawer-overlay" onClick={onClose}>
      <div className="menu-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Menu preview">
        <div className="menu-drawer-header">
          <div className="menu-drawer-title-row">
            <ChefHat size={22} className="menu-drawer-icon" />
            <div>
              <h2 className="menu-drawer-title">Menu</h2>
              <p className="menu-drawer-subtitle">{totalItems} items across {categories.length} categories</p>
            </div>
          </div>
          <button className="menu-drawer-close" onClick={onClose} aria-label="Close menu">
            <X size={22} />
          </button>
        </div>

        <div className="menu-drawer-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search dishes..."
            className="menu-drawer-search-input"
            onFocus={(e) => (e.currentTarget.select(), e.currentTarget)}
          />
        </div>

        <div className="menu-drawer-content">
          {loading ? (
            <div className="menu-drawer-loading">
              <div className="menu-loading-spinner"></div>
              <p>Loading menu...</p>
            </div>
          ) : error ? (
            <div className="menu-drawer-error">
              <p>{error}</p>
              <button className="menu-drawer-retry" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          ) : categories.length === 0 ? (
            <div className="menu-drawer-empty">
              <ChefHat size={40} />
              <p>No menu items available</p>
            </div>
          ) : (
            <div className="menu-categories-list">
              {/* Category filter tabs */}
              <div className="menu-category-tabs">
                <button
                  className={`menu-cat-tab ${activeCategory === null ? "active" : ""}`}
                  onClick={() => setActiveCategory(null)}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    className={`menu-cat-tab ${activeCategory === cat.id ? "active" : ""}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Category items */}
              {visibleCategories.map((category) => (
                <div key={category.id} className="menu-category-group">
                  <div className="menu-category-header">
                    <div className="menu-category-icon-wrap">
                      {CATEGORY_ICONS[category.name] || DEFAULT_ICONS}
                    </div>
                    <div>
                      <h3 className="menu-category-name">{category.name}</h3>
                      <p className="menu-category-count">{category.items.length} items</p>
                    </div>
                  </div>
                  <div className="menu-items-grid">
                    {category.items.map((item) => (
                      <MenuPreviewItem key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuPreviewItem({ item }: { item: MenuItem }) {
  const emoji = item.isVeg ? "🥗" : "🍛";

  return (
    <div className="menu-preview-item">
      <div className="menu-preview-photo">
        {item.image ? (
          <img src={item.image} alt={item.name} onError={(e) => (e.currentTarget.style.display = "none")} />
        ) : (
          <span className="menu-preview-emoji">{emoji}</span>
        )}
        {item.isPopular && <span className="menu-popular-badge">★ Popular</span>}
        <span className={`menu-veg-corner ${item.isVeg ? "veg" : "nonveg"}`}>
          <VegBadge isVeg={item.isVeg} size={12} />
        </span>
      </div>
      <div className="menu-preview-body">
        <div className="menu-preview-title-row">
          <VegBadge isVeg={item.isVeg} size={12} />
          <h4 className="menu-preview-name">{item.name}</h4>
        </div>
        <p className="menu-preview-desc">{item.description || "Delicious homemade recipe"}</p>
        <div className="menu-preview-footer">
          <span className="menu-preview-price">
            <strong>{inr(item.price)}</strong>
          </span>
          {item.prepTime && (
            <span className="menu-preview-time">
              <Clock size={11} />
              {item.prepTime} min
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { X, ChefHat } from "lucide-react";
import { api } from "../lib/api";
import type { MenuCategory } from "../lib/types";

interface Props {
  restaurantId: string;
  onClose: () => void;
}

export function MenuPreviewDrawer({ restaurantId, onClose }: Props) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="menu-drawer-overlay" onClick={onClose}>
      <div className="menu-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Menu categories">
        <div className="menu-drawer-header">
          <div className="menu-drawer-title-row">
            <ChefHat size={24} className="menu-drawer-icon" />
            <div>
              <h2 className="menu-drawer-title">Menu Categories</h2>
              <p className="menu-drawer-subtitle">{categories.length} food categories</p>
            </div>
          </div>
          <button className="menu-drawer-close" onClick={onClose} aria-label="Close menu">
            <X size={22} />
          </button>
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
              <p>No menu categories available</p>
            </div>
          ) : (
            <div className="categories-grid">
              {categories.map((category) => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: MenuCategory }) {
  return (
    <div className="category-card">
      <div className="category-card-content">
        <div className="category-card-icon">
          <ChefHat size={28} />
        </div>
        <div className="category-card-info">
          <h3 className="category-card-name">{category.name}</h3>
          <p className="category-card-count">{category.items.length} items</p>
        </div>
      </div>
      <div className="category-card-footer">
        <span className="category-card-tags">
          {category.items.slice(0, 4).map((item) => (
            <span key={item.id} className="category-tag">{item.name}</span>
          ))}
          {category.items.length > 4 && (
            <span className="category-more">+{category.items.length - 4} more</span>
          )}
        </span>
      </div>
    </div>
  );
}

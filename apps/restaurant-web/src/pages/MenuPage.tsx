import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { inr } from "../lib/format";
import type { MenuCategory, MenuItem } from "../lib/types";
import { ImageUploader } from "../components/ui/ImageUploader";

const EMPTY_ITEM = { name: "", price: "", categoryId: "", description: "", isVeg: true, isAvailable: true, isPopular: false, isRecommended: false, prepTime: 15, image: "" };

export function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [notice, setNotice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<(typeof EMPTY_ITEM & { id?: string }) | null>(null);

  const load = useCallback(async () => {
    try {
      const [categoryData, itemData] = await Promise.all([api.get<{ categories: MenuCategory[] }>("/restaurants/me/categories"), api.get<{ items: MenuItem[] }>("/restaurants/me/menu-items")]);
      setCategories(categoryData.categories);
      setItems(itemData.items);
      setNotice("");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not load your menu");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCategory() {
    if (!newCategory.trim()) return;
    try {
      await api.post("/restaurants/me/categories", { name: newCategory.trim() });
      setNewCategory("");
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not add category");
    }
  }

  async function commitRename() {
    if (!renaming || !renaming.name.trim()) {
      setRenaming(null);
      return;
    }
    try {
      await api.patch(`/restaurants/me/categories/${renaming.id}`, { name: renaming.name.trim() });
      setRenaming(null);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not rename category");
    }
  }

  async function deleteCategory(category: MenuCategory) {
    if (!window.confirm(`Delete "${category.name}" and all its items?`)) return;
    try {
      await api.delete(`/restaurants/me/categories/${category.id}`);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not delete category");
    }
  }

  async function toggleAvailability(item: MenuItem) {
    try {
      await api.patch(`/restaurants/me/menu-items/${item.id}/availability`, { isAvailable: !item.isAvailable });
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update item");
    }
  }

  async function deleteItem(item: MenuItem) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.delete(`/restaurants/me/menu-items/${item.id}`);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not delete item");
    }
  }

  async function saveItem() {
    if (!editing || !editing.name.trim() || !editing.price || !editing.categoryId) return;
    const body = {
      name: editing.name.trim(),
      price: Number(editing.price),
      categoryId: editing.categoryId,
      description: editing.description.trim(),
      isVeg: editing.isVeg,
      isAvailable: editing.isAvailable,
      isPopular: editing.isPopular,
      isRecommended: editing.isRecommended,
      prepTime: Number(editing.prepTime) || 15,
      image: editing.image.trim() || undefined,
    };
    try {
      if (editing.id) await api.patch(`/restaurants/me/menu-items/${editing.id}`, body);
      else await api.post("/restaurants/me/menu-items", body);
      setEditing(null);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save item");
    }
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">MENU MANAGEMENT</p>
          <h1>Menu</h1>
        </div>
        <button className="action" onClick={() => setEditing({ ...EMPTY_ITEM, categoryId: categories[0]?.id ?? "" })} disabled={categories.length === 0}>
          <Plus size={14} /> Add item
        </button>
      </header>
      {notice && <p className="notice">{notice}</p>}

      <div className="menu-layout">
        <div className="form-card">
          <h2>Categories</h2>
          <div className="inline-form">
            <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="e.g. Main course" />
            <button className="action" onClick={() => void addCategory()}>
              Add
            </button>
          </div>
          {categories.length === 0 && <p className="empty-inline">Add your first category to start building the menu.</p>}
          {categories.map((category) => (
            <div className="row" key={category.id}>
              {renaming?.id === category.id ? (
                <input
                  value={renaming.name}
                  autoFocus
                  onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                  onBlur={() => void commitRename()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitRename();
                  }}
                />
              ) : (
                <span>{category.name}</span>
              )}
              <span className="row-actions">
                <button className="icon-btn" onClick={() => setRenaming({ id: category.id, name: category.name })} aria-label={`Rename ${category.name}`}>
                  <Pencil size={13} />
                </button>
                <button className="icon-btn danger" onClick={() => void deleteCategory(category)} aria-label={`Delete ${category.name}`}>
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="form-card">
          <h2>Menu items</h2>
          {items.length === 0 && <p className="empty-inline">No items yet. Add items to your categories above.</p>}
          <div className="item-list">
            {items.map((item) => (
              <div className="row item-row" key={item.id}>
                <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} title={item.isVeg ? "Veg" : "Non-veg"} />
                <span className="item-name">
                  {item.name}
                  {item.isPopular && <em>★</em>}
                  {item.isRecommended && <em className="rec">chef's pick</em>}
                  {!item.isAvailable && <em className="sold">unavailable</em>}
                </span>
                <span className="item-category">{categories.find((category) => category.id === item.categoryId)?.name ?? "—"}</span>
                <b>{inr(item.price)}</b>
                <span className="row-actions">
                  <button className={`toggle ${item.isAvailable ? "on" : ""}`} onClick={() => void toggleAvailability(item)} title="Toggle availability">
                    {item.isAvailable ? "Available" : "Hidden"}
                  </button>
                  <button className="icon-btn" onClick={() => setEditing({ ...item, price: String(item.price), prepTime: item.prepTime ?? 15, image: item.image ?? "" })} aria-label={`Edit ${item.name}`}>
                    <Pencil size={13} />
                  </button>
                  <button className="icon-btn danger" onClick={() => void deleteItem(item)} aria-label={`Delete ${item.name}`}>
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <div className="overlay">
          <section className="sheet">
            <button className="close" onClick={() => setEditing(null)} aria-label="Close">
              <X size={18} />
            </button>
            <p className="eyebrow">{editing.id ? "EDIT ITEM" : "NEW ITEM"}</p>
            <h2>{editing.id ? editing.name : "Add a menu item"}</h2>
            <div className="form-grid">
              <label>
                Item name
                <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </label>
              <label>
                Price (₹)
                <input value={editing.price} onChange={(event) => setEditing({ ...editing, price: event.target.value })} inputMode="numeric" />
              </label>
              <label>
                Category
                <select value={editing.categoryId} onChange={(event) => setEditing({ ...editing, categoryId: event.target.value })}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="wide image-field">
                <span className="field-label">Dish photo</span>
                <ImageUploader
                  value={editing.image}
                  onChange={(image) => setEditing({ ...editing, image })}
                  folder="menu"
                  label="Dish photo"
                  aspect="wide"
                  fallbackText="Add dish photo"
                />
              </div>
              <label className="wide">
                Description
                <textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
              </label>
              <fieldset className="food-type">
                <legend>Food type (required)</legend>
                <label className={editing.isVeg ? "selected veg" : "veg"}>
                  <input type="radio" name="food-type" checked={editing.isVeg} onChange={() => setEditing({ ...editing, isVeg: true })} /> 🥬 Veg
                </label>
                <label className={editing.isVeg ? "nonveg" : "selected nonveg"}>
                  <input type="radio" name="food-type" checked={!editing.isVeg} onChange={() => setEditing({ ...editing, isVeg: false })} /> 🍗 Non-Veg
                </label>
              </fieldset>
              <label>
                Prep time (min)
                <input type="number" min={1} max={120} value={editing.prepTime} onChange={(event) => setEditing({ ...editing, prepTime: Number(event.target.value) })} />
              </label>
              <label className="check-row">
                <input type="checkbox" checked={editing.isPopular} onChange={(event) => setEditing({ ...editing, isPopular: event.target.checked })} /> Bestseller
              </label>
              <label className="check-row">
                <input type="checkbox" checked={editing.isRecommended} onChange={(event) => setEditing({ ...editing, isRecommended: event.target.checked })} /> Recommended (chef's pick)
              </label>
              <label className="check-row">
                <input type="checkbox" checked={editing.isAvailable} onChange={(event) => setEditing({ ...editing, isAvailable: event.target.checked })} /> Available for order
              </label>
            </div>
            <button className="submit" disabled={!editing.name.trim() || !editing.price || !editing.categoryId} onClick={() => void saveItem()}>
              {editing.id ? "Save changes" : "Add item"}
            </button>
          </section>
        </div>
      )}
    </>
  );
}

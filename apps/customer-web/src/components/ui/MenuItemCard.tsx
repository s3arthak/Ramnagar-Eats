import { useEffect, useMemo, useState } from "react";
import { Star, X } from "lucide-react";
import type { CustomizationGroup, MenuItem } from "../../lib/types";
import type { CartCustomization } from "../../lib/cart";
import { inr } from "../../lib/format";
import { VegBadge } from "./Badges";
import { QuantitySelector } from "./QuantitySelector";

interface Props {
  item: MenuItem;
  quantity: number;
  disabled?: boolean;
  onAdd: (customizations: CartCustomization[]) => Promise<boolean>;
  onChangeQuantity: (delta: number) => void;
}

export function MenuItemCard({ item, quantity, disabled = false, onAdd, onChangeQuantity }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = item.image && !imageFailed;

  const cannotOrder = disabled || !item.isAvailable;

  function openSheet() {
    if (cannotOrder) return;
    // Straight to add for simple items; customisation sheet for customisable ones.
    if (item.customizations.length === 0) {
      void onAdd([]);
    } else {
      setSheetOpen(true);
    }
  }

  return (
    <>
      <article className={`dish-card ${cannotOrder ? "dish-card--off" : ""}`}>
        <button
          className="dish-photo"
          onClick={() => !cannotOrder && setSheetOpen(true)}
          aria-label={`View ${item.name}`}
          disabled={cannotOrder}
        >
          {showImage ? (
            <img src={item.image} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <span className="dish-photo-fallback" aria-hidden="true">{item.isVeg ? "🥗" : "🍛"}</span>
          )}
          {item.isPopular && <span className="dish-flag">★ Bestseller</span>}
          {!showImage && <span className={`dish-veg-corner ${item.isVeg ? "veg" : "nonveg"}`}><VegBadge isVeg={item.isVeg} size={13} /></span>}
        </button>
        <div className="dish-body">
          <div className="dish-title-row">
            <VegBadge isVeg={item.isVeg} size={13} />
            <h4>{item.name}</h4>
          </div>
          <div className="dish-meta">
            <span className="dish-rating">
              <Star size={10} fill="currentColor" /> {item.prepTime ? `${item.prepTime} min` : "Popular"}
            </span>
          </div>
          <div className="dish-buy">
            <div className="dish-price">
              <strong>{inr(item.price)}</strong>
            </div>
            {item.isAvailable ? (
              quantity > 0 ? (
                <QuantitySelector quantity={quantity} onChange={onChangeQuantity} size="sm" />
              ) : (
                <button className="dish-add" disabled={disabled} onClick={openSheet}>
                  ADD
                </button>
              )
            ) : (
              <span className="sold-out">Sold out</span>
            )}
          </div>
          {item.customizations.length > 0 && <small className="dish-custom">Customisable</small>}
        </div>
      </article>

      {sheetOpen && (
        <DishSheet
          item={item}
          onClose={() => setSheetOpen(false)}
          onConfirm={async (customizations) => {
            const added = await onAdd(customizations);
            if (added) setSheetOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Full detail sheet — image hero, price, description, customisations, sticky ADD. */
function DishSheet({ item, onClose, onConfirm }: { item: MenuItem; onClose: () => void; onConfirm: (customizations: CartCustomization[]) => Promise<void> }) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(item.customizations.map((group) => [group.name, group.required ? [group.options[0]?.name ?? ""] : []])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const customizations = useMemo<CartCustomization[]>(
    () =>
      item.customizations.flatMap((group) =>
        (selected[group.name] ?? [])
          .map((optionName) => {
            const option = group.options.find((candidate) => candidate.name === optionName);
            return option ? { name: group.name, optionName: option.name, price: option.price } : null;
          })
          .filter((value): value is CartCustomization => value !== null),
      ),
    [item.customizations, selected],
  );

  const total = item.price + customizations.reduce((sum, c) => sum + c.price, 0);
  const canSubmit = item.customizations.every((group) => !group.required || (selected[group.name] ?? []).length > 0);

  function toggle(group: CustomizationGroup, optionName: string) {
    setSelected((current) => {
      const chosen = current[group.name] ?? [];
      if (group.required) return { ...current, [group.name]: [optionName] };
      return { ...current, [group.name]: chosen.includes(optionName) ? chosen.filter((name) => name !== optionName) : [...chosen, optionName] };
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const simple = item.customizations.length === 0;

  return (
    <div className="overlay dish-overlay" role="dialog" aria-modal="true" aria-label={item.name}>
      <section className="dish-sheet">
        <button className="dish-sheet-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="dish-sheet-photo">
          {item.image && !imageFailed ? (
            <img src={item.image} alt={item.name} onError={() => setImageFailed(true)} />
          ) : (
            <span aria-hidden="true">{item.isVeg ? "🥗" : "🍛"}</span>
          )}
          {item.isPopular && <span className="dish-flag dish-flag--sheet">★ Bestseller</span>}
        </div>
        <div className="dish-sheet-body">
          <div className="dish-title-row">
            <VegBadge isVeg={item.isVeg} />
            <h3>{item.name}</h3>
          </div>
          {!simple && (
            <div className="dish-sheet-buyrow">
              <strong className="dish-sheet-price">{inr(total)}</strong>
            </div>
          )}
          {item.description && <p className="dish-sheet-desc">{item.description}</p>}

          {!simple && (
            <div className="customize-groups dish-sheet-groups">
              {item.customizations.map((group) => (
                <fieldset key={group.name}>
                  <legend>
                    {group.name} {group.required && <em>Required</em>}
                  </legend>
                  {group.options.map((option) => {
                    const chosen = selected[group.name] ?? [];
                    const active = chosen.includes(option.name);
                    return (
                      <label key={option.name} className={active ? "customize-option active" : "customize-option"}>
                        <input type={group.required ? "radio" : "checkbox"} name={group.name} checked={active} onChange={() => toggle(group, option.name)} />
                        <span>{option.name}</span>
                        <b>{option.price > 0 ? `+${inr(option.price)}` : "FREE"}</b>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          )}
        </div>
        <div className="dish-sheet-foot">
          {simple ? (
            <button
              className="confirm"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                await onConfirm([]);
                setSubmitting(false);
              }}
            >
              {submitting ? "Adding…" : `Add to cart · ${inr(item.price)}`}
            </button>
          ) : (
            <button className="confirm" disabled={!canSubmit || submitting} onClick={async () => { setSubmitting(true); await onConfirm(customizations); setSubmitting(false); }}>
              {submitting ? "Adding…" : `Add to cart · ${inr(total)}`}
            </button>
          )}
          {item.customizations.length > 0 && <small className="dish-sheet-hint">Customisable — options selected above</small>}
        </div>
      </section>
    </div>
  );
}

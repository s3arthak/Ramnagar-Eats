import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { CustomizationGroup, MenuItem } from "../../lib/types";
import type { CartCustomization } from "../../lib/cart";
import { inr } from "../../lib/format";
import { Badge, VegBadge } from "./Badges";
import { QuantitySelector } from "./QuantitySelector";

interface Props {
  item: MenuItem;
  quantity: number;
  disabled?: boolean;
  onAdd: (customizations: CartCustomization[]) => Promise<boolean>;
  onChangeQuantity: (delta: number) => void;
}

export function MenuItemCard({ item, quantity, disabled = false, onAdd, onChangeQuantity }: Props) {
  const [customizing, setCustomizing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  if (customizing) {
    return <CustomizationModal item={item} onClose={() => setCustomizing(false)} onConfirm={async (customizations) => { const added = await onAdd(customizations); if (added) setCustomizing(false); }} />;
  }

  const cannotOrder = disabled || !item.isAvailable;

  return (
    <div className={`menu-item ${cannotOrder ? "menu-item--unavailable" : ""}`}>
      <div className="menu-item-copy">
        <div className="menu-item-title">
          <VegBadge isVeg={item.isVeg} />
          <h4>{item.name}</h4>
          {item.isPopular && <Badge tone="popular">Bestseller</Badge>}
          {item.isRecommended && <Badge tone="recommended">Chef's pick</Badge>}
        </div>
        {item.description && <p>{item.description}</p>}
        <strong>{inr(item.price)}</strong>
        {item.prepTime ? <small className="prep-time">⏱ {item.prepTime} min</small> : null}
        {item.customizations.length > 0 && <small className="customize-hint">Customisable</small>}
      </div>
      <div className="menu-item-art">
        {item.image && !imageFailed ? (
          <img
            className="item-thumb item-thumb--img"
            src={item.image}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={`item-thumb ${item.isVeg ? "veg-tone" : "nonveg-tone"}`} aria-hidden="true">
            {item.isVeg ? "🥬" : "🍗"}
          </div>
        )}
        {item.isAvailable ? (
          quantity > 0 ? (
            <QuantitySelector quantity={quantity} onChange={onChangeQuantity} />
          ) : (
            <button className="add-btn" disabled={disabled} onClick={() => (item.customizations.length ? setCustomizing(true) : void onAdd([]))}>
              ADD
            </button>
          )
        ) : (
          <span className="sold-out">Currently unavailable</span>
        )}
      </div>
    </div>
  );
}

function CustomizationModal({ item, onClose, onConfirm }: { item: MenuItem; onClose: () => void; onConfirm: (customizations: CartCustomization[]) => Promise<void> }) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(item.customizations.map((group) => [group.name, group.required ? [group.options[0]?.name ?? ""] : []])),
  );
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Customize ${item.name}`}>
      <section className="location-sheet customize-sheet">
        <button className="close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <p className="eyebrow">CUSTOMISE YOUR ORDER</p>
        <h2>{item.name}</h2>
        <p className="sheet-copy">{item.description}</p>
        <div className="customize-groups">
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
        <button className="confirm" disabled={!canSubmit || submitting} onClick={async () => { setSubmitting(true); await onConfirm(customizations); setSubmitting(false); }}>
          {submitting ? "Adding…" : `Add to cart · ${inr(total)}`}
        </button>
      </section>
    </div>
  );
}

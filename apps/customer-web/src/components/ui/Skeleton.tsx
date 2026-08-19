const FOOD_EMOJIS = ["🍛", "🍕", "🍔", "🍜", "🥘", "🍲", "🍰", "🥗"];

function FoodSpinner() {
  return (
    <div className="food-spinner" aria-hidden="true">
      {FOOD_EMOJIS.map((emoji, i) => (
        <span
          key={i}
          className="food-spinner-emoji"
          style={{ animationDelay: `${i * 0.15}s` }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-view" role="status">
      <FoodSpinner />
      <p>{label}</p>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <article className="restaurant-card skeleton-card" aria-hidden="true">
      <div className="food-image skeleton-block" />
      <div className="restaurant-copy">
        <div className="skeleton-block skeleton-line" />
        <div className="skeleton-block skeleton-line short" />
        <div className="skeleton-block skeleton-line tiny" />
      </div>
    </article>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="restaurant-grid" aria-busy="true" aria-label="Loading restaurants">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonMenuItem() {
  return (
    <div className="menu-item skeleton-menu-item" aria-hidden="true">
      <div className="menu-item-copy">
        <div className="skeleton-block skeleton-line" style={{ width: "60%" }} />
        <div className="skeleton-block skeleton-line tiny" style={{ width: "80%" }} />
        <div className="skeleton-block skeleton-line tiny" style={{ width: "30%" }} />
      </div>
      <div className="menu-item-art">
        <div className="skeleton-block" style={{ width: 88, height: 88, borderRadius: 12 }} />
        <div className="skeleton-block" style={{ width: 70, height: 32, borderRadius: 9 }} />
      </div>
    </div>
  );
}

export function SkeletonOrderCard() {
  return (
    <div className="order-card skeleton-order" aria-hidden="true">
      <div className="skeleton-block skeleton-line" style={{ width: "40%" }} />
      <div className="skeleton-block skeleton-line tiny" style={{ width: "60%" }} />
      <div className="skeleton-block skeleton-line tiny" style={{ width: "80%" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <div className="skeleton-block" style={{ width: 80, height: 28, borderRadius: 999 }} />
        <div className="skeleton-block" style={{ width: 100, height: 28, borderRadius: 999 }} />
      </div>
    </div>
  );
}

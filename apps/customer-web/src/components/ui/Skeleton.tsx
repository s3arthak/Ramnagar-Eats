export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-view" role="status">
      <span className="spinner" aria-hidden="true" />
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

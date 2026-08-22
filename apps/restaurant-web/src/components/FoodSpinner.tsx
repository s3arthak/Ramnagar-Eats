/** Single food emoji bouncing — consistent across all Ramnagar Eats apps. */
export function FoodSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="food-spinner-wrap" role="status">
      <span className="food-spinner-emoji" aria-hidden="true">🍛</span>
      <p className="food-spinner-label">{label}</p>
    </div>
  );
}

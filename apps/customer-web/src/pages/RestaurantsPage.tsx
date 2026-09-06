import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "../lib/api";
import type { CuisineCategory, Restaurant } from "../lib/types";
import { useLocation } from "../context/LocationContext";
import { RestaurantCard } from "../components/ui/RestaurantCard";
import { SkeletonGrid } from "../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../components/ui/StateViews";

interface ListResponse {
  restaurants: Restaurant[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "rating", label: "Rating" },
  { value: "delivery_time", label: "Delivery time" },
];

const RATING_OPTIONS = [
  { value: "", label: "Any rating" },
  { value: "4", label: "4.0+" },
  { value: "4.5", label: "4.5+" },
];

const DELIVERY_OPTIONS = [
  { value: "", label: "Any delivery time" },
  { value: "25", label: "Under 25 min" },
  { value: "35", label: "Under 35 min" },
  { value: "45", label: "Under 45 min" },
];

const PRICE_OPTIONS = [
  { value: "", label: "Any price" },
  { value: "250", label: "Under ₹250" },
  { value: "350", label: "Under ₹350" },
  { value: "500", label: "Under ₹500" },
];

export function RestaurantsPage({ onOpenLocation }: { onOpenLocation: () => void }) {
  const { place } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [cuisines, setCuisines] = useState<CuisineCategory[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "relevance";
  const rating = searchParams.get("rating") ?? "";
  const veg = searchParams.get("veg") === "true";
  const deliveryTime = searchParams.get("deliveryTime") ?? "";
  const price = searchParams.get("price") ?? "";
  const cuisineParam = searchParams.get("cuisines") ?? "";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const buildUrl = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (place) {
        params.set("lat", String(place.lat));
        params.set("lng", String(place.lng));
      }
      if (query) params.set("q", query);
      if (sort) params.set("sort", sort);
      if (rating) params.set("rating", rating);
      if (veg) params.set("veg", "true");
      if (deliveryTime) params.set("deliveryTime", deliveryTime);
      if (price) params.set("price", price);
      if (cuisineParam) params.set("cuisines", cuisineParam);
      params.set("page", String(page));
      params.set("limit", "9");
      return `/restaurants?${params.toString()}`;
    },
    [place, query, sort, rating, veg, deliveryTime, price, cuisineParam],
  );

  const load = useCallback(
    async (page: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const data = await api.get<ListResponse>(buildUrl(page));
        setRestaurants((current) => (append ? [...current, ...data.restaurants] : data.restaurants));
        setHasMore(data.hasMore);
        setTotal(data.total);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load restaurants");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildUrl],
  );

  useEffect(() => {
    void load(1, false);
  }, [load]);

  useEffect(() => {
    api
      .get<{ categories: CuisineCategory[] }>("/categories")
      .then((data) => setCuisines(data.categories))
      .catch(() => undefined);
  }, []);

  const activeFilters = [rating, veg ? "veg" : "", deliveryTime, price, cuisineParam].filter(Boolean).length;

  return (
    <div className="content listing">
      <div className="listing-head">
        <div>
          <p className="eyebrow">DISCOVER</p>
          <h1>{query ? `Results for “${query}”` : "All restaurants"}</h1>
          <p className="listing-sub">
            {place ? (
              <>
                Delivering to <button onClick={onOpenLocation}>{place.label} · {place.pincode}</button>
              </>
            ) : (
              <>
                <button onClick={onOpenLocation}>
                  <MapPin size={14} /> Set your location to see restaurants
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Filters">
        <button className="filters-toggle" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
          <SlidersHorizontal size={15} /> Filters
          {activeFilters > 0 && <span className="filters-count">{activeFilters}</span>}
        </button>
        <div className={`filters-panel${filtersOpen ? " open" : ""}`}>
          <form className="filter-search" onSubmit={(event) => { event.preventDefault(); }}>
            <Search size={16} />
            <input value={query} onChange={(event) => setParam("q", event.target.value)} placeholder="Search restaurants, dishes…" aria-label="Search within restaurants" />
          </form>
          <select value={sort} onChange={(event) => setParam("sort", event.target.value)} aria-label="Sort by">
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Sort: {option.label}
              </option>
            ))}
          </select>
          <select value={cuisineParam} onChange={(event) => setParam("cuisines", event.target.value)} aria-label="Cuisine">
            <option value="">All cuisines</option>
            {cuisines.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
          <select value={rating} onChange={(event) => setParam("rating", event.target.value)} aria-label="Minimum rating">
            {RATING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select value={deliveryTime} onChange={(event) => setParam("deliveryTime", event.target.value)} aria-label="Delivery time">
            {DELIVERY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select value={price} onChange={(event) => setParam("price", event.target.value)} aria-label="Price range">
            {PRICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="veg-toggle" title="Vegetarian only">
            <input type="checkbox" checked={veg} onChange={(event) => setParam("veg", event.target.checked ? "true" : "")} />
            Pure veg
          </label>
          {activeFilters > 0 && (
            <button className="filter clear-filters" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}>
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={9} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(1, false)} />
      ) : restaurants.length === 0 ? (
        <EmptyState
          icon={<MapPin size={30} />}
          title="No restaurants match these filters"
          copy="Try removing a filter or searching for something else."
          action={
            <button className="filter" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}>
              Clear all filters
            </button>
          }
        />
      ) : (
        <>
          <p className="results-count">
            <span className="results-count-num">{total}</span> restaurant{total === 1 ? "" : "s"} found
          </p>
          <div className="restaurant-grid">
            {restaurants.map((restaurant) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} />
            ))}
          </div>
          {hasMore && (
            <div className="load-more">
              <button className="filter" disabled={loadingMore} onClick={() => void load(Math.floor(restaurants.length / 9) + 1, true)}>
                {loadingMore ? "Loading…" : "Load more restaurants"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

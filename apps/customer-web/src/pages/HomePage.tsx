import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LocateFixed, MapPin, Search, Star, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useConfig } from "../lib/config";
import type { CuisineCategory, Restaurant } from "../lib/types";
import { useLocation } from "../context/LocationContext";
import { RestaurantCard } from "../components/ui/RestaurantCard";
import { SkeletonGrid } from "../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../components/ui/StateViews";

interface HomeData {
  restaurants: Restaurant[];
}

export function HomePage({ onOpenLocation }: { onOpenLocation: () => void }) {
  const { place } = useLocation();
  const { brandName } = useConfig();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CuisineCategory[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [categoryData, restaurantData] = await Promise.all([
        api.get<{ categories: CuisineCategory[] }>("/categories"),
        place
          ? api.get<HomeData>(`/restaurants?lat=${place.lat}&lng=${place.lng}&limit=24`)
          : Promise.resolve({ restaurants: [] as Restaurant[] }),
      ]);
      setCategories(categoryData.categories);
      setRestaurants(restaurantData.restaurants);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load restaurants");
    } finally {
      setLoading(false);
    }
  }, [place]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    navigate(query.trim() ? `/restaurants?q=${encodeURIComponent(query.trim())}` : "/restaurants");
  }

  const topRated = [...restaurants].sort((a, b) => b.rating - a.rating).slice(0, 8);
  const fast = [...restaurants].sort((a, b) => a.deliveryTimeMin - b.deliveryTimeMin).slice(0, 8);
  const fastestDelivery = restaurants.length > 0 ? Math.min(...restaurants.map((restaurant) => restaurant.deliveryTimeMin)) : null;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{brandName.toUpperCase()} · FRESH &amp; FAST</p>
          <h1 className="hero-title">
            Your neighbourhood <i>food</i>, delivered.
          </h1>
          <p>Independent kitchens, your familiar favourites, and fast delivery—all around the corner.</p>
          <form className="hero-search" onSubmit={submitSearch} role="search">
            <Search size={19} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for restaurants, dishes…" aria-label="Search for restaurants or dishes" />
            <button type="submit">Search</button>
          </form>
          <button className="hero-cta" onClick={onOpenLocation}>
            <LocateFixed size={19} />
            {place ? "Change delivery location" : "Find food near me"}
          </button>
        </div>
        <div className="hero-art">
          <div className="plate">🍲</div>
          <span className="chip chip-one">✦ {fastestDelivery ? `~${fastestDelivery} min avg delivery` : "Fast local delivery"}</span>
          <span className="chip chip-two">★ {topRated.length > 0 ? `${topRated.length} top-rated spots` : "Loved locally"}</span>
        </div>
      </section>

      <div className="content">
        <div className="section-head">
          <div>
            <p className="eyebrow">ORDER WHAT YOU LOVE</p>
            <h2>What's on your mind?</h2>
          </div>
        </div>
        {categories.length > 0 ? (
          <div className="categories">
            {categories.map((category) => (
              <Link key={category.id} to={`/restaurants?cuisines=${encodeURIComponent(category.name)}`}>
                <span>{category.emoji}</span>
                {category.name}
              </Link>
            ))}
          </div>
        ) : (
          <div className="categories categories--skeleton" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <span key={index} className="skeleton-block" />
            ))}
          </div>
        )}

        {place ? (
          <>
            <div className="section-head">
              <div>
                <p className="eyebrow">NEAR YOU</p>
                <h2>Popular restaurants around {place.label}</h2>
              </div>
            </div>
            {loading ? (
              <SkeletonGrid count={6} />
            ) : error ? (
              <ErrorState message={error} onRetry={() => void load()} />
            ) : restaurants.length === 0 ? (
              <EmptyState
                icon={<MapPin size={30} />}
                title="New local restaurants are joining soon"
                copy="We only show restaurants we can deliver to from your exact location."
                action={
                  <button className="filter" onClick={onOpenLocation}>
                    Change location
                  </button>
                }
              />
            ) : (
              <Section title="Popular right now" icon={<Star size={15} />} restaurants={restaurants.slice(0, 8)} />
            )}
            {!loading && !error && restaurants.length > 0 && (
              <>
                <Section title="Top rated" icon={<Star size={15} />} restaurants={topRated} />
                <Section title="Fastest delivery" icon={<Zap size={15} />} restaurants={fast} />
                <div className="section-head">
                  <Link className="see-all" to="/restaurants">
                    Browse all restaurants →
                  </Link>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="section-head">
            <div>
              <p className="eyebrow">NEAR YOU</p>
              <h2>Restaurants around you</h2>
            </div>
          </div>
        )}
        {!place && (
          <EmptyState
            icon={<MapPin size={30} />}
            title="Choose your location to see nearby food"
            copy="We only show restaurants that can deliver to your exact location."
            action={
              <button className="filter" onClick={onOpenLocation}>
                Set delivery location
              </button>
            }
          />
        )}
      </div>
    </>
  );
}

function Section({ title, icon, restaurants }: { title: string; icon: React.ReactNode; restaurants: Restaurant[] }) {
  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">
            {icon} {title.toUpperCase()}
          </p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="restaurant-grid">
        {restaurants.map((restaurant) => (
          <RestaurantCard key={restaurant.id} restaurant={restaurant} />
        ))}
      </div>
    </>
  );
}

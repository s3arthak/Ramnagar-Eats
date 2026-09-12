import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Leaf, MapPin, Search, Star, Zap, X, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import type { CuisineCategory, PromoBanner, Restaurant } from "../lib/types";
import { useLocation } from "../context/LocationContext";
import { useCart } from "../context/CartContext";
import { RestaurantCard } from "../components/ui/RestaurantCard";
import { SkeletonGrid } from "../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../components/ui/StateViews";

interface HomeData {
  restaurants: Restaurant[];
}

export function HomePage({ onOpenLocation }: { onOpenLocation: () => void }) {
  const { place } = useLocation();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CuisineCategory[]>([]);
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [categoryData, bannerData, restaurantData] = await Promise.all([
        api.get<{ categories: CuisineCategory[] }>("/categories"),
        // Promo banners are optional: a failure must never break the home feed, but
        // it is logged so a missing or undeployed /banners endpoint can't silently
        // remove the carousel with no trace.
        api
          .get<{ banners: PromoBanner[] }>("/banners")
          .catch((caught) => {
            console.warn("Banners unavailable:", caught);
            return { banners: [] as PromoBanner[] };
          }),
        place
          ? api.get<HomeData>(`/restaurants?lat=${place.lat}&lng=${place.lng}&limit=24`)
          : Promise.resolve({ restaurants: [] as Restaurant[] }),
      ]);
      setCategories(categoryData.categories);
      setBanners(bannerData.banners);
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

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    navigate(query.trim() ? `/restaurants?q=${encodeURIComponent(query.trim())}` : "/restaurants");
  }

  const topRated = [...restaurants].sort((a, b) => b.rating - a.rating).slice(0, 10);
  const fast = [...restaurants].sort((a, b) => a.deliveryTimeMin - b.deliveryTimeMin).slice(0, 10);

  return (
    <>
      {/* ===== Enhanced hero section with animated background ===== */}
      <section className="home-hero-enhanced">
        <div className="hero-bg-orb hero-orb-1" aria-hidden="true"></div>
        <div className="hero-bg-orb hero-orb-2" aria-hidden="true"></div>
        <div className="hero-bg-orb hero-orb-3" aria-hidden="true"></div>
        <div className="home-hero-inner">
          <div className="home-hero-top">
            <button className="home-loc" onClick={onOpenLocation}>
              <span className="home-loc-label">
                <MapPin size={20} />
                <span className="home-loc-text">{place ? place.label : "Set your location"}</span>
              </span>
              {place?.pincode && <small className="home-loc-pincode">{place.pincode}</small>}
            </button>
          </div>
          <h1 className="home-hero-title">
            <span className="home-hero-title-line">What's cooking</span>
            <span className="home-hero-title-line home-hero-title-highlight">today?</span>
          </h1>
          <p className="home-hero-subtitle">
            Explore {place ? `restaurants near ${place.label}` : 'nearby restaurants'} — fresh, delicious food delivered to your door.
          </p>
          <form className="home-search" onSubmit={submitSearch} role="search">
            <div className="search-wrap">
              <Search size={18} className="search-icon" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for restaurants, dishes, cuisines…"
                aria-label="Search for restaurants and food"
                className="search-input"
              />
              {query && (
                <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={16} />
                </button>
              )}
            </div>
            <button type="submit" className="search-btn" aria-label="Search">
              <Search size={18} />
              <span>Search</span>
            </button>
          </form>
          <div className="home-chips-enhanced">
            <button onClick={onOpenLocation} className="chip-btn chip-location">
              <MapPin size={14} />
              <span>{place ? "Change location" : "Set location"}</span>
            </button>
            <Link to="/restaurants?veg=true" className="chip-btn chip-veg">
              <Leaf size={14} />
              <span>Pure Veg</span>
            </Link>
            <Link to="/restaurants?deliveryTime=25" className="chip-btn chip-fast">
              <Zap size={14} />
              <span>Fast delivery</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="content home">
        {/* ===== Banner carousel ===== */}
        {banners.length > 0 && (
          <BannerCarousel banners={banners} />
        )}

        {/* ===== Category rail (real food images) ===== */}
        <div className="section-head">
          <div>
            <p className="eyebrow">EXPLORE CATEGORIES</p>
            <h2>What's on your mind?</h2>
          </div>
          <Link to="/restaurants" className="see-all">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {categories.length > 0 ? (
          <div className="rail rail-cats">
            {categories.map((category, index) => (
              <Link
                key={category.id}
                className="cat-card"
                to={`/restaurants?cuisines=${encodeURIComponent(category.name)}`}
                style={{ animationDelay: `${Math.min(index * 0.05, 0.5)}s` }}
              >
                <img src={category.image || `https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=70&auto=format&fit=crop`} alt={category.name} loading="lazy" />
                <span>{category.name}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rail rail-cats" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <span key={index} className="cat-card skeleton-block" />
            ))}
          </div>
        )}

        {/* ===== Restaurants near you ===== */}
        {place ? (
          loading ? (
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
            <>
              <RailSection title="Top picks near you" icon={<Star size={14} />} restaurants={restaurants.slice(0, 10)} />
              <RailSection title="Top rated" icon={<Star size={14} />} restaurants={topRated} />
              <RailSection title="Fastest delivery" icon={<Zap size={14} />} restaurants={fast} />
              <div className="section-head">
                <Link className="see-all" to="/restaurants">
                  Browse all restaurants →
                </Link>
              </div>
            </>
          )
        ) : (
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

/** Auto-playing, swipeable promo banner carousel with dots + arrows. */
function BannerCarousel({ banners }: { banners: PromoBanner[] }) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const count = banners.length;

  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), 4200);
    return () => clearInterval(timer);
  }, [count]);

  const go = (delta: number) => setIndex((current) => (current + delta + count) % count);

  return (
    <section
      className="banner-carousel"
      role="region"
      aria-label="Deals and offers"
      onTouchStart={(event) => (touchX.current = event.touches[0].clientX)}
      onTouchEnd={(event) => {
        if (touchX.current === null) return;
        const dx = event.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="banner-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {banners.map((banner) => (
          <div key={banner.id} className={`banner-slide banner--${banner.theme}`}>
            <div className="banner-copy">
              <h3>{banner.title}</h3>
              <p>{banner.subtitle}</p>
              <Link className="banner-cta" to={banner.ctaLink}>
                {banner.ctaLabel}
              </Link>
            </div>
            {banner.image && <img className="banner-img" src={banner.image} alt="" loading="lazy" />}
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button className="banner-arrow banner-arrow--l" onClick={() => go(-1)} aria-label="Previous banner">
            <ChevronLeft size={18} />
          </button>
          <button className="banner-arrow banner-arrow--r" onClick={() => go(1)} aria-label="Next banner">
            <ChevronRight size={18} />
          </button>
          <div className="banner-dots">
            {banners.map((banner, dotIndex) => (
              <button
                key={banner.id}
                className={dotIndex === index ? "active" : ""}
                onClick={() => setIndex(dotIndex)}
                aria-label={`Go to banner ${dotIndex + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Horizontal scroll rail of restaurant cards. */
function RailSection({ title, icon, restaurants }: { title: string; icon: React.ReactNode; restaurants: Restaurant[] }) {
  const { itemCount } = useCart();
  void itemCount; // rails re-render naturally with cart state via RestaurantCard context usage
  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">
            {icon} {title.toUpperCase()}
          </p>
          <h2>{title}</h2>
        </div>
        <Link to="/restaurants" className="see-all">
          See all <ArrowRight size={14} />
        </Link>
      </div>
      <div className="rail rail-restaurants">
        {restaurants.map((restaurant) => (
          <div className="rail-item" key={restaurant.id}>
            <RestaurantCard restaurant={restaurant} />
          </div>
        ))}
      </div>
    </>
  );
}

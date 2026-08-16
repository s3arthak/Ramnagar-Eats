import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, MapPin, Search, ShoppingBag, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useLocation } from "../context/LocationContext";

export function Layout({ children, onOpenLocation }: { children: React.ReactNode; onOpenLocation: () => void }) {
  const { user, logout } = useAuth();
  const { itemCount, setDrawerOpen } = useCart();
  const { place } = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    navigate(query.trim() ? `/restaurants?q=${encodeURIComponent(query.trim())}` : "/restaurants");
    setQuery("");
  }

  return (
    <div className="app">
      <header className="topbar sticky-top">
        <Link className="brand" to="/" aria-label="Ramnagar Eats home">
          <span className="brand-mark" aria-hidden="true">🍛</span>
          <span className="brand-name">RAMNAGAR <b>EATS</b></span>
        </Link>
        <button className="location-button" onClick={onOpenLocation} aria-label="Change delivery location">
          <MapPin size={17} />
          <span>
            <small>DELIVERING TO</small>
            {place?.label ?? "Set your location"}
          </span>
        </button>
        <form className="nav-search" onSubmit={submitSearch} role="search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for restaurants, dishes…" aria-label="Search restaurants" />
        </form>
        <div className="header-actions">
          <button className="search-icon mobile-search" onClick={() => navigate("/restaurants")} aria-label="Search restaurants">
            <Search size={19} />
          </button>
          <div className="account-wrap">
            {user ? (
              <>
                <button className="account account--user" onClick={() => setMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={menuOpen}>
                  <UserRound size={15} /> {user.name.split(" ")[0]}
                </button>
                {menuOpen && (
                  <div className="account-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                    <p className="account-menu-name">{user.name}</p>
                    <p className="account-menu-email">{user.phone ?? user.email}</p>
                    <Link to="/profile" role="menuitem">My profile</Link>
                    <Link to="/orders" role="menuitem">My orders</Link>
                    <Link to="/addresses" role="menuitem">My addresses</Link>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        void logout().then(() => navigate("/"));
                      }}
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link className="account" to="/login">
                Sign in
              </Link>
            )}
          </div>
          <button className="bag" onClick={() => setDrawerOpen(true)} aria-label={`Open cart, ${itemCount} items`}>
            <ShoppingBag size={18} />
            {itemCount > 0 && <b>{itemCount}</b>}
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

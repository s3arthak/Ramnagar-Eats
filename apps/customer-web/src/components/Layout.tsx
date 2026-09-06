import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ClipboardList, House, LogOut, MapPin, ReceiptText, Search, ShoppingBag, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useLocation } from "../context/LocationContext";

export function Layout({ children, onOpenLocation }: { children: React.ReactNode; onOpenLocation: () => void }) {
  const { user, logout } = useAuth();
  const { itemCount, setDrawerOpen } = useCart();
  const { place } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <header className="topbar sticky-top">
        <Link className="brand" to="/" aria-label="Ramnagar Eats home">
          <img className="brand-logo" src="/logo.svg" alt="Ramnagar Eats" width="36" height="36" />
          <span className="brand-name">RAMNAGAR <b>EATS</b></span>
        </Link>
        <button className="location-button" onClick={onOpenLocation} aria-label="Change delivery location">
          <MapPin size={17} />
          <span>
            <small>DELIVERING TO</small>
            {place?.label ?? "Set location"}
          </span>
        </button>
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
                <UserRound size={14} /> Sign in
              </Link>
            )}
          </div>
          <button className="bag" onClick={() => setDrawerOpen(true)} aria-label={`Open cart, ${itemCount} items`}>
            <ShoppingBag size={18} />
            {itemCount > 0 && <b>{itemCount}</b>}
          </button>
        </div>
      </header>
      <main>
        {children}
      </main>
      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <img className="brand-logo" src="/logo.svg" alt="Ramnagar Eats" width="44" height="44" />
            <strong>RAMNAGAR <b>EATS</b></strong>
            <p>Local food from independent kitchens, delivered fast to your door.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <Link to="/restaurants">Browse restaurants</Link>
            <Link to="/orders">Track an order</Link>
            <Link to="/profile">My profile</Link>
            <Link to="/addresses">Saved addresses</Link>
          </nav>
          <div className="footer-support">
            <strong>Need help?</strong>
            <p>Reach out to the restaurant directly from your order page — or check the order status live on the tracking map.</p>
            <p className="footer-small">Orders are packed with ❤ by local kitchens in your neighbourhood.</p>
          </div>
        </div>
        <p className="footer-bottom">© {new Date().getFullYear()} Ramnagar Eats · Delivering happiness, one meal at a time.</p>
      </footer>
      <BottomNav cartCount={itemCount} onOpenCart={() => setDrawerOpen(true)} />
    </div>
  );
}

/** Mobile bottom navigation — Swiggy-style tab bar. */
function BottomNav({ cartCount, onOpenCart }: { cartCount: number; onOpenCart: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        <House size={21} /> Food
      </NavLink>
      <NavLink to="/restaurants" className={({ isActive }) => (isActive ? "active" : "")}>
        <Search size={21} /> Search
      </NavLink>
      <NavLink to="/orders" className={({ isActive }) => (isActive ? "active" : "")}>
        <ClipboardList size={21} /> Orders
      </NavLink>
      <button onClick={onOpenCart} aria-label={`Open cart, ${cartCount} items`}>
        <ShoppingBag size={21} />
        Cart
        {cartCount > 0 && <span className="bn-count">{cartCount}</span>}
      </button>
      <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
        <ReceiptText size={21} /> Account
      </NavLink>
    </nav>
  );
}

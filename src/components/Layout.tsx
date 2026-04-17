import { NavLink, Outlet, useLocation } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ToastProvider";

export function Layout() {
  // Key the error boundary by the current location so navigating to a
  // different route (or back to the same route via a fresh entry) remounts
  // it and clears any prior caught error. Without this, a single broken
  // page would trap the whole app behind the fallback since Layout itself
  // stays mounted across client-side navigations.
  const location = useLocation();
  return (
    <ToastProvider>
      <div className="app">
        <header className="app-header">
          <h1 className="app-title">Logos</h1>
          <nav className="app-nav" aria-label="Main">
            <NavLink to="/" end className={navClass}>
              Home
            </NavLink>
            <NavLink to="/categories" className={navClass}>
              Categories
            </NavLink>
            <NavLink to="/images" className={navClass}>
              Images
            </NavLink>
            <NavLink to="/authors" className={navClass}>
              Authors
            </NavLink>
            <NavLink to="/quotes" className={navClass}>
              Quotes
            </NavLink>
            <NavLink to="/tags" className={navClass}>
              Tags
            </NavLink>
          </nav>
        </header>
        <main className="app-main">
          <ErrorBoundary key={location.key}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </ToastProvider>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

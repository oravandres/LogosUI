import { NavLink, Outlet } from "react-router";

export function Layout() {
  return (
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
        <Outlet />
      </main>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

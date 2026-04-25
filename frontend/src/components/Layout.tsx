import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "../lib/auth";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm ${
    isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"
  }`;

export default function Layout() {
  const nav = useNavigate();
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-white border-r border-slate-200 p-3 flex flex-col gap-1">
        <div className="px-3 py-3 font-semibold text-slate-900">
          Data Platform
        </div>
        <NavLink to="/sources" className={linkClass}>
          Sources
        </NavLink>
        <NavLink to="/upload" className={linkClass}>
          Upload
        </NavLink>
        <NavLink to="/api-keys" className={linkClass}>
          API Keys
        </NavLink>
        <div className="flex-1" />
        <button
          onClick={() => {
            clearToken();
            nav("/login");
          }}
          className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 text-left"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

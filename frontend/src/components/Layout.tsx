import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "../lib/auth";
import {
  DatabaseIcon,
  KeyIcon,
  LogoutIcon,
  PulseIcon,
  UploadIcon,
} from "./icons";

const nav = [
  { to: "/sources", label: "Sources", icon: DatabaseIcon },
  { to: "/upload", label: "Upload", icon: UploadIcon },
  { to: "/api-keys", label: "API Keys", icon: KeyIcon },
];

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-violet-600/20 text-white"
      : "text-slate-400 hover:text-white hover:bg-white/5",
  ].join(" ");
}

export default function Layout() {
  const navigate = useNavigate();
  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-60 shrink-0 flex flex-col bg-slate-900 text-slate-200">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
            <PulseIcon width={18} height={18} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">DataScope</div>
            <div className="text-[11px] text-slate-400">Data Platform</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navClass}>
              <Icon width={18} height={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            onClick={() => {
              clearToken();
              navigate("/login");
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogoutIcon width={18} height={18} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

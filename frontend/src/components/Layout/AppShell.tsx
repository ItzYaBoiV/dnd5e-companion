import { useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Users, Menu, X, Shield, Swords, Map, Skull } from "lucide-react";
import DmPlayTvNavCompact from "@/components/Layout/DmPlayTvNavCompact";
import { useUIStore } from "@/store/uiStore";
import { clsx } from "clsx";

const NAV = [
  { to: "/characters", icon: Users, label: "Characters", shortLabel: "Chars", description: "Create and edit player characters." },
  { to: "/play", icon: Swords, label: "Play (DM)", shortLabel: "Play", description: "Map, party, battle map, and rolls." },
  { to: "/dungeons", icon: Map, label: "Map Library", shortLabel: "Library", description: "Author and save maps for re-use." },
  { to: "/monsters", icon: Skull, label: "Monsters", shortLabel: "Monsters", description: "Browse the monster compendium." },
  { to: "/reference/spells", icon: BookOpen, label: "Reference", shortLabel: "Ref", description: "Spells, rules, and quick reference." },
] as const;

function routeIsActive(pathname: string, to: string): boolean {
  if (to.startsWith("/reference")) return pathname.startsWith("/reference");
  if (to === "/characters") return pathname.startsWith("/characters");
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function AppShell() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setSidebarOpen(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [setSidebarOpen]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-dnd-darker flex-col md:flex-row [--header-h:6.25rem] [--bottom-nav-h:4.75rem] md:[--bottom-nav-h:0px]">
      <aside
        className={clsx(
          "hidden md:flex flex-col bg-dnd-dark border-r border-dnd-border/60 transition-all duration-200 flex-shrink-0 z-40",
          sidebarOpen ? "w-52" : "w-14",
        )}
      >
        <div className="flex items-center gap-3 px-3 py-4 border-b border-gray-800">
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {sidebarOpen && (
            <button
              type="button"
              onClick={() => navigate("/characters")}
              className="flex items-center gap-2 text-dnd-gold font-display font-bold text-base tracking-wide"
            >
              <Shield size={18} className="text-dnd-red" />
              D&amp;D 5e
            </button>
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {NAV.map(({ to, icon: Icon, label, description }) => (
              <NavLink
                key={to}
                to={to}
                title={description}
                className={() =>
                  clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors",
                    routeIsActive(pathname, to)
                      ? "bg-dnd-red text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800",
                  )
                }
              >
                <Icon size={17} className="flex-shrink-0" />
                {sidebarOpen && <span className="font-display text-sm font-semibold tracking-wide">{label}</span>}
              </NavLink>
            ))}
          </nav>
          {sidebarOpen && routeIsActive(pathname, "/play") && (
            <div className="shrink-0 border-t border-gray-800 px-2 py-2">
              <DmPlayTvNavCompact />
            </div>
          )}
        </div>

        {sidebarOpen && (
          <div className="shrink-0 border-t border-gray-800 p-3">
            <p className="text-xs text-gray-600 font-display">d20madjd.quest</p>
            <p className="text-xs text-gray-700">D&amp;D 5e Companion</p>
          </div>
        )}
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] [scroll-padding-bottom:5.5rem] md:pb-0 md:[scroll-padding-bottom:0]"
        >
          <Outlet />
        </div>
      </main>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around gap-0.5 border-t border-gray-800 bg-dnd-dark/95 backdrop-blur-md px-1 pt-1"
        style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom, 0px))" }}
        aria-label="Main navigation"
      >
        {NAV.map(({ to, icon: Icon, shortLabel, description }) => {
          const active = routeIsActive(pathname, to);
          return (
            <NavLink
              key={to}
              to={to}
              title={description}
              className={clsx(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors touch-manipulation",
                active ? "bg-dnd-red text-parchment" : "text-stone-400 active:bg-dnd-panel",
              )}
            >
              <Icon size={20} className="flex-shrink-0" strokeWidth={active ? 2.25 : 2} />
              <span className="max-w-full truncate px-0.5 text-center font-display text-[0.65rem] font-semibold leading-tight tracking-wide">
                {shortLabel}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

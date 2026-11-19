"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ClipboardList, ListChecks, Users, Cog, Package, FileBarChart, Settings, Factory,
  ListOrdered, CalendarDays, TrendingUp, Receipt, X, UserRound, ShoppingCart, Wallet, Landmark, BarChart3, Gauge, Layers, CalendarRange, HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups = [
  { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Sales",
    items: [
      { href: "/clients", label: "Clients", icon: UserRound },
      { href: "/orders", label: "Orders", icon: ShoppingCart },
      { href: "/payments", label: "Payments", icon: Wallet },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/finance", label: "Finance", icon: Landmark },
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Production",
    items: [
      { href: "/production", label: "Production Count", icon: ClipboardList },
      { href: "/production/logs", label: "Production Logs", icon: ListChecks },
      { href: "/daily", label: "Daily", icon: CalendarDays },
      { href: "/production/calendar", label: "Production Calendar", icon: CalendarRange },
      { href: "/production/queue", label: "Production Queue", icon: ListOrdered },
      { href: "/production/overview", label: "Floor Overview", icon: Gauge },
      { href: "/income", label: "Production Value", icon: TrendingUp },
      { href: "/reports", label: "Production Reports", icon: FileBarChart },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/workers", label: "Workers", icon: Users },
      { href: "/salary", label: "Salary", icon: HandCoins },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/machines", label: "Machines", icon: Cog },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
const allItems = groups.flatMap((g) => g.items);

// A link is active when the path matches it, unless a more specific nav entry
// matches better (so "Production Count" isn't lit up while on "Production Logs").
function isActive(pathname, href) {
  if (!pathname) return false;
  const matches = (h) => pathname === h || pathname.startsWith(h + "/");
  if (!matches(href)) return false;
  return !allItems.some((o) => o.href !== href && o.href.length > href.length && matches(o.href));
}

function Sidebar({ open, onClose }) {
  const pathname = usePathname();
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-steel-950/50 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-steel-200 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          "dark:border-steel-700 dark:bg-steel-900",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-instrument-600 text-white">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-sm font-bold leading-tight text-steel-800 dark:text-steel-50">Business</p>
              <p className="text-[11px] leading-tight text-steel-400">Control Panel</p>
            </div>
          </div>
          <button onClick={onClose} className="text-steel-400 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-steel-400">{g.title}</p>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-gauge-50 text-instrument-700 dark:bg-instrument-600/20 dark:text-gauge-300"
                          : "text-steel-500 hover:bg-steel-100 hover:text-steel-800 dark:text-steel-400 dark:hover:bg-steel-800 dark:hover:text-steel-100"
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px]", active && "text-gauge-500")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-steel-100 px-5 py-3 dark:border-steel-700">
          <p className="flex items-center gap-1.5 text-[11px] text-steel-400"><Layers className="h-3 w-3" /> v2.0 · Business Control Panel</p>
        </div>
      </aside>
    </>
  );
}
export { Sidebar };

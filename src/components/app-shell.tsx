import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  BarChart3,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  Package,
  Plus,
  Scissors,
  Settings2,
  Users,
  Wallet,
} from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { allStockTotal, formatCompact, formatNum } from "@/lib/format";
import { cloudLabel, startCloudSync, useCloud } from "@/lib/sync";
import { useWarehouse } from "@/lib/store";
import { totalDebt } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Главная", icon: LayoutDashboard },
  { to: "/stock", label: "Склад", icon: Package },
  { to: "/orders", label: "Заказы", icon: ClipboardList },
  { to: "/clients", label: "Клиенты", icon: Users },
] as const;

const MORE = [
  { to: "/boxes", label: "Коробки", icon: Archive },
  { to: "/cash", label: "Касса", icon: Wallet },
  { to: "/workers", label: "Работники", icon: HardHat },
  { to: "/preorder", label: "Предзаказ", icon: Scissors },
  { to: "/reports", label: "Отчёты", icon: BarChart3 },
  { to: "/finance", label: "Финансы", icon: Settings2 },
] as const;

function isMorePath(pathname: string) {
  return (
    pathname.startsWith("/boxes") ||
    pathname.startsWith("/cash") ||
    pathname.startsWith("/workers") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/preorder") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/more")
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const stock = useWarehouse((s) => s.stock);
  const { isPending } = useCurrentUserState();
  const cloud = useCloud();
  useEffect(() => {
    startCloudSync();
  }, []);
  const pairs = allStockTotal(stock);
  const debt = totalDebt(useWarehouse.getState());

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="px-5 py-6">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            HELIOUS
          </Link>
          <div className="mt-4 font-mono text-xs text-muted tabular">
            {formatNum(pairs)} пар
            {debt > 0 ? <span className="mt-0.5 block text-danger">долг {formatCompact(debt)}</span> : null}
          </div>
          <div className="mt-2 text-xs text-subtle">{cloudLabel(cloud.status)}</div>
          <Button asChild className="mt-4 w-full" size="sm">
            <Link to="/orders/new">
              <Plus className="size-4" />
              Новый заказ
            </Link>
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {[...NAV, ...MORE].map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-sm",
                  active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated/70 hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4 text-sm">
          {isPending ? (
            <div className="h-8 w-28 animate-pulse rounded-md bg-elevated" />
          ) : (
            <>
              <SignedIn>
                <UserButton />
              </SignedIn>
              <SignedOut>
                <Link to="/login" className="text-muted hover:text-fg">
                  Войти
                </Link>
              </SignedOut>
            </>
          )}
        </div>
      </aside>

      <main className="pb-32 lg:ml-60 lg:pb-10">
        <div className="mx-auto max-w-4xl px-4 pt-5 pb-4 lg:px-8 lg:pt-8 lg:pb-8">{children}</div>
      </main>

      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 tab-dock lg:hidden">
        <div className="pointer-events-auto mx-auto flex max-w-md items-center rounded-full bg-surface/95 px-1 py-1 shadow-float backdrop-blur-xl">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-xs transition-colors duration-150",
                  active ? "text-accent" : "text-subtle",
                )}
              >
                <Icon className="size-4" strokeWidth={active ? 2.1 : 1.6} />
                <span className={active ? "font-medium" : "font-normal"}>{item.label}</span>
              </Link>
            );
          })}
          <Link
            to="/more"
            className={cn(
              "flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-xs transition-colors duration-150",
              isMorePath(pathname) ? "text-accent" : "text-subtle",
            )}
          >
            <BarChart3 className="size-4" strokeWidth={isMorePath(pathname) ? 2.1 : 1.6} />
            <span className={isMorePath(pathname) ? "font-medium" : "font-normal"}>Ещё</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

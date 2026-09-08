import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/_app")({
  component: ProtectedApp,
});

function ProtectedApp() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg text-sm text-muted">
        Проверяем вход…
      </main>
    );
  }

  if (!user) return <RedirectToSignIn />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <div className="text-sm font-semibold tracking-tight">HELIOUS</div>
          <p className="mt-3 text-sm text-muted">Войдите, чтобы синхронизировать сессию. Данные склада хранятся на этом устройстве.</p>
        </div>
        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Продолжить с {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Вход отключён.</p>
        )}
        <Link to="/" className="block text-center text-sm text-muted hover:text-fg">
          Продолжить без входа
        </Link>
      </div>
    </main>
  );
}

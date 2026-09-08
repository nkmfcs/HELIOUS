import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  emailPasswordEnabled,
  signIn as signInSocial,
  socialAuthEnabled,
} from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const Route = createFileRoute("/login")({ component: Login });

type AuthMode = "sign-in" | "sign-up";

function Login() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              name: name.trim(),
              email: email.trim(),
              password,
              callbackURL: "/",
            })
          : await authClient.signIn.email({
              email: email.trim(),
              password,
              callbackURL: "/",
            });
      if (result.error) throw new Error(result.error.message ?? "Не удалось войти");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти");
      setPending(false);
    }
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-10 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <div className="text-sm font-semibold tracking-tight">HELIOUS</div>
          <h1 className="mt-3 text-2xl font-semibold">
            {mode === "sign-in" ? "Вход" : "Создать аккаунт"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Войдите, чтобы склад автоматически сохранялся в облаке и был одинаковым на всех
            устройствах.
          </p>
        </div>

        {authEnabled && emailPasswordEnabled ? (
          <form className="space-y-4" onSubmit={(event) => void submitEmail(event)}>
            {mode === "sign-up" ? (
              <div>
                <Label htmlFor="name">Имя</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  disabled={pending}
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div>
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={pending}
              />
              {mode === "sign-up" ? (
                <p className="mt-1.5 text-xs text-subtle">Минимум 8 символов</p>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending
                ? "Подождите…"
                : mode === "sign-in"
                  ? "Войти"
                  : "Создать аккаунт"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted hover:text-fg"
              onClick={() => selectMode(mode === "sign-in" ? "sign-up" : "sign-in")}
              disabled={pending}
            >
              {mode === "sign-in" ? "Нет аккаунта? Создать" : "Уже есть аккаунт? Войти"}
            </button>
          </form>
        ) : null}

        {authEnabled && socialAuthEnabled ? (
          <div className="space-y-2">
            {emailPasswordEnabled ? (
              <div className="flex items-center gap-3 py-1 text-xs text-subtle">
                <span className="h-px flex-1 bg-border" />
                или
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            {GROK_PROVIDERS.map((provider) => (
              <Button
                key={provider.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signInSocial(provider.providerId, { callbackURL: "/" })}
              >
                Продолжить с {provider.label}
              </Button>
            ))}
          </div>
        ) : null}

        {!authEnabled ? <p className="text-sm text-muted">Вход отключён.</p> : null}

        {!authEnabled ? (
          <Link to="/" className="block text-center text-sm text-muted hover:text-fg">
            Открыть локальную версию
          </Link>
        ) : null}
      </div>
    </main>
  );
}

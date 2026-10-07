import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { authEnabled, signOut } from "./client";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

/**
 * Компоненты состояния авторизации — обёртки над `useCurrentUserState()`.
 * Пока сессия загружается, они ничего не рисуют, чтобы не мигал экран входа.
 */

/** Куда `RedirectToSignIn` отправляет не вошедших. */
const SIGN_IN_PATH = "/login";

/** Показывает children, только когда есть пользователь (сессия или dev-пользователь). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

/** Показывает children, только когда точно известно, что пользователь не вошёл. */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

/**
 * Клиентский редирект на экран входа (`<Navigate>`, а не перезагрузка страницы —
 * иначе SPA запускается заново и снова грузит сессию). Сначала дождитесь `isPending`.
 */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

/** Имя вошедшего пользователя и кнопка выхода (выход — только при включённой авторизации). */
export function UserButton() {
  const user = useCurrentUser();
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Аккаунт";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-medium">{label}</span>
      {authEnabled && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline"
        >
          Выйти
        </button>
      )}
    </div>
  );
}

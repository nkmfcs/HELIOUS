import { authClient, authEnabled } from "./client";

/** Единый вид пользователя в приложении — с авторизацией и без неё. */
type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** True для dev-пользователя (авторизация выключена). */
  isDevFallback: boolean;
};

/**
 * Запасной пользователь, только при `VITE_AUTH_ENABLED=false`. Его id совпадает
 * с тем, что возвращает `verify.server.ts`, поэтому данные принадлежат одному владельцу.
 */
const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

type CurrentUserState = {
  /** Пользователь; `null` и пока сессия загружается, и когда вход не выполнен. */
  user: AppUser | null;
  /** True, пока сессия определяется — `user: null` ещё не значит «не вошёл». */
  isPending: boolean;
};

/**
 * Текущий пользователь и состояние загрузки.
 *   - Авторизация включена -> настоящий пользователь из Better Auth `useSession()`.
 *   - Выключена (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, без ожидания.
 *
 * Защищая маршрут, дождитесь `isPending`: редирект по одному `user: null`
 * выкидывает вошедшего пользователя на экран входа при каждой перезагрузке.
 *
 *   const { user, isPending } = useCurrentUserState();
 *   if (isPending) return null;
 *   if (!user) return <RedirectToSignIn />;
 *
 * `authEnabled` — константа модуля, поэтому порядок хуков стабилен.
 */
export function useCurrentUserState(): CurrentUserState {
  if (!authEnabled) return { user: DEV_USER, isPending: false };
  const { data, isPending } = authClient.useSession();
  const user = data?.user;
  return {
    user: user
      ? {
          id: user.id,
          displayName: user.name ?? null,
          primaryEmail: user.email ?? null,
          profileImageUrl: user.image ?? null,
          isDevFallback: false,
        }
      : null,
    isPending,
  };
}

/**
 * Пользователь для отображения. `null` значит «загрузка или не вошёл»; для
 * редиректов используйте `useCurrentUserState()`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}

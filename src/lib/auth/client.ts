import { createAuthClient } from "better-auth/react";

/**
 * Клиент Better Auth для браузера. Обращается к `/api/auth/*` того же origin;
 * сессия живёт в cookie, токены вручную не передаются.
 */
export const authClient = createAuthClient();

/** Вход по email и паролю включён в этой сборке клиента. */
export const emailPasswordEnabled = import.meta.env.VITE_EMAIL_PASSWORD_ENABLED === "true";

/**
 * True, когда нужен экран входа и облачное хранение привязано к аккаунту.
 * Выключается `VITE_AUTH_ENABLED=false` или отсутствием способа входа.
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false" && emailPasswordEnabled;

/** Выход из аккаунта и переход на `redirectTo`. */
export async function signOut(redirectTo = "/"): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    window.location.href = redirectTo;
  }
}

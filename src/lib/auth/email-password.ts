/**
 * Вход по email и паролю (аккаунты хранятся в базе этого приложения).
 *
 * По умолчанию выключен. В продакшене включается `AUTH_EMAIL_PASSWORD_ENABLED=true`;
 * клиентский флаг сборки — `VITE_EMAIL_PASSWORD_ENABLED=true`.
 */
export const emailAndPasswordEnabled =
  process.env.AUTH_EMAIL_PASSWORD_ENABLED?.trim().toLowerCase() === "true";

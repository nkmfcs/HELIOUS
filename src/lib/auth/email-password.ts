/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Off by default in the sandbox. Production deployments can enable it with
 * `AUTH_EMAIL_PASSWORD_ENABLED=true`; the matching client-side build flag is
 * `VITE_EMAIL_PASSWORD_ENABLED=true`.
 */
export const emailAndPasswordEnabled =
  process.env.AUTH_EMAIL_PASSWORD_ENABLED?.trim().toLowerCase() === "true";

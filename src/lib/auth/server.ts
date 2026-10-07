/**
 * Better Auth для HELIOUS (только сервер).
 *
 * Авторизация работает на `/api/auth/*` этого же приложения, сессионная cookie
 * живёт на собственном домене. Единственный способ входа — email и пароль
 * (включается переменной `AUTH_EMAIL_PASSWORD_ENABLED`, см. `./email-password`).
 *
 * Режимы:
 *   - Продакшен (Railway): `DATABASE_URL` указывает на Neon, сессии и аккаунты
 *     лежат в Postgres.
 *   - Локальная разработка без `DATABASE_URL`: встроенный PGLite, секрет
 *     генерируется на время жизни процесса.
 *   - `VITE_AUTH_ENABLED=false`: авторизация выключена, серверные функции
 *     работают от dev-пользователя (см. `verify.server.ts`).
 *
 * Не импортировать из клиентского кода — модуль тянет `pg` и серверные части
 * Better Auth. Клиент использует `@/lib/auth/client`, компоненты —
 * `@/lib/auth/use-current-user`, серверные функции — `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { pgliteDialect } from "./pglite-dialect";

// Запускаем (и разделяем) инициализацию PGLite сразу при загрузке модуля.
void ensureDbReady();

/**
 * Секрет без BETTER_AUTH_SECRET (только локальная разработка) хранится на
 * `globalThis`: при HMR модуль перезагружается, и новый секрет разлогинил бы
 * все сессии в PGLite.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __heliousDevAuthSecret__?: string;
};
function devAuthSecret(): string {
  globalAuthRef.__heliousDevAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__heliousDevAuthSecret__;
}

/** Читает переменную окружения; пустая строка считается «не задана». */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

/** Явный выключатель: `VITE_AUTH_ENABLED=false` отключает авторизацию целиком. */
const authDisabled = env("VITE_AUTH_ENABLED") === "false";

/** True, когда включён хотя бы один способ входа (авторизация обязательна). */
export const authConfigured = !authDisabled && emailAndPasswordEnabled;

const explicitBaseURL = env("BETTER_AUTH_URL");

// Локальный `npm run dev` (порт 8080). Браузер может прислать Origin с любым из
// этих адресов — если доверять только `localhost`, `127.0.0.1` упадёт с
// "Invalid origin".
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];

const baseURL = explicitBaseURL ?? {
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};

// Origin'ы, которым Better Auth доверяет при POST с cookie (регистрация, вход).
// Недостающий адрес приводит к FORBIDDEN "Invalid origin".
const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
  : LOCAL_DEV_ORIGINS;

const databaseUrl = env("DATABASE_URL");

// Neon (Postgres) при заданном `DATABASE_URL`, иначе встроенный PGLite через
// Kysely-диалект. Схема Better Auth — `migrations/0001_auth.sql`.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/**
 * Имена cookie сохранены от прежней версии приложения: если их переименовать,
 * все пользователи один раз выйдут из аккаунта.
 */
export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

export const auth = betterAuth({
  baseURL,
  secret: env("BETTER_AUTH_SECRET") ?? devAuthSecret(),
  database,
  trustedOrigins,

  // Сессия кэшируется в короткоживущей подписанной cookie `session_data`:
  // чтение сессии (`/get-session`) не ходит в БД, интерфейс меньше мигает.
  session: { cookieCache: { enabled: true, maxAge: 300 } },

  // Вход по email и паролю — включается только через `./email-password`.
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),

  // Cookie с префиксом `__Host-`: браузер отвергает такие cookie с атрибутом
  // `Domain`, поэтому их нельзя подбросить с соседнего поддомена. Префикс
  // требует Secure + Path=/, поэтому автопрефикс Better Auth (`__Secure-`)
  // отключаем и задаём имена и атрибуты сами. Secure-cookie работают и на
  // `http://localhost`.
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-grok-auth.session_data" },
      account_data: { name: "__Host-grok-auth.account_data" },
      dont_remember: { name: "__Host-grok-auth.dont_remember" },
    },
  },

  // `tanstackStartCookies` передаёт Set-Cookie из Better Auth в ответы
  // TanStack Start. Должен стоять последним.
  plugins: [tanstackStartCookies()],
});

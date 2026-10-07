import { getRequest } from "@tanstack/react-start/server";
import { auth, authConfigured } from "./server";

/**
 * Определение пользователя на сервере (только сервер).
 *
 * Better Auth работает на `/api/auth/*` этого же приложения, поэтому сессионная
 * cookie приходит с каждым запросом — и в серверные функции, и в SSR. Пользователь
 * определяется по cookie через `auth.api.getSession`. Id пользователя от клиента
 * никогда не принимается на веру.
 */

/** True, когда сервер подключён к реальной базе данных. */
const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

/** Повторный экспорт, чтобы не импортировать `server.ts` ради одного флага. */
export { authConfigured };

if (databaseConfigured && !authConfigured) {
  console.error(
    "[auth] DATABASE_URL задан, но авторизация выключена (VITE_AUTH_ENABLED=false " +
      "или не включён вход по email/паролю) — requireUserId() будет отклонять все " +
      "запросы, а не отдавать одного dev-пользователя на реальной базе.",
  );
}

/** Id dev-пользователя; используется только при выключенной авторизации. */
const DEV_USER_ID = "dev-user";

/**
 * Бросается из `requireUserId`, когда у запроса нет действующей сессии.
 * Несёт `status: 401`; текст "Unauthorized" — стабильный контракт, по нему
 * клиент отправляет пользователя на экран входа.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** Вошедший пользователь текущего запроса или `null`. */
async function getSessionUser(): Promise<{ id: string; email: string | null } | null> {
  if (!authConfigured) return null;
  const request = getRequest();
  if (!request) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

/**
 * Id пользователя для серверной функции или ошибка, если доступа нет.
 * Лучше использовать `authMiddleware` (`./middleware`) — он вызывает это сам.
 * - Авторизация включена -> id вошедшего пользователя, иначе `UnauthorizedError`.
 * - Выключена + задан `DATABASE_URL` -> ошибка (fail closed): общий dev-пользователь
 *   на реальной базе дал бы каждому посетителю доступ к чужим данным.
 * - Выключена + нет базы -> dev-пользователь.
 */
export async function requireUserId(): Promise<string> {
  if (!authConfigured) {
    if (databaseConfigured) {
      throw new Error(
        "Авторизация выключена, но задан DATABASE_URL — отказ работать от общего " +
          "dev-пользователя на реальной базе данных.",
      );
    }
    return DEV_USER_ID;
  }
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

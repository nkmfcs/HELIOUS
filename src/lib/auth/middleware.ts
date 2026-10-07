import { createMiddleware } from "@tanstack/react-start";

/**
 * Middleware для серверных функций — стандартный способ получить проверенный id
 * пользователя. Сессионная cookie того же origin уходит на сервер автоматически.
 *
 *   export const listItems = createServerFn({ method: "GET" })
 *     .middleware([authMiddleware])
 *     .handler(async ({ context }) => {
 *       const sql = await getSql();
 *       return sql`select * from items where user_id = ${context.userId}`;
 *     });
 *
 * Нет сессии -> `UnauthorizedError` (см. `verify.server.ts`). Только при
 * `VITE_AUTH_ENABLED=false` подставляется dev-пользователь. Подключайте к каждой
 * серверной функции, работающей с данными пользователя, и фильтруйте запросы
 * по `context.userId`.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // Импортировать здесь только `*.server`-модули: файл общий для клиента и
  // сервера, иначе `@tanstack/react-start/server` попадёт в браузерный бандл.
  const { assertSameSiteRequest } = await import("./isolation.server");
  const { requireUserId } = await import("./verify.server");
  // Скриптовые межсайтовые запросы отсекаем до обращения к данным.
  assertSameSiteRequest();
  const userId = await requireUserId();
  return next({ context: { userId } });
});

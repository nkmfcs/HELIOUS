import { getRequest } from "@tanstack/react-start/server";

/**
 * Защита по Fetch-Metadata — **только сервер** (суффикс `.server.ts`).
 *
 * Суффикс `.server` обязателен: файл импортирует `@tanstack/react-start/server`
 * (`getRequest` -> Node `AsyncLocalStorage`). Без суффикса Vite отдаст его в
 * браузер, и приложение упадёт с `AsyncLocalStorage is not a constructor`.
 *
 * Cookie `SameSite=Lax` уходит и на same-site подзапросы, поэтому сторонний
 * сайт на том же домене мог бы скриптом (fetch/XHR/форма) обращаться к серверным
 * функциям от имени вошедшего пользователя. Разрешаем только:
 * запросы того же origin (клиент приложения), запросы не из браузера (SSR и
 * server-to-server — без `Sec-Fetch-Site`) и переходы верхнего уровня по GET
 * (обычная загрузка страниц). Остальные cross-site и same-site скриптовые
 * запросы отклоняются. Проверка выполняется в `authMiddleware`.
 */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/** Throw `CrossSiteRequestError` for a scripted cross-site/sibling request. */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return; // нет контекста запроса (например, сборка) — защищать нечего
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  // Клиент не из браузера (нет заголовка), свой origin или прямой переход
  // (адресная строка, закладка) — разрешены.
  if (!site || site === "same-origin" || site === "none") return;
  // Переход верхнего уровня по GET допустим даже cross-site; скриптовые запросы
  // режим navigate не используют.
  const dest = h.get("sec-fetch-dest");
  const isTopLevelGet =
    h.get("sec-fetch-mode") === "navigate" &&
    request.method === "GET" &&
    dest !== "object" &&
    dest !== "embed";
  if (isTopLevelGet) return;
  throw new CrossSiteRequestError();
}

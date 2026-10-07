import type { ReactNode } from "react";

/**
 * Единая точка монтирования клиентских провайдеров (`src/routes/__root.tsx`).
 * Клиент Better Auth не требует контекста, поэтому сейчас это просто passthrough.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

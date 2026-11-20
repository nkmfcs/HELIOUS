import { toast } from "sonner";
import { formatSum } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import type { Order } from "@/lib/types";

/** Спрашивает подтверждение и удаляет заказ. Возвращает true, если удалён. */
export function confirmDeleteOrder(order: Order): boolean {
  let text: string;
  if (order.status === "cancelled") {
    text =
      "Удалить отменённый заказ из списка? Пары уже вернулись на склад при отмене — склад не изменится.";
  } else if (order.status === "assembling") {
    text = "Удалить сборку? Склад не списывался — ничего не меняется.";
  } else {
    text = `Удалить заказ? ${order.totalPairs} пар вернутся на склад.`;
    if (order.paidSum > 0)
      text += ` Оплата ${formatSum(order.paidSum)} будет записана как возврат клиенту.`;
  }
  if (!confirm(text)) return false;

  const result = useWarehouse.getState().deleteOrder(order.id);
  if (!result.ok) {
    toast(
      result.reason === "invalid_history"
        ? "Старый заказ без состава по размерам — его нельзя удалить с возвратом на склад."
        : "Заказ не найден",
    );
    return false;
  }
  toast(
    result.returned
      ? `Заказ удалён: ${result.returned} пар вернулись на склад${result.refunded ? `, возврат ${formatSum(result.refunded)}` : ""}`
      : "Заказ удалён",
  );
  return true;
}

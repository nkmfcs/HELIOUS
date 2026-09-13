import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatNum } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import type { Payable } from "@/lib/types";

export function WorkerAccrualEditor({ entry, onClose }: { entry: Payable; onClose: () => void }) {
  const id = useId();
  const [amount, setAmount] = useState(String(entry.amount));
  const [date, setDate] = useState(entry.date);
  const [note, setNote] = useState(entry.note);
  const [error, setError] = useState<string | null>(null);
  const updateAccrual = useWarehouse((state) => state.updateWorkerAccrual);

  return (
    <form
      aria-label="Редактирование начисления"
      className="space-y-3 border-t border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const result = updateAccrual(
          entry.id,
          { amount: Number(amount.replace(/\s/g, "").replace(",", ".")), date, note },
          entry,
        );
        setError(result);
        if (result) return;
        toast("Начисление обновлено");
        onClose();
      }}
    >
      <div className="text-sm font-medium">Редактирование начисления</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-amount`}>Полная сумма начисления, сум</Label>
          <Input
            id={`${id}-amount`}
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${id}-date`}>Дата начисления</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted">Уже выплачено: {formatNum(entry.paidSum)} сум</p>
      <div>
        <Label htmlFor={`${id}-note`}>За какую работу</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit">Сохранить</Button>
      </div>
    </form>
  );
}

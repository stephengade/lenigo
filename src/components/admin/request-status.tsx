"use client";

import { NativeSelect } from "@/components/form-field";
import { useApiAction } from "@/components/use-api-action";
import { api } from "@/lib/api";

const OPTIONS = [
  ["NEW", "New"],
  ["CONTACTED", "Contacted"],
  ["PROVISIONED", "Set up"],
  ["DECLINED", "Declined"],
] as const;

type Status = (typeof OPTIONS)[number][0];

export function RequestStatusSelect({ id, status }: { id: string; status: Status }) {
  const { pending, run } = useApiAction();
  return (
    <NativeSelect
      aria-label="Request status"
      className="h-9 w-auto min-w-32"
      value={status}
      disabled={pending}
      onChange={(e) => run(() => api.admin["community-requests"]({ id }).patch({ status: e.target.value as Status }), { success: "Updated" })}
    >
      {OPTIONS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </NativeSelect>
  );
}

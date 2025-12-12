import type { IsoDateTime } from "@/haven/model/enums";

export function nowIso(): IsoDateTime {
  return new Date().toISOString();
}


const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  earn: "Начисление",
  redeem: "Списание",
  adjustment: "Коррекция",
  expiration: "Сгорание"
};

const OFFER_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  active: "Активно",
  archived: "Архив"
};

export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type;
}

export function offerStatusLabel(status: string): string {
  return OFFER_STATUS_LABELS[status] ?? status;
}

export function sellerStatusLabel(isActive: boolean): string {
  return isActive ? "Активен" : "Уволен";
}

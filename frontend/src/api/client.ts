export type Role = "customer" | "seller" | "admin";

export type CustomerProfile = {
  id: number;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  balance_points: number;
  qr_token: string;
};

export type Transaction = {
  id: number;
  transaction_type: string;
  purchase_amount_minor: number;
  points_delta: number;
  balance_before: number;
  balance_after: number;
  comment: string | null;
  created_at: string;
};

export type SellerCustomer = {
  id: number;
  full_name: string;
  phone: string | null;
  balance_points: number;
  max_redeem_points: number | null;
};

export type LoyaltySettings = {
  earn_percent: number;
  max_redeem_percent: number;
  point_ttl_days: number;
  redeem_enabled: boolean;
  welcome_bonus_enabled: boolean;
  welcome_bonus_points: number;
};

export type SpecialOffer = {
  id: number;
  title: string;
  text: string;
  image_path: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

const API_BASE = "/api/v1";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function moneyFromMinor(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB"
  }).format(value / 100);
}

export function points(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function idempotencyKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

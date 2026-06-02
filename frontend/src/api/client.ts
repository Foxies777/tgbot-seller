export type Role = "customer" | "seller" | "admin";

export type CustomerRegisterResponse = {
  role: Role;
  id: number;
  access_code: string | null;
};

export type CustomerProfile = {
  id: number;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  balance_points: number;
  qr_token: string;
};

export type CustomerQr = {
  qr_token: string;
  short_code: string;
  expires_at: string;
  ttl_seconds: number;
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

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers: extraHeaders, ...rest } = options;
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        cache: "no-store",
        ...rest,
        headers: {
          "Content-Type": "application/json",
          ...(extraHeaders ?? {})
        }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new ApiError(formatApiError(text, response.status), response.status);
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError || attempt === maxAttempts || !isNetworkError(error)) {
        if (isNetworkError(error)) {
          throw new Error("Нет связи с сервером. Проверьте Wi‑Fi и обновите страницу.");
        }
        throw error;
      }
      await sleep(250 * attempt);
    }
  }

  throw lastError;
}

function formatApiError(text: string, status: number): string {
  try {
    const payload = JSON.parse(text) as { detail?: unknown };
    if (Array.isArray(payload.detail)) {
      const messages = payload.detail
        .map((item) => {
          if (typeof item === "object" && item !== null && "msg" in item) {
            return String((item as { msg: string }).msg);
          }
          return null;
        })
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join(". ");
      }
    }
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
  } catch {
    // Keep raw response text below.
  }
  return text || `Request failed: ${status}`;
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

/** Converts `<input type="datetime-local">` value to UTC ISO string for the API. */
export function datetimeLocalToUtc(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value) {
    throw new Error("Invalid datetime");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid datetime");
  }
  return parsed.toISOString();
}

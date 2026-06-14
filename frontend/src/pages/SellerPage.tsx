import { FormEvent, useRef, useState } from "react";

import { api, idempotencyKey, moneyFromMinor, points, SellerCustomer } from "../api/client";
import { Card, ErrorMessage, Field, Layout, SectionHead, StaffNav } from "../components/Layout";
import { QrScanner } from "../components/QrScanner";
import { isQrTokenLike, normalizeQrValue } from "../utils/qr";

type SellerTab = "customer" | "sale" | "register";

function ScanIcon() {
  return (
    <span className="feature-icon feature-icon--blue" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <rect x="7" y="7" width="10" height="10" rx="1" />
      </svg>
    </span>
  );
}

function SaleIcon() {
  return (
    <span className="feature-icon feature-icon--green" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
      </svg>
    </span>
  );
}

function RegisterIcon() {
  return (
    <span className="feature-icon feature-icon--orange" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M20 8v6M23 11h-6" />
      </svg>
    </span>
  );
}

export function SellerPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [tab, setTab] = useState<SellerTab>("customer");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [customer, setCustomer] = useState<SellerCustomer | null>(null);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const scanBusyRef = useRef(false);

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    setSaving(true);
    try {
      await api("/auth/seller/login", {
        method: "POST",
        body: JSON.stringify({ phone, password })
      });
      setLoggedIn(true);
    } catch {
      setError("Не удалось войти как продавец");
    } finally {
      setSaving(false);
    }
  }

  function handleDecoded(raw: string) {
    if (scanBusyRef.current) {
      return;
    }
    scanBusyRef.current = true;
    const value = normalizeQrValue(raw);
    setQrValue(value);
    void verify(value).finally(() => {
      setScanning(false);
      scanBusyRef.current = false;
    });
  }

  function toggleScan() {
    clearFeedback();
    if (scanning) {
      scanBusyRef.current = false;
      setScanning(false);
      return;
    }
    scanBusyRef.current = false;
    setScanning(true);
  }

  function resolveInputValue(code = customerCode, qr = qrValue): string {
    const normalizedQr = normalizeQrValue(qr);
    if (isQrTokenLike(normalizedQr)) {
      return normalizedQr;
    }
    const digits = code.replace(/\D/g, "");
    if (digits.length === 6) {
      return digits;
    }
    return normalizedQr;
  }

  async function verify(
    explicitValue?: string,
    options: { switchTab?: boolean; silent?: boolean } = {}
  ) {
    if (!options.silent) {
      clearFeedback();
    }
    const value = normalizeQrValue(explicitValue?.trim() || resolveInputValue());
    if (value.length < 6) {
      if (!options.silent) {
        setError("Введите 6-значный код или отсканируйте QR");
      }
      return;
    }
    setVerifying(true);
    try {
      const amountMinor = amountToMinor(purchaseAmount);
      const nextCustomer = await api<SellerCustomer>("/seller/customers/verify", {
        method: "POST",
        body: JSON.stringify({
          qr_value: value,
          purchase_amount_minor: amountMinor || undefined
        })
      });
      setCustomer(nextCustomer);
      setVerifiedToken(value);
      if (value.length === 6) {
        setCustomerCode(value);
        setQrValue("");
      } else {
        setQrValue(value);
        setCustomerCode("");
      }
      if (!options.silent) {
        setMessage(`Покупатель найден: ${nextCustomer.full_name}`);
      }
      if (options.switchTab !== false) {
        setTab("sale");
      }
    } catch (err) {
      if (!options.silent) {
        setVerifiedToken(null);
        setCustomer(null);
        setError(
          err instanceof Error ? err.message : "Код недействителен или истёк. Попросите покупателя обновить QR."
        );
      }
    } finally {
      setVerifying(false);
    }
  }

  async function sale(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    const amountMinor = amountToMinor(purchaseAmount);
    const token = verifiedToken ?? resolveInputValue();
    if (!customer || !verifiedToken || !amountMinor || token.length < 6) {
      setError("Сначала проверьте покупателя и введите сумму");
      return;
    }
    const redeemRaw = redeemPoints.trim();
    let redeemToSend: number | undefined;
    if (redeemRaw) {
      const pointsToRedeem = Number(redeemRaw);
      if (!Number.isFinite(pointsToRedeem) || pointsToRedeem < 1) {
        setError("Укажите корректное количество баллов для списания");
        return;
      }
      redeemToSend = pointsToRedeem;
    }
    setSaving(true);
    try {
      const payload: {
        customer_token: string;
        purchase_amount_minor: number;
        redeem_points?: number;
      } = {
        customer_token: token,
        purchase_amount_minor: amountMinor
      };
      if (redeemToSend !== undefined) {
        payload.redeem_points = redeemToSend;
      }
      const response = await api<{
        transaction: { balance_after: number };
        earned_points: number;
        redeemed_points: number;
      }>("/seller/sales", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey("seller-sale") },
        body: JSON.stringify(payload)
      });
      const parts: string[] = [];
      if (response.redeemed_points > 0) {
        parts.push(`списано ${points(response.redeemed_points)}`);
      }
      if (response.earned_points > 0) {
        parts.push(`начислено ${points(response.earned_points)}`);
      }
      const summary = parts.length > 0 ? parts.join(", ") : "операция выполнена";
      setMessage(
        `Покупка проведена: ${summary}. Баланс: ${points(response.transaction.balance_after)}.`
      );
      setRedeemPoints("");
      await verify(token, { switchTab: false, silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось провести операцию");
    } finally {
      setSaving(false);
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    clearFeedback();
    setSaving(true);
    try {
      const nextCustomer = await api<SellerCustomer>("/seller/customers", {
        method: "POST",
        body: JSON.stringify({
          full_name: data.get("full_name"),
          phone: data.get("phone"),
          birth_date: data.get("birth_date"),
          consent_accepted: data.get("consent_accepted") === "on"
        })
      });
      setCustomer(nextCustomer);
      setVerifiedToken(null);
      setMessage(`Покупатель ${nextCustomer.full_name} зарегистрирован`);
      event.currentTarget.reset();
      setTab("customer");
    } catch {
      setError("Не удалось зарегистрировать покупателя");
    } finally {
      setSaving(false);
    }
  }

  if (!loggedIn) {
    return (
      <Layout title="Кабинет продавца" subtitle="Вход сотрудника" className="staff-shell">
        <Card>
          <div className="admin-login">
            <h2>Вход продавца</h2>
            <form className="form" onSubmit={login}>
              <Field label="Телефон, имя или username">
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="username"
                  placeholder="+7 999 000-00-00"
                  required
                />
              </Field>
              <Field label="Пароль">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <ErrorMessage message={error} />
              <button disabled={saving}>{saving ? "Вход..." : "Войти"}</button>
            </form>
          </div>
        </Card>
        <StaffNav />
      </Layout>
    );
  }

  const customerLabel = customer?.full_name ?? "Не выбран";

  return (
    <Layout title="Кабинет продавца" subtitle="Сканирование и продажа" className="staff-shell">
      <div className="admin-stats">
        <div className="admin-stat">
          <span>Покупатель</span>
          <strong>{customerLabel}</strong>
        </div>
        <div className="admin-stat">
          <span>Баланс</span>
          <strong>{customer ? points(customer.balance_points) : "—"}</strong>
        </div>
        <div className="admin-stat">
          <span>К списанию</span>
          <strong>
            {customer?.max_redeem_points != null ? points(customer.max_redeem_points) : "—"}
          </strong>
        </div>
      </div>

      {(message || error) && (
        <div className="admin-feedback">
          <ErrorMessage message={error} />
          {message ? <p className="success">{message}</p> : null}
        </div>
      )}

      <div className="segmented admin-tabs">
        <button
          type="button"
          className={tab === "customer" ? "active" : ""}
          onClick={() => setTab("customer")}
        >
          Покупатель
        </button>
        <button
          type="button"
          className={tab === "sale" ? "active" : ""}
          onClick={() => setTab("sale")}
        >
          Продажа
        </button>
        <button
          type="button"
          className={tab === "register" ? "active" : ""}
          onClick={() => setTab("register")}
        >
          Регистрация
        </button>
      </div>

      {tab === "customer" ? (
        <Card>
          <SectionHead
            icon={<ScanIcon />}
            title="Поиск покупателя"
            description="Отсканируйте QR, введите 6-значный код или вставьте QR-значение"
          />
          <div className="seller-scanner-block">
            <QrScanner
              active={scanning && !verifying}
              onDecode={handleDecoded}
              onError={(msg) => {
                setError(msg);
                setScanning(false);
              }}
            />
            {scanning ? (
              <p className="muted scanner-hint">
                {verifying ? "Проверка покупателя..." : "Наведите камеру на QR-код покупателя"}
              </p>
            ) : null}
            <button onClick={toggleScan} disabled={verifying}>
              {scanning ? "Закрыть камеру" : "Открыть камеру"}
            </button>
          </div>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            <Field label="Код покупателя (6 цифр)">
              <input
                value={customerCode}
                onChange={(event) =>
                  setCustomerCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
              />
            </Field>
            <Field label="Или вставьте QR-значение">
              <textarea
                value={qrValue}
                onChange={(event) => setQrValue(event.target.value)}
                rows={2}
                placeholder="Токен из QR-кода"
              />
            </Field>
            <p className="admin-hint">Сумму покупки укажите на вкладке «Продажа».</p>
            <button className="secondary" disabled={verifying}>
              {verifying ? "Проверка..." : "Проверить покупателя"}
            </button>
          </form>
        </Card>
      ) : null}

      {tab === "sale" ? (
        <Card>
          <SectionHead
            icon={<SaleIcon />}
            title="Проведение покупки"
            description="Бонусы начисляются автоматически с суммы после вычета списанных баллов"
          />
          <form className="form" onSubmit={sale}>
            {!customer || !verifiedToken ? (
              <p className="admin-hint">Сначала найдите и проверьте покупателя на вкладке «Покупатель».</p>
            ) : (
              <p className="admin-hint">Покупатель: {customer.full_name}</p>
            )}
            <Field label="Сумма покупки">
              <input
                value={purchaseAmount}
                onChange={(event) => setPurchaseAmount(event.target.value)}
                onBlur={() => {
                  if (verifiedToken && amountToMinor(purchaseAmount)) {
                    void verify(verifiedToken, { switchTab: false, silent: true });
                  }
                }}
                inputMode="decimal"
                placeholder="1250.50"
                required
              />
            </Field>
            {amountToMinor(purchaseAmount) ? (
              <div className="seller-sale-summary">
                <span>Сумма к начислению</span>
                <strong>{moneyFromMinor(amountToMinor(purchaseAmount)!)}</strong>
                {customer?.max_redeem_points != null ? (
                  <p className="admin-hint">Можно списать до {points(customer.max_redeem_points)} баллов</p>
                ) : null}
              </div>
            ) : null}
            <Field label="Баллы к списанию (необязательно)">
              <input
                value={redeemPoints}
                onChange={(event) => setRedeemPoints(event.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </Field>
            <p className="admin-hint">
              Оставьте списание пустым, чтобы только начислить бонусы с суммы покупки.
            </p>
            <button disabled={saving || !customer || !verifiedToken || !amountToMinor(purchaseAmount)}>
              {saving ? "Проведение..." : "Провести покупку"}
            </button>
          </form>
        </Card>
      ) : null}

      {tab === "register" ? (
        <Card>
          <SectionHead
            icon={<RegisterIcon />}
            title="Регистрация покупателя"
            description="Создайте карту лояльности для нового клиента"
          />
          <form className="form" onSubmit={createCustomer}>
            <Field label="Имя">
              <input name="full_name" placeholder="Иван Иванов" required />
            </Field>
            <Field label="Телефон">
              <input name="phone" inputMode="tel" placeholder="+7 999 000-00-00" required />
            </Field>
            <Field label="Дата рождения">
              <input type="date" name="birth_date" required />
            </Field>
            <div className="admin-toggles">
              <strong>Согласие</strong>
              <label className="checkbox">
                <input type="checkbox" name="consent_accepted" required />
                <span>Покупатель дал согласие на обработку персональных данных.</span>
              </label>
            </div>
            <button disabled={saving}>{saving ? "Регистрация..." : "Зарегистрировать"}</button>
          </form>
        </Card>
      ) : null}

      <Card>
        <h2 className="admin-card-title">Текущий покупатель</h2>
        {customer ? (
          <div className="seller-customer-panel">
            <p className="seller-customer-panel__label">Проверенный покупатель</p>
            <strong>{customer.full_name}</strong>
            <div className="seller-customer-panel__stats">
              <div className="seller-customer-panel__stat">
                <span>Баланс</span>
                <strong>{points(customer.balance_points)}</strong>
              </div>
              <div className="seller-customer-panel__stat">
                <span>Можно списать</span>
                <strong>
                  {customer.max_redeem_points != null ? points(customer.max_redeem_points) : "—"}
                </strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="seller-customer-panel seller-customer-panel--empty">
            <p>Покупатель не выбран. Отсканируйте QR или введите код на вкладке «Покупатель».</p>
          </div>
        )}
      </Card>

      <StaffNav />
    </Layout>
  );
}

function amountToMinor(value: string): number | null {
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100);
}

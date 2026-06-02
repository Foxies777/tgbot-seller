import { FormEvent, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

import { api, idempotencyKey, points, SellerCustomer } from "../api/client";
import { BottomNav, Card, ErrorMessage, Field, Layout } from "../components/Layout";

type Action = "earn" | "redeem";

const SCANNER_ID = "seller-qr-reader";

export function SellerPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [action, setAction] = useState<Action>("earn");
  const [customer, setCustomer] = useState<SellerCustomer | null>(null);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    return () => {
      void stopScan();
    };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/auth/seller/login", {
        method: "POST",
        body: JSON.stringify({ phone, password })
      });
      setLoggedIn(true);
    } catch (err) {
      setError("Не удалось войти как продавец");
    }
  }

  async function stopScan() {
    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }
    scannerRef.current = null;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      // Scanner may already be stopped.
    }
    setScanning(false);
  }

  async function startScan() {
    setError(null);
    if (scanning) {
      await stopScan();
      return;
    }
    try {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setQrValue(decodedText);
          void stopScan();
          void verify(decodedText);
        },
        () => undefined
      );
    } catch (err) {
      setScanning(false);
      scannerRef.current = null;
      setError("Не удалось открыть камеру. Проверьте HTTPS и разрешение камеры.");
    }
  }

  function resolveInputValue(code = customerCode, qr = qrValue): string {
    const digits = code.replace(/\D/g, "");
    if (digits.length === 6) {
      return digits;
    }
    return qr.trim();
  }

  async function verify(explicitValue?: string) {
    setError(null);
    const value = explicitValue?.trim() || resolveInputValue();
    if (value.length < 6) {
      setError("Введите 6-значный код или отсканируйте QR");
      return;
    }
    try {
      const amountMinor = amountToMinor(purchaseAmount);
      const nextCustomer = await api<SellerCustomer>("/seller/qr/verify", {
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
    } catch (err) {
      setVerifiedToken(null);
      setError(err instanceof Error ? err.message : "Код недействителен или истёк. Попросите покупателя обновить QR.");
    }
  }

  async function sale(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const amountMinor = amountToMinor(purchaseAmount);
    const token = verifiedToken ?? resolveInputValue();
    if (!customer || !verifiedToken || !amountMinor || token.length < 6) {
      setError("Сначала проверьте покупателя и введите сумму");
      return;
    }
    if (action === "redeem") {
      const pointsToRedeem = Number(redeemPoints);
      if (!Number.isFinite(pointsToRedeem) || pointsToRedeem < 1) {
        setError("Укажите количество баллов для списания");
        return;
      }
    }
    try {
      const payload: {
        customer_token: string;
        purchase_amount_minor: number;
        action: Action;
        redeem_points?: number;
      } = {
        customer_token: token,
        purchase_amount_minor: amountMinor,
        action
      };
      if (action === "redeem") {
        payload.redeem_points = Number(redeemPoints);
      }
      const response = await api<{ transaction: { points_delta: number; balance_after: number } }>(
        "/seller/sales",
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey("seller-sale") },
          body: JSON.stringify(payload)
        }
      );
      setMessage(
        `Операция выполнена: ${points(response.transaction.points_delta)} баллов. Баланс: ${points(
          response.transaction.balance_after
        )}.`
      );
      await verify(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось провести операцию");
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
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
      setMessage(`Покупатель ${nextCustomer.full_name} зарегистрирован`);
      event.currentTarget.reset();
    } catch (err) {
      setError("Не удалось зарегистрировать покупателя");
    }
  }

  if (!loggedIn) {
    return (
      <Layout title="Кабинет продавца" subtitle="Вход сотрудника">
        <Card>
          <form className="form" onSubmit={login}>
            <Field label="Телефон, имя или username">
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Пароль">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <ErrorMessage message={error} />
            <button>Войти</button>
          </form>
        </Card>
        <BottomNav />
      </Layout>
    );
  }

  return (
    <Layout title="Кабинет продавца" subtitle="Сканирование и продажа">
      <Card>
        <div id={SCANNER_ID} className="scanner" />
        <button onClick={() => void startScan()}>{scanning ? "Закрыть камеру" : "Открыть камеру"}</button>
        <Field label="Код покупателя (6 цифр)">
          <input
            value={customerCode}
            onChange={(event) => setCustomerCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
          />
        </Field>
        <Field label="Или вставьте QR-значение">
          <textarea value={qrValue} onChange={(event) => setQrValue(event.target.value)} rows={2} />
        </Field>
        <Field label="Сумма покупки">
          <input
            value={purchaseAmount}
            onChange={(event) => setPurchaseAmount(event.target.value)}
            inputMode="decimal"
            placeholder="1250.50"
          />
        </Field>
        <button className="secondary" onClick={() => void verify()}>
          Проверить покупателя
        </button>
        {customer ? (
          <div className="summary">
            <strong>{customer.full_name}</strong>
            <span>Баланс: {points(customer.balance_points)}</span>
            {customer.max_redeem_points !== null ? (
              <span>Можно списать: {points(customer.max_redeem_points)}</span>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <form className="form" onSubmit={sale}>
          <div className="segmented">
            <button type="button" className={action === "earn" ? "active" : ""} onClick={() => setAction("earn")}>
              Начислить
            </button>
            <button
              type="button"
              className={action === "redeem" ? "active" : ""}
              onClick={() => setAction("redeem")}
            >
              Списать
            </button>
          </div>
          {action === "redeem" ? (
            <Field label="Баллы к списанию">
              <input
                value={redeemPoints}
                onChange={(event) => setRedeemPoints(event.target.value)}
                inputMode="numeric"
              />
            </Field>
          ) : null}
          <ErrorMessage message={error} />
          {message ? <p className="success">{message}</p> : null}
          <button>Провести операцию</button>
        </form>
      </Card>

      <Card>
        <h2>Регистрация покупателя</h2>
        <form className="form" onSubmit={createCustomer}>
          <Field label="Имя">
            <input name="full_name" required />
          </Field>
          <Field label="Телефон">
            <input name="phone" inputMode="tel" required />
          </Field>
          <Field label="Дата рождения">
            <input type="date" name="birth_date" required />
          </Field>
          <label className="checkbox">
            <input type="checkbox" name="consent_accepted" required />
            <span>Покупатель дал согласие на обработку персональных данных.</span>
          </label>
          <button>Зарегистрировать</button>
        </form>
      </Card>
      <BottomNav />
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

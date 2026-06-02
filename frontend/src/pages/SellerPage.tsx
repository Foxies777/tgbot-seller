import { FormEvent, useRef, useState } from "react";

import { api, idempotencyKey, points, SellerCustomer } from "../api/client";
import { BottomNav, Card, ErrorMessage, Field, Layout } from "../components/Layout";

type Action = "earn" | "redeem";

export function SellerPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [action, setAction] = useState<Action>("earn");
  const [customer, setCustomer] = useState<SellerCustomer | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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

  async function startScan() {
    setError(null);
    if (!videoRef.current) {
      return;
    }
    if (!("BarcodeDetector" in window)) {
      setError("Этот браузер не поддерживает сканер QR. Вставьте QR-значение вручную.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!videoRef.current) {
          return;
        }
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          const value = codes[0].rawValue;
          setQrValue(value);
          void verify(value);
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    } catch (err) {
      setError("Не удалось открыть камеру. Проверьте HTTPS и разрешение камеры.");
    }
  }

  async function verify(value = qrValue) {
    setError(null);
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
    } catch (err) {
      setError("QR-код не распознан или покупатель не найден");
    }
  }

  async function sale(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const amountMinor = amountToMinor(purchaseAmount);
    if (!customer || !amountMinor) {
      setError("Сначала отсканируйте QR и введите сумму");
      return;
    }
    try {
      const response = await api<{ transaction: { points_delta: number; balance_after: number } }>(
        "/seller/sales",
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey("seller-sale") },
          body: JSON.stringify({
            customer_token: qrValue,
            purchase_amount_minor: amountMinor,
            action,
            redeem_points: action === "redeem" ? Number(redeemPoints) : undefined
          })
        }
      );
      setMessage(
        `Операция выполнена: ${points(response.transaction.points_delta)} баллов. Баланс: ${points(
          response.transaction.balance_after
        )}.`
      );
      await verify(qrValue);
    } catch (err) {
      setError("Не удалось провести операцию");
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
            <Field label="Телефон">
              <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
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
        <video ref={videoRef} className="scanner" muted playsInline />
        <button onClick={() => void startScan()}>Открыть камеру</button>
        <Field label="QR-значение вручную">
          <textarea value={qrValue} onChange={(event) => setQrValue(event.target.value)} />
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

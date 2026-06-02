import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  ApiError,
  CustomerProfile,
  CustomerQr,
  moneyFromMinor,
  points,
  SpecialOffer,
  Transaction
} from "../api/client";
import { CustomerLanding } from "../components/CustomerLanding";
import { Card, ErrorMessage, Layout } from "../components/Layout";

export function CustomerPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [qrData, setQrData] = useState<CustomerQr | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [offers, setOffers] = useState<SpecialOffer[]>([]);
  const [tab, setTab] = useState<"card" | "history">("card");
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const refreshQr = useCallback(async () => {
    try {
      const nextQr = await api<CustomerQr>("/customer/me/qr");
      setQrData(nextQr);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthenticated(true);
      } else {
        setError(err instanceof Error ? err.message : "Не удалось загрузить QR-код");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (tab !== "card" || !profile) {
      return;
    }
    void refreshQr();
    const interval = window.setInterval(() => {
      void refreshQr();
    }, (qrData?.ttl_seconds ?? 60) * 1000);
    return () => window.clearInterval(interval);
  }, [profile, tab, refreshQr, qrData?.ttl_seconds]);

  useEffect(() => {
    if (!qrData) {
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(qrData.expires_at).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(remaining);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [qrData]);

  useEffect(() => {
    if (!qrData || tab !== "card" || !canvasRef.current) {
      return;
    }
    const value = `${window.location.origin}/qr/${qrData.qr_token}`;
    void QRCode.toCanvas(canvasRef.current, value, { width: 240, margin: 2 });
  }, [qrData, tab]);

  async function load() {
    setLoading(true);
    setError(null);
    setUnauthenticated(false);
    try {
      const [nextProfile, nextTransactions, nextOffers] = await Promise.all([
        api<CustomerProfile>("/customer/me"),
        api<Transaction[]>("/customer/transactions"),
        api<SpecialOffer[]>("/customer/offers/active")
      ]);
      setProfile(nextProfile);
      setTransactions(nextTransactions);
      setOffers(nextOffers);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthenticated(true);
      } else {
        setError(err instanceof Error ? err.message : "Не удалось загрузить кабинет");
      }
    } finally {
      setLoading(false);
    }
  }

  async function dismissOffer(id: number) {
    await api(`/customer/offers/${id}/dismiss`, { method: "POST" });
    setOffers((current) => current.filter((offer) => offer.id !== id));
  }

  if (loading) {
    return (
      <Layout title="Кабинет покупателя">
        <Card>
          <p className="muted">Загрузка...</p>
        </Card>
      </Layout>
    );
  }

  if (unauthenticated) {
    return <CustomerLanding />;
  }

  if (error) {
    return (
      <Layout title="Кабинет покупателя">
        <Card>
          <ErrorMessage message={error} />
          <button type="button" onClick={() => void load()}>
            Повторить
          </button>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Кабинет покупателя" subtitle={profile?.full_name ?? "Загрузка..."}>
      {offers[0] ? <OfferPopup offer={offers[0]} onClose={() => void dismissOffer(offers[0].id)} /> : null}
      <div className="tabs">
        <button className={tab === "card" ? "active" : ""} onClick={() => setTab("card")}>
          QR и баланс
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          История
        </button>
      </div>
      {tab === "card" ? (
        <Card tone="dark">
          <p className="muted-light">Ваш баланс</p>
          <strong className="balance">{profile ? points(profile.balance_points) : "..."}</strong>
          <p>Покажите QR или назовите код продавцу для начисления или списания бонусов.</p>
          <div className="qr-box">
            <canvas ref={canvasRef} />
          </div>
          {qrData ? (
            <>
              <p className="customer-code-label">Код для продавца</p>
              <strong className="customer-code">{qrData.short_code}</strong>
              <p className="muted-light qr-expiry">
                {secondsLeft > 0
                  ? `Обновится через ${secondsLeft} сек.`
                  : "Обновление кода..."}
              </p>
            </>
          ) : null}
        </Card>
      ) : (
        <Card>
          <div className="list">
            {transactions.map((transaction) => (
              <article key={transaction.id} className="list-item">
                <div>
                  <strong>{label(transaction.transaction_type)}</strong>
                  <p>{new Date(transaction.created_at).toLocaleString("ru-RU")}</p>
                  {transaction.purchase_amount_minor > 0 ? (
                    <p>{moneyFromMinor(transaction.purchase_amount_minor)}</p>
                  ) : null}
                </div>
                <span className={transaction.points_delta >= 0 ? "positive" : "negative"}>
                  {transaction.points_delta > 0 ? "+" : ""}
                  {points(transaction.points_delta)}
                </span>
              </article>
            ))}
            {transactions.length === 0 ? <p className="muted">Истории пока нет</p> : null}
          </div>
        </Card>
      )}
    </Layout>
  );
}

function OfferPopup({ offer, onClose }: { offer: SpecialOffer; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <article className="modal">
        <img src={offer.image_path} alt="" />
        <h2>{offer.title}</h2>
        <p>{offer.text}</p>
        <button onClick={onClose}>Понятно</button>
      </article>
    </div>
  );
}

function label(type: string): string {
  const labels: Record<string, string> = {
    earn: "Начисление",
    redeem: "Списание",
    adjustment: "Коррекция",
    expiration: "Сгорание"
  };
  return labels[type] ?? type;
}

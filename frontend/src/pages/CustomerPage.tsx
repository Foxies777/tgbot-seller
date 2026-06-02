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
import { Card, ErrorMessage } from "../components/Layout";

const SWIPE_THRESHOLD_PX = 48;

type CustomerTab = "card" | "history";

export function CustomerPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [qrData, setQrData] = useState<CustomerQr | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [offers, setOffers] = useState<SpecialOffer[]>([]);
  const [tab, setTab] = useState<CustomerTab>("card");
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);

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
    if (!qrData || tab !== "card" || !canvasRef.current || !qrContainerRef.current) {
      return;
    }

    const drawQr = () => {
      const container = qrContainerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) {
        return;
      }
      const side = Math.floor(Math.min(container.clientWidth, container.clientHeight) * 0.96);
      if (side < 120) {
        return;
      }
      const value = `${window.location.origin}/qr/${qrData.qr_token}`;
      void QRCode.toCanvas(canvas, value, {
        width: side,
        margin: 1,
        color: { dark: "#ffffff", light: "#1e40af00" }
      });
    };

    drawQr();
    const observer = new ResizeObserver(drawQr);
    observer.observe(qrContainerRef.current);
    return () => observer.disconnect();
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

  function onTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) {
      return;
    }
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) {
      return;
    }
    const delta = endX - startX;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) {
      return;
    }
    if (delta < 0 && tab === "card") {
      setTab("history");
    } else if (delta > 0 && tab === "history") {
      setTab("card");
    }
  }

  if (loading) {
    return (
      <main className="app-shell customer-page">
        <Card>
          <p className="muted">Загрузка...</p>
        </Card>
      </main>
    );
  }

  if (unauthenticated) {
    return <CustomerLanding />;
  }

  if (error) {
    return (
      <main className="app-shell customer-page">
        <Card>
          <ErrorMessage message={error} />
          <button type="button" onClick={() => void load()}>
            Повторить
          </button>
        </Card>
      </main>
    );
  }

  return (
    <main className="customer-page customer-page--cabinet">
      {offers[0] ? <OfferPopup offer={offers[0]} onClose={() => void dismissOffer(offers[0].id)} /> : null}
      <div
        className="customer-swipe"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label={tab === "card" ? "QR и баланс" : "История операций"}
      >
        <div
          className="customer-swipe__track"
          data-tab={tab}
          style={{ transform: `translateX(${tab === "history" ? "-50%" : "0"})` }}
        >
          <section className="customer-swipe__panel customer-qr-panel" aria-hidden={tab !== "card"}>
            <div className="customer-qr-panel__header">
              {profile?.full_name ? <p className="customer-name">{profile.full_name}</p> : null}
              <p className="muted-light">Ваш баланс</p>
              <strong className="balance balance--compact">
                {profile ? points(profile.balance_points) : "..."}
              </strong>
            </div>
            <div className="customer-qr-panel__canvas" ref={qrContainerRef}>
              <canvas ref={canvasRef} />
            </div>
            {qrData ? (
              <div className="customer-qr-panel__footer">
                <p className="customer-code-label">Код для продавца</p>
                <strong className="customer-code">{qrData.short_code}</strong>
                <p className="muted-light qr-expiry">
                  {secondsLeft > 0
                    ? `Обновится через ${secondsLeft} сек.`
                    : "Обновление кода..."}
                </p>
              </div>
            ) : null}
          </section>
          <section
            className="customer-swipe__panel customer-history-panel"
            aria-hidden={tab !== "history"}
          >
            <h2 className="customer-history-title">История</h2>
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
          </section>
        </div>
      </div>
    </main>
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

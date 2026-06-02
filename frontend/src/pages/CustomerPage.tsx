import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

import {
  api,
  CustomerProfile,
  moneyFromMinor,
  points,
  SpecialOffer,
  Transaction
} from "../api/client";
import { BottomNav, Card, ErrorMessage, Layout } from "../components/Layout";

export function CustomerPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [offers, setOffers] = useState<SpecialOffer[]>([]);
  const [tab, setTab] = useState<"card" | "history">("card");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!profile || !canvasRef.current) {
      return;
    }
    const value = `${window.location.origin}/qr/${profile.qr_token}`;
    void QRCode.toCanvas(canvasRef.current, value, { width: 240, margin: 2 });
  }, [profile]);

  async function load() {
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
      setError("Войдите или зарегистрируйтесь, чтобы открыть кабинет");
    }
  }

  async function dismissOffer(id: number) {
    await api(`/customer/offers/${id}/dismiss`, { method: "POST" });
    setOffers((current) => current.filter((offer) => offer.id !== id));
  }

  if (error) {
    return (
      <Layout title="Кабинет покупателя">
        <Card>
          <ErrorMessage message={error} />
          <a className="button-link" href="/register">
            Зарегистрироваться
          </a>
        </Card>
        <BottomNav />
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
          <p>Покажите QR продавцу для начисления или списания бонусов.</p>
          <div className="qr-box">
            <canvas ref={canvasRef} />
          </div>
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
      <BottomNav />
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

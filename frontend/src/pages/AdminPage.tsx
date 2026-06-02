import { FormEvent, useEffect, useState } from "react";

import {
  api,
  datetimeLocalToUtc,
  LoyaltySettings,
  moneyFromMinor,
  SpecialOffer,
  Transaction
} from "../api/client";
import { Card, ErrorMessage, Field, Layout, StaffNav } from "../components/Layout";

export function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [offers, setOffers] = useState<SpecialOffer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imagePath, setImagePath] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAdmin();
  }, []);

  async function loadAdmin() {
    try {
      const [nextSettings, nextOffers, nextTransactions] = await Promise.all([
        api<LoyaltySettings>("/admin/settings"),
        api<SpecialOffer[]>("/admin/offers"),
        api<Transaction[]>("/admin/transactions")
      ]);
      setSettings(nextSettings);
      setOffers(nextOffers);
      setTransactions(nextTransactions);
      setLoggedIn(true);
    } catch {
      setLoggedIn(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    try {
      await api("/auth/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password")
        })
      });
      await loadAdmin();
    } catch {
      setError("Не удалось войти в админку");
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const nextSettings = await api<LoyaltySettings>("/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          earn_percent: Number(data.get("earn_percent")),
          max_redeem_percent: Number(data.get("max_redeem_percent")),
          point_ttl_days: Number(data.get("point_ttl_days")),
          redeem_enabled: data.get("redeem_enabled") === "on",
          welcome_bonus_enabled: data.get("welcome_bonus_enabled") === "on",
          welcome_bonus_points: Number(data.get("welcome_bonus_points"))
        })
      });
      setSettings(nextSettings);
      setMessage("Настройки сохранены");
    } catch {
      setError("Не удалось сохранить настройки");
    }
  }

  async function createSeller(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api("/admin/sellers", {
        method: "POST",
        body: JSON.stringify({
          full_name: data.get("full_name"),
          phone: data.get("phone"),
          password: data.get("password")
        })
      });
      setMessage("Продавец сохранен");
      event.currentTarget.reset();
    } catch {
      setError("Не удалось сохранить продавца");
    }
  }

  async function uploadImage(file: File) {
    const blob = await cropPng(file);
    const form = new FormData();
    form.append("file", blob, "offer.png");
    const response = await fetch("/api/v1/admin/offers/upload", {
      method: "POST",
      body: form,
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error("Upload failed");
    }
    const payload = (await response.json()) as { image_path: string };
    setImagePath(payload.image_path);
  }

  async function createOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const offer = await api<SpecialOffer>("/admin/offers", {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          text: data.get("text"),
          image_path: imagePath,
          starts_at: datetimeLocalToUtc(data.get("starts_at")),
          ends_at: datetimeLocalToUtc(data.get("ends_at")),
          status: data.get("status")
        })
      });
      setOffers((current) => [offer, ...current]);
      setMessage("Спецпредложение создано");
      event.currentTarget.reset();
      setImagePath("");
    } catch {
      setError("Не удалось создать спецпредложение");
    }
  }

  async function expirePoints() {
    const result = await api<{ expired_transactions: number }>("/admin/maintenance/expire-points", {
      method: "POST"
    });
    setMessage(`Сгорание выполнено, транзакций: ${result.expired_transactions}`);
  }

  if (!loggedIn || !settings) {
    return (
      <Layout title="Админка" subtitle="Управление бонусной программой">
        <Card>
          <form className="form" onSubmit={login}>
            <Field label="Логин">
              <input name="username" required />
            </Field>
            <Field label="Пароль">
              <input type="password" name="password" required />
            </Field>
            <ErrorMessage message={error} />
            <button>Войти</button>
          </form>
        </Card>
        <StaffNav />
      </Layout>
    );
  }

  return (
    <Layout title="Админка" subtitle="Настройки, продавцы и акции">
      <Card>
        <form className="form" onSubmit={saveSettings}>
          <h2>Настройки бонусов</h2>
          <Field label="% начисления">
            <input name="earn_percent" type="number" min="0" max="100" defaultValue={settings.earn_percent} />
          </Field>
          <Field label="% максимального списания">
            <input
              name="max_redeem_percent"
              type="number"
              min="0"
              max="100"
              defaultValue={settings.max_redeem_percent}
            />
          </Field>
          <Field label="Срок жизни бонусов, дней">
            <input name="point_ttl_days" type="number" min="1" defaultValue={settings.point_ttl_days} />
          </Field>
          <Field label="Приветственные бонусы">
            <input name="welcome_bonus_points" type="number" min="0" defaultValue={settings.welcome_bonus_points} />
          </Field>
          <label className="checkbox">
            <input name="redeem_enabled" type="checkbox" defaultChecked={settings.redeem_enabled} />
            <span>Списание включено</span>
          </label>
          <label className="checkbox">
            <input
              name="welcome_bonus_enabled"
              type="checkbox"
              defaultChecked={settings.welcome_bonus_enabled}
            />
            <span>Приветственные бонусы включены</span>
          </label>
          <button>Сохранить настройки</button>
        </form>
      </Card>

      <Card>
        <h2>Новый продавец</h2>
        <form className="form" onSubmit={createSeller}>
          <Field label="Имя">
            <input name="full_name" required />
          </Field>
          <Field label="Телефон">
            <input name="phone" required />
          </Field>
          <Field label="Пароль">
            <input type="password" name="password" minLength={8} required />
          </Field>
          <button>Сохранить продавца</button>
        </form>
      </Card>

      <Card>
        <h2>Спецпредложение</h2>
        <form className="form" onSubmit={createOffer}>
          <Field label="PNG изображение">
            <input
              type="file"
              accept="image/png"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadImage(file);
                }
              }}
            />
          </Field>
          {imagePath ? <img className="offer-preview" src={imagePath} alt="" /> : null}
          <Field label="Название">
            <input name="title" required />
          </Field>
          <Field label="Текст акции">
            <textarea name="text" required />
          </Field>
          <Field label="Начало">
            <input name="starts_at" type="datetime-local" required />
          </Field>
          <Field label="Окончание">
            <input name="ends_at" type="datetime-local" required />
          </Field>
          <Field label="Статус">
            <select name="status" defaultValue="active">
              <option value="draft">Черновик</option>
              <option value="active">Активно</option>
              <option value="archived">Архив</option>
            </select>
          </Field>
          <button disabled={!imagePath}>Создать акцию</button>
        </form>
      </Card>

      <Card>
        <h2>Операции</h2>
        <button className="secondary" onClick={() => void expirePoints()}>
          Запустить сгорание баллов
        </button>
        <ErrorMessage message={error} />
        {message ? <p className="success">{message}</p> : null}
        <div className="list">
          {transactions.map((transaction) => (
            <article className="list-item" key={transaction.id}>
              <div>
                <strong>{transaction.transaction_type}</strong>
                <p>{moneyFromMinor(transaction.purchase_amount_minor)}</p>
              </div>
              <span>{transaction.points_delta}</span>
            </article>
          ))}
        </div>
      </Card>
      <Card>
        <h2>Акции</h2>
        <div className="list">
          {offers.map((offer) => (
            <article className="list-item" key={offer.id}>
              <div>
                <strong>{offer.title}</strong>
                <p>{offer.status}</p>
              </div>
              <img className="thumb" src={offer.image_path} alt="" />
            </article>
          ))}
        </div>
      </Card>
      <StaffNav />
    </Layout>
  );
}

async function cropPng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.floor((bitmap.width - size) / 2);
  const sourceY = Math.floor((bitmap.height - size) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not supported");
  }
  context.drawImage(bitmap, sourceX, sourceY, size, size, 0, 0, 1080, 1080);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to crop image"));
      }
    }, "image/png");
  });
}

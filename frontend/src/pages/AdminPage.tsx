import { FormEvent, useEffect, useRef, useState } from "react";

import {
  api,
  datetimeLocalToUtc,
  LoyaltySettings,
  moneyFromMinor,
  points,
  SellerAdmin,
  SpecialOffer,
  Transaction
} from "../api/client";
import { Card, ErrorMessage, Field, Layout, SectionHead, StaffNav } from "../components/Layout";
import { offerStatusLabel, sellerStatusLabel, transactionTypeLabel } from "../utils/labels";

type AdminTab = "settings" | "sellers" | "offers";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU");
}

function formatDateRange(startsAt: string, endsAt: string): string {
  return `${formatDateTime(startsAt)} — ${formatDateTime(endsAt)}`;
}

function SettingsIcon() {
  return (
    <span className="feature-icon feature-icon--blue" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    </span>
  );
}

function SellersIcon() {
  return (
    <span className="feature-icon feature-icon--green" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </span>
  );
}

function OffersIcon() {
  return (
    <span className="feature-icon feature-icon--orange" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    </span>
  );
}

export function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [offers, setOffers] = useState<SpecialOffer[]>([]);
  const [sellers, setSellers] = useState<SellerAdmin[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imagePath, setImagePath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<AdminTab>("settings");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    void loadAdmin();
  }, []);

  async function loadAdmin() {
    setLoading(true);
    try {
      const [nextSettings, nextOffers, nextSellers, nextTransactions] = await Promise.all([
        api<LoyaltySettings>("/admin/settings"),
        api<SpecialOffer[]>("/admin/offers"),
        api<SellerAdmin[]>("/admin/sellers"),
        api<Transaction[]>("/admin/transactions")
      ]);
      setSettings(nextSettings);
      setOffers(nextOffers);
      setSellers(nextSellers);
      setTransactions(nextTransactions);
      setLoggedIn(true);
    } catch {
      setLoggedIn(false);
    } finally {
      setLoading(false);
    }
  }

  function showSuccess(text: string) {
    setError(null);
    setMessage(text);
  }

  function showError(text: string) {
    setMessage(null);
    setError(text);
  }

  function beginBusy(): boolean {
    if (busyRef.current) {
      return false;
    }
    busyRef.current = true;
    setSaving(true);
    return true;
  }

  function endBusy() {
    busyRef.current = false;
    setSaving(false);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beginBusy()) {
      return;
    }
    const data = new FormData(event.currentTarget);
    setMessage(null);
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
      showError("Не удалось войти в админку");
    } finally {
      endBusy();
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beginBusy()) {
      return;
    }
    const data = new FormData(event.currentTarget);
    setMessage(null);
    setError(null);
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
      showSuccess("Настройки сохранены");
    } catch {
      showError("Не удалось сохранить настройки");
    } finally {
      endBusy();
    }
  }

  async function createSeller(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beginBusy()) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage(null);
    setError(null);
    try {
      const seller = await api<SellerAdmin>("/admin/sellers", {
        method: "POST",
        body: JSON.stringify({
          full_name: data.get("full_name"),
          phone: data.get("phone"),
          password: data.get("password")
        })
      });
      setSellers((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== seller.id);
        return [seller, ...withoutDuplicate];
      });
      showSuccess("Продавец сохранен");
      form.reset();
    } catch {
      showError("Не удалось сохранить продавца");
    } finally {
      endBusy();
    }
  }

  async function deactivateSeller(seller: SellerAdmin) {
    if (!seller.is_active) {
      return;
    }
    const confirmed = window.confirm(`Уволить продавца ${seller.full_name}? Доступ в кабинет будет закрыт.`);
    if (!confirmed) {
      return;
    }
    if (!beginBusy()) {
      return;
    }
    setMessage(null);
    setError(null);
    try {
      const updated = await api<SellerAdmin>(`/admin/sellers/${seller.id}`, {
        method: "DELETE"
      });
      setSellers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      showSuccess(`Продавец ${updated.full_name} уволен`);
    } catch {
      showError("Не удалось уволить продавца");
    } finally {
      endBusy();
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
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
    } catch {
      showError("Не удалось загрузить изображение");
    } finally {
      setUploading(false);
    }
  }

  async function createOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beginBusy()) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage(null);
    setError(null);
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
      showSuccess("Спецпредложение создано");
      form.reset();
      setImagePath("");
    } catch {
      showError("Не удалось создать спецпредложение");
    } finally {
      endBusy();
    }
  }

  async function expirePoints() {
    if (!beginBusy()) {
      return;
    }
    setMessage(null);
    setError(null);
    try {
      const result = await api<{ expired_transactions: number }>("/admin/maintenance/expire-points", {
        method: "POST"
      });
      const nextTransactions = await api<Transaction[]>("/admin/transactions");
      setTransactions(nextTransactions);
      showSuccess(`Сгорание выполнено, транзакций: ${result.expired_transactions}`);
    } catch {
      showError("Не удалось запустить сгорание баллов");
    } finally {
      endBusy();
    }
  }

  if (loading && !loggedIn) {
    return (
      <Layout title="Админка" subtitle="Управление бонусной программой" className="staff-shell">
        <Card>
          <p className="muted">Загрузка...</p>
        </Card>
        <StaffNav />
      </Layout>
    );
  }

  if (!loggedIn || !settings) {
    return (
      <Layout title="Админка" subtitle="Управление бонусной программой" className="staff-shell">
        <Card>
          <div className="admin-login">
            <h2>Вход в админку</h2>
            <form className="form" onSubmit={login}>
              <Field label="Логин">
                <input name="username" autoComplete="username" required />
              </Field>
              <Field label="Пароль">
                <input type="password" name="password" autoComplete="current-password" required />
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

  const activeOffers = offers.filter((offer) => offer.status === "active").length;

  return (
    <Layout title="Админка" subtitle="Настройки, продавцы и акции" className="staff-shell">
      <div className="admin-stats">
        <div className="admin-stat">
          <span>% начисления</span>
          <strong>{settings.earn_percent}%</strong>
        </div>
        <div className="admin-stat">
          <span>Активных акций</span>
          <strong>{activeOffers}</strong>
        </div>
        <div className="admin-stat">
          <span>Операций</span>
          <strong>{transactions.length}</strong>
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
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
        >
          Настройки
        </button>
        <button
          type="button"
          className={tab === "sellers" ? "active" : ""}
          onClick={() => setTab("sellers")}
        >
          Продавцы
        </button>
        <button
          type="button"
          className={tab === "offers" ? "active" : ""}
          onClick={() => setTab("offers")}
        >
          Акции
        </button>
      </div>

      {tab === "settings" ? (
        <>
          <Card>
            <SectionHead
              icon={<SettingsIcon />}
              title="Настройки бонусов"
              description="Параметры начисления, списания и срока жизни баллов"
            />
            <form className="form" onSubmit={saveSettings}>
              <div className="admin-field-grid">
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
                <Field label="Приветственные бонусы, баллов">
                  <input
                    name="welcome_bonus_points"
                    type="number"
                    min="0"
                    defaultValue={settings.welcome_bonus_points}
                  />
                </Field>
              </div>
              <div className="admin-toggles">
                <strong>Переключатели</strong>
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
              </div>
              <button disabled={saving}>{saving ? "Сохранение..." : "Сохранить настройки"}</button>
            </form>
          </Card>
          <Card>
            <h2 className="admin-card-title">Журнал операций</h2>
            <div className="admin-maintenance">
              <p className="muted">
                Запускает сгорание просроченных баллов по правилам программы лояльности. Операция необратима.
              </p>
              <button className="secondary" disabled={saving} onClick={() => void expirePoints()}>
                {saving ? "Выполнение..." : "Запустить сгорание баллов"}
              </button>
            </div>
            <div className="list">
              {transactions.map((transaction) => (
                <article className="list-item" key={transaction.id}>
                  <div>
                    <strong>{transactionTypeLabel(transaction.transaction_type)}</strong>
                    <p>{formatDateTime(transaction.created_at)}</p>
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
              {transactions.length === 0 ? <p className="admin-empty">Операций пока нет</p> : null}
            </div>
          </Card>
        </>
      ) : null}

      {tab === "sellers" ? (
        <>
          <Card>
            <SectionHead
              icon={<SellersIcon />}
              title="Новый продавец"
              description="Создайте учётную запись сотрудника для кабинета продавца"
            />
            <form className="form" onSubmit={createSeller}>
              <Field label="Имя">
                <input name="full_name" placeholder="Иван Иванов" required />
              </Field>
              <Field label="Телефон">
                <input name="phone" inputMode="tel" placeholder="+7 999 000-00-00" required />
              </Field>
              <Field label="Пароль">
                <input type="password" name="password" minLength={8} placeholder="Минимум 8 символов" required />
              </Field>
              <p className="admin-hint">Пароль должен содержать не менее 8 символов.</p>
              <button disabled={saving}>{saving ? "Сохранение..." : "Сохранить продавца"}</button>
            </form>
          </Card>
          <Card>
            <h2 className="admin-card-title">Продавцы</h2>
            <div className="list">
              {sellers.map((seller) => (
                <article
                  className={`admin-seller-row${seller.is_active ? "" : " admin-seller-row--inactive"}`}
                  key={seller.id}
                >
                  <div className="admin-seller-row__body">
                    <strong>{seller.full_name}</strong>
                    <div className="admin-seller-row__meta">
                      <span className={`status-badge status-badge--${seller.is_active ? "active" : "inactive"}`}>
                        {sellerStatusLabel(seller.is_active)}
                      </span>
                      {seller.phone ? <p>{seller.phone}</p> : null}
                      {seller.username ? <p>@{seller.username}</p> : null}
                      {seller.telegram_id ? <p>Telegram ID: {seller.telegram_id}</p> : null}
                    </div>
                  </div>
                  {seller.is_active ? (
                    <button
                      type="button"
                      className="secondary admin-seller-row__fire"
                      disabled={saving}
                      onClick={() => void deactivateSeller(seller)}
                    >
                      Уволить
                    </button>
                  ) : null}
                </article>
              ))}
              {sellers.length === 0 ? <p className="admin-empty">Продавцов пока нет</p> : null}
            </div>
          </Card>
        </>
      ) : null}

      {tab === "offers" ? (
        <>
          <Card>
            <SectionHead
              icon={<OffersIcon />}
              title="Спецпредложение"
              description="Загрузите PNG и укажите период показа акции покупателям"
            />
            <form className="form" onSubmit={createOffer}>
              <label className={`admin-upload${uploading ? " admin-upload--loading" : ""}`}>
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
                <span>{uploading ? "Загрузка..." : "Выберите PNG-изображение"}</span>
                <small>Квадрат 1080×1080, обрезка по центру</small>
              </label>
              {imagePath ? (
                <div className="admin-preview">
                  <img src={imagePath} alt="Превью акции" />
                  <p>Изображение загружено</p>
                </div>
              ) : null}
              <Field label="Название">
                <input name="title" placeholder="Скидка 20% на кофе" required />
              </Field>
              <Field label="Текст акции">
                <textarea name="text" placeholder="Описание для покупателя" required />
              </Field>
              <div className="admin-field-grid">
                <Field label="Начало">
                  <input name="starts_at" type="datetime-local" required />
                </Field>
                <Field label="Окончание">
                  <input name="ends_at" type="datetime-local" required />
                </Field>
              </div>
              <Field label="Статус">
                <select name="status" defaultValue="active">
                  <option value="draft">Черновик</option>
                  <option value="active">Активно</option>
                  <option value="archived">Архив</option>
                </select>
              </Field>
              {!imagePath ? <p className="admin-hint">Сначала загрузите изображение, чтобы создать акцию.</p> : null}
              <button disabled={!imagePath || saving}>{saving ? "Создание..." : "Создать акцию"}</button>
            </form>
          </Card>
          <Card>
            <h2 className="admin-card-title">Акции</h2>
            <div className="list">
              {offers.map((offer) => (
                <article className="admin-offer-row" key={offer.id}>
                  <img className="admin-offer-row__image" src={offer.image_path} alt="" />
                  <div className="admin-offer-row__body">
                    <strong>{offer.title}</strong>
                    <div className="admin-offer-row__meta">
                      <span className={`status-badge status-badge--${offer.status}`}>
                        {offerStatusLabel(offer.status)}
                      </span>
                      <p>{formatDateRange(offer.starts_at, offer.ends_at)}</p>
                    </div>
                  </div>
                </article>
              ))}
              {offers.length === 0 ? <p className="admin-empty">Акций пока нет</p> : null}
            </div>
          </Card>
        </>
      ) : null}

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

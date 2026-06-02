import { FormEvent, useState } from "react";

import { api, CustomerRegisterResponse } from "../api/client";
import { Card, ErrorMessage, Field, Layout } from "../components/Layout";

function formatAccessCode(code: string): string {
  const normalized = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (normalized.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await api<CustomerRegisterResponse>("/auth/customer/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          phone,
          birth_date: birthDate,
          consent_accepted: consent,
          password: password || null
        })
      });
      if (response.access_code) {
        setAccessCode(response.access_code);
        return;
      }
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось зарегистрироваться");
    } finally {
      setLoading(false);
    }
  }

  if (accessCode) {
    return (
      <Layout title="Регистрация завершена" subtitle="Сохраните код доступа">
        <Card>
          <p className="register-code-intro">
            Ваш уникальный код для входа в кабинет. Запишите или сохраните его — повторно код не
            показывается.
          </p>
          <strong className="register-access-code">{formatAccessCode(accessCode)}</strong>
          <p className="muted register-code-note">
            Используйте этот код на странице «Войти», если не задавали пароль или забыли его.
          </p>
          <a className="button-link" href="/app">
            Перейти в кабинет
          </a>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Регистрация" subtitle="Подключение к бонусной программе">
      <Card>
        <form className="form" onSubmit={submit}>
          <Field label="Имя">
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </Field>
          <Field label="Телефон">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              placeholder="+7 999 000-00-00"
              required
            />
          </Field>
          <Field label="Дата рождения">
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              required
            />
          </Field>
          <Field label="Пароль (необязательно)">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              placeholder="Минимум 8 символов"
            />
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Я согласен на хранение и обработку имени, номера телефона и даты рождения для участия в
              бонусной программе.
            </span>
          </label>
          <ErrorMessage message={error} />
          <button disabled={loading || !consent}>
            {loading ? "Сохраняем..." : "Зарегистрироваться"}
          </button>
        </form>
        <p className="muted login-register-link">
          Уже есть аккаунт? <a href="/login">Войти</a>
        </p>
      </Card>
    </Layout>
  );
}

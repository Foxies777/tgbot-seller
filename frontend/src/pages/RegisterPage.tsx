import { FormEvent, useState } from "react";

import { api } from "../api/client";
import { BottomNav, Card, ErrorMessage, Field, Layout } from "../components/Layout";

export function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/auth/customer/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          phone,
          birth_date: birthDate,
          consent_accepted: consent
        })
      });
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось зарегистрироваться");
    } finally {
      setLoading(false);
    }
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
          <button disabled={loading}>{loading ? "Сохраняем..." : "Зарегистрироваться"}</button>
        </form>
      </Card>
      <BottomNav />
    </Layout>
  );
}

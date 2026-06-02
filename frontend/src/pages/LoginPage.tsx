import { FormEvent, useState } from "react";

import { api } from "../api/client";
import { Card, ErrorMessage, Field, Layout } from "../components/Layout";

type LoginMode = "credentials" | "code";

export function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("credentials");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body =
        mode === "code"
          ? { access_code: accessCode.trim() }
          : { phone, password };
      await api("/auth/customer/login", {
        method: "POST",
        body: JSON.stringify(body)
      });
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Вход" subtitle="Войдите в личный кабинет покупателя">
      <Card>
        <div className="segmented login-mode">
          <button
            type="button"
            className={mode === "credentials" ? "active" : ""}
            onClick={() => setMode("credentials")}
          >
            Телефон и пароль
          </button>
          <button
            type="button"
            className={mode === "code" ? "active" : ""}
            onClick={() => setMode("code")}
          >
            Код доступа
          </button>
        </div>
        <form className="form" onSubmit={submit}>
          {mode === "credentials" ? (
            <>
              <Field label="Телефон">
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
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
            </>
          ) : (
            <>
              <Field label="Код доступа">
                <input
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  autoComplete="one-time-code"
                  required
                />
              </Field>
              <p className="muted login-code-hint">
                Уникальный код выдаётся один раз при регистрации. Сохраните его — восстановить код
                нельзя.
              </p>
            </>
          )}
          <ErrorMessage message={error} />
          <button disabled={loading}>{loading ? "Входим..." : "Войти"}</button>
        </form>
        <p className="muted login-register-link">
          Нет аккаунта? <a href="/register">Подключить бонусы</a>
        </p>
      </Card>
    </Layout>
  );
}

import { useEffect, useState } from "react";

const STORAGE_KEY = "bonus_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(STORAGE_KEY) !== "accepted");
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="cookie-banner" role="dialog" aria-label="Уведомление о cookie">
      <div className="cookie-banner__content">
        <p>
          Мы используем файлы cookie для входа в личный кабинет и сохранения вашей сессии. Продолжая
          пользоваться сайтом, вы соглашаетесь с их использованием.
        </p>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "accepted");
            setVisible(false);
          }}
        >
          Принять
        </button>
      </div>
    </div>
  );
}

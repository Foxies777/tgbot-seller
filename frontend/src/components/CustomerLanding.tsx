export function CustomerLanding() {
  return (
    <main className="customer-landing">
      <div className="customer-landing__icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="48" height="48" rx="12" fill="#2563EB" />
          <path
            d="M24 14v4M18 18h12M16 22h16v14a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V22z"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M20 22h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <h1 className="customer-landing__title">Бонусы для вас</h1>
      <p className="customer-landing__subtitle">
        Получайте бонусы, кэшбек и выгодные предложения
      </p>

      <ul className="customer-landing__features">
        <li>
          <span className="feature-icon feature-icon--blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <strong>Кэшбек с покупок</strong>
            <p>Возвращайте часть суммы бонусами после каждой покупки</p>
          </div>
        </li>

        <li>
          <span className="feature-icon feature-icon--orange" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8H8M12 8h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <strong>Подарки ко дню рождения</strong>
            <p>Получайте специальные бонусы и приятные предложения в ваш праздник</p>
          </div>
        </li>

        <li>
          <span className="feature-icon feature-icon--green" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 19V5M12 5l-4 4M12 5l4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <strong>Персональные предложения</strong>
            <p>Пользуйтесь акциями, скидками и бонусными программами</p>
          </div>
        </li>
      </ul>

      <div className="customer-landing__actions">
        <a className="button-link customer-landing__connect" href="/register">
          Зарегистрироваться
        </a>
        <a className="customer-landing__login" href="/login">
          Войти
        </a>
      </div>
    </main>
  );
}
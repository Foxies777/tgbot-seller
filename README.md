# TGBot Seller Loyalty MVP

MVP бонусной системы для офлайн-точки: Telegram-бот для клиентов, React PWA для покупателя, продавца и админа, REST API (`/api/v1`), PostgreSQL и Alembic.

## Возможности

- Регистрация и вход покупателя в PWA (`/register`, `/app`): телефон, QR, история, спецпредложения.
- Telegram-бот: `/start`, `/balance`, `/qr`, продажи продавцом по deep link/QR.
- Кабинет продавца (`/seller`): вход по телефону и паролю, сканирование QR, начисление и списание баллов.
- Админка (`/admin`): настройки бонусов, приветственные бонусы, создание продавцов, спецпредложения, транзакции.
- Защита от дублей через заголовок `Idempotency-Key`.
- PostgreSQL, миграции Alembic (применяются при старте контейнера `app`).

## Локальный запуск

1. Создайте `.env`:

```bash
cp .env.example .env
```

Заполните как минимум `BOT_TOKEN`, `BOT_USERNAME`, `SECRET_KEY` (не короче 16 символов), `DATABASE_URL` для Docker уже задан в примере.

2. Соберите и запустите PostgreSQL и приложение (frontend собирается в образе, миграции — при старте):

```bash
docker compose up --build
```

3. Создайте **первого администратора** (без него в `/admin` не войти):

```bash
docker compose exec app python -m app.cli create-admin --username admin --password "YourPassword8" --full-name "Админ"
```

Пароль — не короче 8 символов. Повторный запуск с тем же `--username` обновит пароль.

4. Откройте в браузере:

| Страница | HTTP | HTTPS (рекомендуется) |
|----------|------|------------------------|
| Healthcheck | `http://localhost:8000/healthz` | `https://localhost:8443/healthz` |
| PWA покупателя | `http://localhost:8000/app` | `https://localhost:8443/app` |
| Регистрация покупателя | `http://localhost:8000/register` | `https://localhost:8443/register` |
| Кабинет продавца | `http://localhost:8000/seller` | `https://localhost:8443/seller` |
| Админка | `http://localhost:8000/admin` | `https://localhost:8443/admin` |

### HTTPS с самоподписанным сертификатом

Для камеры QR на телефоне и PWA нужен **HTTPS**. В проекте есть nginx на порту **8443**.

1. Сгенерируйте сертификат (один раз, или после смены IP в Wi‑Fi):

```bash
python scripts/generate_ssl_cert.py
```

Если OpenSSL не установлен в системе:

```bash
docker compose --profile tools run --rm certgen
```

Скрипт добавит в сертификат `localhost`, `127.0.0.1` и IP вашего ПК в локальной сети. При необходимости укажите IP в `.env`:

```env
CERT_EXTRA_IP=192.168.1.42
```

2. Запустите стек — сервис `cert-init` создаст базовый сертификат автоматически, если файлов ещё нет:

```bash
docker compose up --build
```

3. Откройте `https://localhost:8443/app`. Браузер предупредит о самоподписанном сертификате — для локальной разработки это нормально, подтвердите исключение.

Файлы сертификата: `certs/cert.pem`, `certs/key.pem` (не коммитятся в git).

## Доступ с телефона в той же Wi‑Fi

Приложение слушает `0.0.0.0:8000` (HTTP) и `0.0.0.0:8443` (HTTPS через nginx).

1. На ПК с Docker узнайте IPv4 (Windows: `ipconfig`, адаптер Wi‑Fi).
2. Сгенерируйте сертификат с этим IP: `python scripts/generate_ssl_cert.py --extra 192.168.1.42` (или задайте `CERT_EXTRA_IP` в `.env`).
3. На телефоне откройте **`https://192.168.1.42:8443/app`** (подставьте свой IP).
4. Подтвердите предупреждение о самоподписанном сертификате.
5. Оба устройства — в одной сети Wi‑Fi (гостевая сеть с изоляцией клиентов не подойдёт).
6. Если не открывается — разрешите входящие подключения на порты **8000** и **8443** в брандмауэре Windows.

Для камеры QR и установки PWA на iPhone используйте именно **HTTPS** (`:8443`), не HTTP.

## Администраторы и продавцы

### Администратор

| Способ | Когда использовать |
|--------|-------------------|
| CLI `create-admin` | Первый админ и добавление новых логинов |
| Вход в `/admin` | Логин и пароль из таблицы `admins` |

Создание или обновление админа:

```bash
docker compose exec app python -m app.cli create-admin --username admin --password "YourPassword8"
```

Дополнительных админов через UI нет — только CLI с новым `--username`.

### Продавец (веб-кабинет `/seller`)

1. Войдите в `/admin` под администратором.
2. В блоке **«Новый продавец»** укажите имя, телефон и пароль (мин. 8 символов).
3. Продавец входит на `/seller` с тем же телефоном и паролем.

Тот же сценарий доступен через API: `POST /api/v1/admin/sellers` (нужна сессия админа).

### Продавец в Telegram-боте

Запись в БД с привязкой к Telegram ID (автосоздание при первом входе **не** выполняется):

```bash
docker compose exec app python -m app.cli create-seller --telegram-id 123456789 --full-name "Петр" --username petrov
```

`telegram_id` можно узнать, например, у [@userinfobot](https://t.me/userinfobot). Пользователь должен быть активен (`is_active`).

## React/PWA

Исходники — в `frontend/`, сборка попадает в `app/static/pwa`. В Docker это делается автоматически на этапе `docker build`.

Локальная пересборка без полного образа:

```bash
cd frontend
npm install
npm run build
```

Разработка с hot reload:

```bash
cd frontend
npm run dev
```

PWA: `display: standalone`, service worker, mobile-first UI.

## Web API

Сценарии PWA и интеграций — через `/api/v1`:

- **покупатель** — регистрация, вход по телефону, профиль, QR, история, спецпредложения;
- **продавец** — `POST /auth/seller/login`, проверка QR, начисление/списание, регистрация покупателя;
- **админ** — `POST /auth/admin/login`, настройки, продавцы, спецпредложения, транзакции.

Для изменяющих запросов продажи поддерживается заголовок `Idempotency-Key`.

## Telegram webhook

Бот принимает обновления только через webhook (`POST /telegram/webhook`). В `APP_ENV=production` webhook выставляется при старте приложения.

Для production в `.env`:

```env
APP_ENV=production
BOT_TOKEN=...
BOT_USERNAME=...
WEBHOOK_BASE_URL=https://your-domain.example
TELEGRAM_WEBHOOK_SECRET=long-random-secret
SECRET_KEY=long-random-signing-secret
```

URL webhook:

```text
https://your-domain.example/telegram/webhook
```

Запросы принимаются только с заголовком `X-Telegram-Bot-Api-Secret-Token`, совпадающим с `TELEGRAM_WEBHOOK_SECRET`.

Для локальной отладки бота нужен публичный HTTPS-туннель (ngrok, cloudflared и т.п.) на порт 8000 и `WEBHOOK_BASE_URL` на этот адрес; при `APP_ENV=local` webhook при старте **не** регистрируется — настройте его вручную через Telegram Bot API или временно используйте `APP_ENV=production` с туннелем.

## VPS deployment

1. Установить Docker и Docker Compose plugin.
2. Скопировать проект и `.env` на сервер.
3. `docker compose up -d --build`
4. Создать админа: `docker compose exec app python -m app.cli create-admin ...`
5. Reverse proxy с HTTPS на `127.0.0.1:8000`.
6. Проверить `/healthz`, войти в `/admin`, настроить webhook и отправить боту `/start`.

## Проверки

```bash
pip install -e ".[dev]"
pytest
ruff check .
```

## CLI

```bash
python -m app.cli create-admin --username <login> --password <pass> [--full-name "Имя"]
python -m app.cli create-seller --telegram-id <id> --full-name "Имя" [--username tg_user]
```

В Docker замените вызов на `docker compose exec app python -m app.cli ...`.

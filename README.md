# TGBot Seller Loyalty MVP

MVP бонусной системы для офлайн-точки: Telegram-бот для клиентов и продавцов, FastAPI webhook, PostgreSQL, server-rendered admin UI и web-сканер без React.

## Возможности

- Регистрация клиента через `/start`.
- Просмотр баланса через `/balance`.
- Персональный QR/deep link через `/qr`.
- Продажа продавцом после сканирования QR: начисление или списание баллов.
- Уведомление клиента в Telegram после операции.
- Админка `/admin`: настройки процента, срок жизни баллов, ручные коррекции с аудитом, праздники, промокоды, транзакции.
- Защита от дублей через `idempotency_key`.
- PostgreSQL миграции через Alembic.

## Локальный запуск

1. Создайте `.env`:

```bash
cp .env.example .env
```

2. Запустите PostgreSQL и приложение:

```bash
docker compose up --build
```

3. Примените миграции:

```bash
docker compose exec app alembic upgrade head
```

4. Откройте:

- healthcheck: `http://localhost:8000/healthz`
- админка: `http://localhost:8000/admin`
- сканер: `http://localhost:8000/scan`

## Telegram webhook

Для production укажите:

```env
APP_ENV=production
BOT_TOKEN=...
BOT_USERNAME=...
WEBHOOK_BASE_URL=https://your-domain.example
TELEGRAM_WEBHOOK_SECRET=long-random-secret
```

При старте в `APP_ENV=production` приложение установит webhook на:

```text
https://your-domain.example/telegram/webhook
```

Telegram будет принят только с заголовком `X-Telegram-Bot-Api-Secret-Token`.

## Продавцы

На MVP продавцов можно выдать через env:

```env
SELLER_TELEGRAM_IDS=123456789,987654321
```

Первый вход такого пользователя по QR создаст запись в `sellers`.

## VPS deployment

Минимальная схема:

1. Установить Docker и Docker Compose plugin.
2. Скопировать проект и `.env` на сервер.
3. Поднять `docker compose up -d --build`.
4. Выполнить `docker compose exec app alembic upgrade head`.
5. Настроить reverse proxy с HTTPS на `127.0.0.1:8000`.
6. Проверить `/healthz` и отправить `/start` боту.

## Проверки

```bash
pip install -e ".[dev]"
pytest
ruff check .
```

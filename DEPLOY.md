# Деплой на VPS / хостинг

Инструкция для production-запуска через Docker. Локальная разработка — `docker compose up` (без `.prod`).

## Что нужно на сервере

- Docker и Docker Compose plugin
- Домен с A-записью на IP сервера
- Открытые порты **80** и **443** (для HTTPS и Telegram webhook)
- Приложение слушает **127.0.0.1:8000** — наружу отдаёт reverse proxy

## 1. Подготовка

```bash
git clone https://github.com/Foxies777/tgbot-seller.git
cd tgbot-seller
git checkout almaz   # или ваша production-ветка

cp .env.production.example .env
nano .env
```

Обязательно замените:

| Переменная | Описание |
|------------|----------|
| `POSTGRES_PASSWORD` | Пароль БД |
| `SECRET_KEY` | Секрет подписи сессий (32+ символов) |
| `BOT_TOKEN` | Токен бота от @BotFather |
| `BOT_USERNAME` | Username бота без @ |
| `WEBHOOK_BASE_URL` | `https://ваш-домен.ru` |
| `TELEGRAM_WEBHOOK_SECRET` | Случайная строка для webhook |

`WEBHOOK_BASE_URL` должен совпадать с публичным HTTPS-адресом сайта.

## 2. Запуск приложения

```bash
chmod +x scripts/deploy_prod.sh
./scripts/deploy_prod.sh
```

Или вручную:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Проверка:

```bash
curl -fsS http://127.0.0.1:8000/healthz
```

## 3. HTTPS (обязательно)

Без HTTPS не работают: камера QR, PWA, secure cookies, Telegram webhook.

### Вариант A: Caddy (проще)

```bash
sudo apt install caddy
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
# замените your-domain.example на свой домен
sudo systemctl reload caddy
```

### Вариант B: nginx + certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/tgbot-seller
# замените your-domain.example
sudo ln -s /etc/nginx/sites-available/tgbot-seller /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.example
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Первый администратор

```bash
docker compose -f docker-compose.prod.yml exec app \
  python -m app.cli create-admin --username admin --password "YourPassword8" --full-name "Админ"
```

Вход: `https://ваш-домен.ru/admin`

## 5. Проверка после деплоя

- [ ] `https://ваш-домен.ru/healthz` → `{"status":"ok"}`
- [ ] `https://ваш-домен.ru/app` — PWA покупателя
- [ ] `https://ваш-домен.ru/seller` — кабинет продавца (камера QR)
- [ ] `https://ваш-домен.ru/admin` — админка
- [ ] Бот отвечает на `/start` в Telegram

## 6. Обновление

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Миграции БД применяются автоматически при старте контейнера `app`.

## 7. Данные и бэкапы

Docker volumes:

| Volume | Содержимое |
|--------|------------|
| `postgres_data` | База PostgreSQL |
| `uploads_data` | Загруженные изображения акций |

Бэкап БД:

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U loyalty loyalty > backup-$(date +%F).sql
```

## Отличия production от dev

| | Dev (`docker-compose.yml`) | Production (`docker-compose.prod.yml`) |
|--|---------------------------|----------------------------------------|
| PWA | hot-reload через `frontend` | вшито в образ при сборке |
| Service Worker | выключен | включён |
| Uvicorn | `--reload` | без reload, `--proxy-headers` |
| Код | volume `.:/app` | только образ |
| HTTPS | self-signed nginx :8443 | Let's Encrypt на хосте |
| `APP_ENV` | `local` | `production` |

## Troubleshooting

**Webhook не работает** — проверьте `WEBHOOK_BASE_URL`, `APP_ENV=production`, доступность `https://домен/telegram/webhook` с заголовком `X-Telegram-Bot-Api-Secret-Token`.

**Камера QR не открывается** — нужен валидный HTTPS, не self-signed.

**502 от nginx** — `docker compose -f docker-compose.prod.yml ps` и логи: `docker compose -f docker-compose.prod.yml logs app`.

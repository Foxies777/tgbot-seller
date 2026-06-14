#!/usr/bin/env sh
# Create local dev accounts for /admin and /seller (idempotent).
set -eu

ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-devadmin88}"
SELLER_NAME="${SELLER_NAME:-Тестовый продавец}"
SELLER_PHONE="${SELLER_PHONE:-+79001234567}"
SELLER_PASS="${SELLER_PASS:-devseller88}"

run_cli() {
  if docker compose ps --status running app >/dev/null 2>&1; then
    docker compose exec -T app python -m app.cli "$@"
  else
    python -m app.cli "$@"
  fi
}

echo "Creating admin: ${ADMIN_USER}"
run_cli create-admin --username "${ADMIN_USER}" --password "${ADMIN_PASS}" --full-name "Dev Admin"

echo "Creating web seller: ${SELLER_PHONE}"
run_cli create-web-seller --full-name "${SELLER_NAME}" --phone "${SELLER_PHONE}" --password "${SELLER_PASS}"

cat <<EOF

Готово. Откройте в браузере:

  Покупатель (PWA):     http://localhost:8001/app
  Регистрация:          http://localhost:8001/register
  Вход покупателя:      http://localhost:8001/login
  Кабинет продавца:     http://localhost:8001/seller
  Админка:              http://localhost:8001/admin

  HTTPS (камера QR):    https://localhost:8443/app
  (порт 8000 на ПК занят другим приложением — loyalty на 8001)

Учётные данные (только для локальной разработки):

  Админ:    ${ADMIN_USER} / ${ADMIN_PASS}
  Продавец: ${SELLER_PHONE} / ${SELLER_PASS}

Покупатель — зарегистрируйтесь на /register (отдельный аккаунт).

EOF

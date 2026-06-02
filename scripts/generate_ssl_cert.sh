#!/bin/sh
set -eu

CERTS_DIR="${CERTS_DIR:-/certs}"
CERT_FILE="${CERTS_DIR}/cert.pem"
KEY_FILE="${CERTS_DIR}/key.pem"
DAYS="${CERT_DAYS:-825}"

if [ -f "${CERT_FILE}" ] && [ -f "${KEY_FILE}" ] && [ "${FORCE_CERT:-0}" != "1" ]; then
  echo "Certificates already exist in ${CERTS_DIR}, skipping generation."
  if [ -n "${CERT_EXTRA_IP:-}" ]; then
    if ! openssl x509 -in "${CERT_FILE}" -noout -text 2>/dev/null | grep -q "IP Address:${CERT_EXTRA_IP}"; then
      echo ""
      echo "ERROR: Existing certificate does not include CERT_EXTRA_IP=${CERT_EXTRA_IP}."
      echo "Service Worker and camera on https://${CERT_EXTRA_IP}:8443 will fail until you run:"
      echo "  docker compose --profile tools run --rm certgen"
      echo "  docker compose restart nginx"
      echo ""
    fi
  fi
  if [ -z "${CERT_EXTRA_IP:-}" ]; then
    echo ""
    echo "WARNING: CERT_EXTRA_IP is not set."
    echo "HTTPS from a phone via https://YOUR_LAN_IP:8443 will fail until you:"
    echo "  1. Set CERT_EXTRA_IP in .env to your PC's Wi-Fi IPv4"
    echo "  2. Run: docker compose --profile tools run --rm certgen"
    echo "  3. Run: docker compose restart nginx"
    echo ""
  fi
  exit 0
fi

mkdir -p "${CERTS_DIR}"

if [ -z "${CERT_EXTRA_IP:-}" ]; then
  echo ""
  echo "WARNING: CERT_EXTRA_IP is not set."
  echo "Certificate will only work for localhost. Phone access via LAN IP will show SSL errors."
  echo "Set CERT_EXTRA_IP in .env and re-run certgen after changing your network."
  echo ""
fi

DNS_NAMES="DNS.1 = localhost"
IP_INDEX=1
IP_NAMES="IP.${IP_INDEX} = 127.0.0.1"

if [ -n "${CERT_EXTRA_IP:-}" ]; then
  IP_INDEX=$((IP_INDEX + 1))
  IP_NAMES="${IP_NAMES}
IP.${IP_INDEX} = ${CERT_EXTRA_IP}"
fi

cat > "${CERTS_DIR}/openssl.cnf" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = tgbot-seller.local

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
${DNS_NAMES}
${IP_NAMES}
EOF

openssl req -x509 -nodes -newkey rsa:2048 -days "${DAYS}" \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -config "${CERTS_DIR}/openssl.cnf" \
  -extensions v3_req

rm -f "${CERTS_DIR}/openssl.cnf"
echo "Created ${CERT_FILE} and ${KEY_FILE}"

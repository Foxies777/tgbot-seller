#!/bin/sh
set -eu

CERTS_DIR="${CERTS_DIR:-/certs}"
CERT_FILE="${CERTS_DIR}/cert.pem"
KEY_FILE="${CERTS_DIR}/key.pem"
DAYS="${CERT_DAYS:-825}"

if [ -f "${CERT_FILE}" ] && [ -f "${KEY_FILE}" ] && [ "${FORCE_CERT:-0}" != "1" ]; then
  echo "Certificates already exist in ${CERTS_DIR}, skipping generation."
  exit 0
fi

mkdir -p "${CERTS_DIR}"

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

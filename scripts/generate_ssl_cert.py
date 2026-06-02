#!/usr/bin/env python3
"""Generate a self-signed TLS certificate for local HTTPS development."""

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CERTS_DIR = ROOT / "certs"
CERT_FILE = CERTS_DIR / "cert.pem"
KEY_FILE = CERTS_DIR / "key.pem"


def detect_local_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


def collect_hosts(extra: list[str]) -> tuple[list[str], list[str]]:
    dns_names = {"localhost"}
    ip_addresses = {"127.0.0.1"}

    local_ip = detect_local_ip()
    if local_ip:
        ip_addresses.add(local_ip)

    for value in extra:
        item = value.strip()
        if not item:
            continue
        if item.replace(".", "").isdigit() or ":" in item:
            ip_addresses.add(item)
        else:
            dns_names.add(item)

    env_ip = os.getenv("CERT_EXTRA_IP", "").strip()
    if env_ip:
        ip_addresses.add(env_ip)

    return sorted(dns_names), sorted(ip_addresses)


def build_openssl_config(dns_names: list[str], ip_addresses: list[str]) -> str:
    alt_lines = [f"DNS.{index + 1} = {name}" for index, name in enumerate(dns_names)]
    alt_lines.extend(
        f"IP.{index + 1} = {address}" for index, address in enumerate(ip_addresses)
    )
    alt_names = "\n".join(alt_lines)
    return f"""[req]
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
{alt_names}
"""


def generate_cert(days: int, extra: list[str], force: bool) -> None:
    if CERT_FILE.exists() and KEY_FILE.exists() and not force:
        print(f"Certificates already exist in {CERTS_DIR}")
        print("Use --force to regenerate.")
        return

    CERTS_DIR.mkdir(parents=True, exist_ok=True)
    dns_names, ip_addresses = collect_hosts(extra)
    config_path = CERTS_DIR / "openssl.cnf"
    config_path.write_text(build_openssl_config(dns_names, ip_addresses), encoding="utf-8")

    command = [
        "openssl",
        "req",
        "-x509",
        "-nodes",
        "-newkey",
        "rsa:2048",
        "-days",
        str(days),
        "-keyout",
        str(KEY_FILE),
        "-out",
        str(CERT_FILE),
        "-config",
        str(config_path),
        "-extensions",
        "v3_req",
    ]
    try:
        subprocess.run(command, check=True)
    except FileNotFoundError as error:
        raise SystemExit(
            "OpenSSL not found. Install OpenSSL or run:\n"
            "  docker compose --profile tools run --rm certgen"
        ) from error
    except subprocess.CalledProcessError as error:
        raise SystemExit(f"OpenSSL failed with exit code {error.returncode}") from error
    finally:
        config_path.unlink(missing_ok=True)

    print(f"Created {CERT_FILE}")
    print(f"Created {KEY_FILE}")
    print("DNS names:", ", ".join(dns_names))
    print("IP addresses:", ", ".join(ip_addresses))
    print("\nOpen the app via HTTPS:")
    if ip_addresses:
        lan_ip = next((ip for ip in ip_addresses if ip != "127.0.0.1"), None)
        if lan_ip:
            print(f"  https://{lan_ip}:8443/app")
    print("  https://localhost:8443/app")
    print("\nBrowsers will warn about the self-signed certificate — accept it for local use.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--days",
        type=int,
        default=int(os.getenv("CERT_DAYS", "825")),
        help="Certificate validity in days (default: 825)",
    )
    parser.add_argument(
        "--extra",
        action="append",
        default=[],
        help="Extra DNS name or IP for Subject Alternative Name",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate certificates even if they already exist",
    )
    args = parser.parse_args()
    generate_cert(days=args.days, extra=args.extra, force=args.force)


if __name__ == "__main__":
    main()

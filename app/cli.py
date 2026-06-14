import argparse
import asyncio
from getpass import getpass

from sqlalchemy import select

from app.core.security import hash_password, normalize_phone
from app.db.session import async_session_factory
from app.models import Admin, Seller


async def create_admin(username: str, password: str, full_name: str | None) -> None:
    async with async_session_factory() as session:
        result = await session.execute(select(Admin).where(Admin.username == username))
        admin = result.scalar_one_or_none()
        if admin is None:
            admin = Admin(
                username=username,
                password_hash=hash_password(password),
                full_name=full_name,
            )
            session.add(admin)
            action = "created"
        else:
            admin.password_hash = hash_password(password)
            admin.full_name = full_name or admin.full_name
            admin.is_active = True
            action = "updated"
        await session.commit()
    print(f"Admin '{username}' {action}.")


async def create_web_seller(full_name: str, phone: str, password: str) -> None:
    phone_normalized = normalize_phone(phone)
    async with async_session_factory() as session:
        result = await session.execute(
            select(Seller).where(Seller.phone_normalized == phone_normalized)
        )
        seller = result.scalar_one_or_none()
        if seller is None:
            seller = Seller(
                full_name=full_name.strip(),
                phone=phone,
                phone_normalized=phone_normalized,
                password_hash=hash_password(password),
                is_active=True,
            )
            session.add(seller)
            action = "created"
        else:
            seller.full_name = full_name.strip()
            seller.phone = phone
            seller.password_hash = hash_password(password)
            seller.is_active = True
            action = "updated"
        await session.commit()
    print(f"Web seller '{phone}' {action}.")


async def create_seller(telegram_id: int, full_name: str, username: str | None) -> None:
    async with async_session_factory() as session:
        result = await session.execute(select(Seller).where(Seller.telegram_id == telegram_id))
        seller = result.scalar_one_or_none()
        if seller is None:
            seller = Seller(telegram_id=telegram_id, full_name=full_name, username=username)
            session.add(seller)
            action = "created"
        else:
            seller.full_name = full_name
            seller.username = username
            seller.is_active = True
            action = "updated"
        await session.commit()
    print(f"Seller '{telegram_id}' {action}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Loyalty MVP management commands")
    subparsers = parser.add_subparsers(dest="command", required=True)

    admin_parser = subparsers.add_parser("create-admin", help="Create or update admin")
    admin_parser.add_argument("--username", required=True)
    admin_parser.add_argument("--password")
    admin_parser.add_argument("--full-name")

    seller_parser = subparsers.add_parser("create-seller", help="Create or update Telegram seller")
    seller_parser.add_argument("--telegram-id", required=True, type=int)
    seller_parser.add_argument("--full-name", required=True)
    seller_parser.add_argument("--username")

    web_seller_parser = subparsers.add_parser(
        "create-web-seller", help="Create or update web /seller login"
    )
    web_seller_parser.add_argument("--full-name", required=True)
    web_seller_parser.add_argument("--phone", required=True)
    web_seller_parser.add_argument("--password")

    args = parser.parse_args()

    if args.command == "create-admin":
        password = args.password or getpass("Admin password: ")
        if len(password) < 8:
            raise SystemExit("Admin password must be at least 8 characters.")
        asyncio.run(create_admin(args.username, password, args.full_name))
        return

    if args.command == "create-seller":
        asyncio.run(create_seller(args.telegram_id, args.full_name, args.username))
        return

    if args.command == "create-web-seller":
        password = args.password or getpass("Seller password: ")
        if len(password) < 8:
            raise SystemExit("Seller password must be at least 8 characters.")
        asyncio.run(create_web_seller(args.full_name, args.phone, password))


if __name__ == "__main__":
    main()

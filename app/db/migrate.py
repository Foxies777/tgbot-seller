import subprocess


def run_migrations() -> None:
    subprocess.run(["alembic", "upgrade", "head"], check=True)

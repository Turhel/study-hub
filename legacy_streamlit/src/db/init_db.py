from __future__ import annotations

from sqlmodel import SQLModel

from src.db import models  # noqa: F401
from src.db.session import engine


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


if __name__ == "__main__":
    init_db()

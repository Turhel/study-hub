from __future__ import annotations

import os
from pathlib import Path

from sqlmodel import Session, create_engine


DEFAULT_DATABASE_URL = "sqlite:///data/study_hub.db"
DATABASE_URL = os.getenv("STUDY_HUB_DB_URL", DEFAULT_DATABASE_URL)

if DATABASE_URL.startswith("sqlite:///"):
    db_path = Path(DATABASE_URL.replace("sqlite:///", "", 1))
    db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, echo=False)


def get_session() -> Session:
    return Session(engine)

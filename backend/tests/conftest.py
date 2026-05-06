from __future__ import annotations

import os
import tempfile
from pathlib import Path


def _configure_default_test_database() -> None:
    if os.getenv("STUDY_HUB_TEST_USE_REMOTE", "").strip().casefold() in {"1", "true", "yes", "on"}:
        return

    temp_dir = Path(tempfile.gettempdir()) / "study-hub-pytest"
    temp_dir.mkdir(parents=True, exist_ok=True)
    db_path = temp_dir / "study_hub_test_suite.db"

    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ["STUDY_HUB_AUTO_SYNC_STRUCTURAL_ON_STARTUP"] = "false"
    os.environ["STUDY_HUB_LLM_ENABLED"] = "false"
    os.environ["STUDY_HUB_ESSAY_CORRECTION_ENABLED"] = "false"
    os.environ["STUDY_HUB_ESSAY_STUDY_ENABLED"] = "false"


_configure_default_test_database()

if os.getenv("STUDY_HUB_TEST_USE_REMOTE", "").strip().casefold() not in {"1", "true", "yes", "on"}:
    from app.db import init_db

    init_db()

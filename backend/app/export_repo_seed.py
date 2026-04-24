from __future__ import annotations

import json

from app.db import get_session, init_db
from app.services.repo_seed_service import export_structural_seed_from_session


def main() -> None:
    init_db()
    with get_session() as session:
        summary = export_structural_seed_from_session(session)
    print(json.dumps(summary.__dict__, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

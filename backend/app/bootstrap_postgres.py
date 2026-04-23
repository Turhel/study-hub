from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.settings import get_default_sqlite_db_path
from app.services.postgres_bootstrap_service import bootstrap_structural_data_to_postgres


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Carrega dados estruturais do SQLite local para o Postgres configurado em DATABASE_URL."
    )
    parser.add_argument(
        "--source-sqlite",
        default=str(get_default_sqlite_db_path()),
        help="Caminho para o SQLite oficial de origem. Default: backend/data/study_hub.db",
    )
    args = parser.parse_args()

    summary = bootstrap_structural_data_to_postgres(Path(args.source_sqlite))
    print(json.dumps(summary.__dict__, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

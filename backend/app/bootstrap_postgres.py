from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.settings import get_default_sqlite_db_path
from app.services.postgres_bootstrap_service import (
    bootstrap_structural_data_to_postgres,
    bootstrap_usage_data_to_postgres,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Carrega dados do SQLite local para o Postgres configurado em DATABASE_URL."
    )
    parser.add_argument(
        "--source-sqlite",
        default=str(get_default_sqlite_db_path()),
        help="Caminho para o SQLite oficial de origem. Necessario para uso; opcional para estrutura se os seeds do repo existirem.",
    )
    parser.add_argument(
        "--include-usage",
        action="store_true",
        help="Tambem carrega dados operacionais/uso, sem apagar o que ja existe no Postgres.",
    )
    parser.add_argument(
        "--usage-only",
        action="store_true",
        help="Carrega apenas dados operacionais/uso. Nao reimporta estrutura nem roadmap.",
    )
    args = parser.parse_args()
    if args.usage_only and args.include_usage:
        parser.error("Use apenas um entre --include-usage e --usage-only.")

    source_path = Path(args.source_sqlite)
    result: dict[str, object] = {}

    if not args.usage_only:
        structural_summary = bootstrap_structural_data_to_postgres(source_path)
        result["structural"] = structural_summary.__dict__

    if args.include_usage or args.usage_only:
        usage_summary = bootstrap_usage_data_to_postgres(source_path)
        result["usage"] = usage_summary.__dict__

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Any
from urllib import error, parse, request


DEFAULT_TIMEOUT_SECONDS = 30


@dataclass
class CheckResult:
    endpoint: str
    status: str
    http_status: int | None
    duration_ms: int
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _http_get(base_url: str, endpoint: str, timeout_seconds: int) -> tuple[int, Any, int]:
    encoded_endpoint = parse.quote(endpoint.lstrip("/"), safe="/?=&")
    url = parse.urljoin(base_url.rstrip("/") + "/", encoded_endpoint)
    started = time.perf_counter()
    req = request.Request(url, method="GET")
    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            body = response.read().decode("utf-8")
            duration_ms = int((time.perf_counter() - started) * 1000)
            payload = json.loads(body)
            return int(response.status), payload, duration_ms
    except error.HTTPError as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        raw_body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            payload = {"raw_body": raw_body}
        return int(exc.code), payload, duration_ms


def _require(payload: Any, path: list[str], errors: list[str]) -> Any:
    current = payload
    for key in path:
        if not isinstance(current, dict) or key not in current:
            errors.append(f"Campo obrigatorio ausente: {'.'.join(path)}")
            return None
        current = current[key]
    return current


def _check_health(payload: Any, result: CheckResult) -> None:
    _require(payload, ["status"], result.errors)


def _check_system_capabilities(payload: Any, result: CheckResult) -> None:
    _require(payload, ["machine_profile"], result.errors)
    _require(payload, ["database", "dialect"], result.errors)
    _require(payload, ["database", "using_remote_database"], result.errors)
    _require(payload, ["llm", "enabled"], result.errors)
    _require(payload, ["features", "essay_correction_enabled"], result.errors)
    _require(payload, ["features", "essay_study_enabled"], result.errors)


def _check_roadmap_summary(payload: Any, result: CheckResult) -> None:
    discipline_count = _require(payload, ["discipline_count"], result.errors)
    node_count = _require(payload, ["node_count"], result.errors)
    edge_count = _require(payload, ["edge_count"], result.errors)
    _require(payload, ["disciplines"], result.errors)
    if isinstance(discipline_count, int) and discipline_count <= 0:
        result.warnings.append("discipline_count veio <= 0")
    if isinstance(node_count, int) and node_count <= 0:
        result.warnings.append("node_count veio <= 0")
    if isinstance(edge_count, int) and edge_count <= 0:
        result.warnings.append("edge_count veio <= 0")


def _check_roadmap_validation(payload: Any, result: CheckResult) -> None:
    _require(payload, ["is_valid"], result.errors)
    _require(payload, ["errors_count"], result.errors)
    _require(payload, ["warnings_count"], result.errors)


def _check_roadmap_mapping_coverage(payload: Any, result: CheckResult) -> None:
    total_subjects = _require(payload, ["total_subjects"], result.errors)
    mapped_subjects = _require(payload, ["mapped_subjects"], result.errors)
    coverage_percent = _require(payload, ["coverage_percent"], result.errors)

    if isinstance(total_subjects, int) and total_subjects > 0:
        if not isinstance(coverage_percent, (int, float)) or coverage_percent <= 0:
            result.errors.append("coverage_percent deveria ser > 0 quando total_subjects > 0")
        elif coverage_percent < 100:
            result.warnings.append(f"coverage_percent abaixo de 100: {coverage_percent}")
    if isinstance(total_subjects, int) and isinstance(mapped_subjects, int) and mapped_subjects > total_subjects:
        result.errors.append("mapped_subjects nao pode ser maior que total_subjects")


def _check_study_plan_today(payload: Any, result: CheckResult) -> None:
    _require(payload, ["summary"], result.errors)
    total_questions = _require(payload, ["summary", "total_questions"], result.errors)
    focus_count = _require(payload, ["summary", "focus_count"], result.errors)
    items = _require(payload, ["items"], result.errors)
    if items is None or not isinstance(items, list):
        return
    item_total = 0
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("planned_questions"), int):
            item_total += item["planned_questions"]
    if isinstance(focus_count, int) and focus_count != len(items):
        result.errors.append("summary.focus_count deve bater com len(items)")
    if isinstance(total_questions, int) and total_questions != item_total:
        result.errors.append("summary.total_questions deve bater com a soma de planned_questions")
    if isinstance(focus_count, int) and focus_count > 0 and not items:
        result.errors.append("items nao pode ser vazio quando focus_count > 0")
    if not items:
        result.warnings.append("/api/study-plan/today vazio")
        return

    required_item_fields = [
        "discipline",
        "subject_id",
        "planned_questions",
        "roadmap_mapped",
        "roadmap_status",
    ]
    for field_name in required_item_fields:
        if field_name not in items[0]:
            result.errors.append(f"Campo obrigatorio ausente no primeiro item de study-plan: {field_name}")


def _check_study_guide_preferences(payload: Any, result: CheckResult) -> None:
    daily_minutes = _require(payload, ["daily_minutes"], result.errors)
    intensity = _require(payload, ["intensity"], result.errors)
    max_focus_count = _require(payload, ["max_focus_count"], result.errors)
    max_questions = _require(payload, ["max_questions"], result.errors)
    _require(payload, ["include_reviews"], result.errors)
    _require(payload, ["include_new_content"], result.errors)

    if isinstance(daily_minutes, int) and not 15 <= daily_minutes <= 360:
        result.errors.append("daily_minutes fora do intervalo esperado")
    if intensity not in {"leve", "normal", "forte"}:
        result.errors.append("intensity deveria ser leve, normal ou forte")
    if isinstance(max_focus_count, int) and not 1 <= max_focus_count <= 5:
        result.errors.append("max_focus_count fora do intervalo esperado")
    if isinstance(max_questions, int) and not 1 <= max_questions <= 80:
        result.errors.append("max_questions fora do intervalo esperado")


def _check_stats_overview(payload: Any, result: CheckResult) -> None:
    required_fields = [
        "total_questions_all_time",
        "total_questions_today",
        "total_questions_this_week",
        "total_questions_this_month",
        "accuracy_all_time",
        "accuracy_this_week",
        "accuracy_this_month",
        "risk_blocks_count",
        "weak_subjects_count",
    ]
    for field_name in required_fields:
        _require(payload, [field_name], result.errors)


def _check_stats_disciplines(payload: Any, result: CheckResult) -> None:
    if not isinstance(payload, list):
        result.errors.append("Payload de /api/stats/disciplines deveria ser lista")
        return
    if not payload:
        result.warnings.append("/api/stats/disciplines vazio")
        return
    first = payload[0]
    if not isinstance(first, dict):
        result.errors.append("Primeiro item de /api/stats/disciplines deveria ser objeto")
        return
    for field_name in ["discipline", "strategic_discipline", "total_questions", "accuracy"]:
        if field_name not in first:
            result.errors.append(f"Campo obrigatorio ausente no primeiro item de stats/disciplines: {field_name}")


def _check_lesson_contents(payload: Any, result: CheckResult) -> None:
    if not isinstance(payload, list):
        result.errors.append("Payload de /api/lessons/contents deveria ser lista")
        return
    if not payload:
        result.warnings.append("/api/lessons/contents vazio")
        return
    first = payload[0]
    if not isinstance(first, dict):
        result.errors.append("Primeiro item de /api/lessons/contents deveria ser objeto")
        return
    for field_name in ["id", "title", "body_markdown", "extra_links", "is_published"]:
        if field_name not in first:
            result.errors.append(f"Campo obrigatorio ausente no primeiro item de lessons/contents: {field_name}")


def _check_free_study_catalog(payload: Any, result: CheckResult) -> None:
    disciplines = _require(payload, ["disciplines"], result.errors)
    if disciplines is None or not isinstance(disciplines, list):
        return
    if not disciplines:
        result.warnings.append("/api/free-study/catalog vazio")
        return

    first_discipline = disciplines[0]
    if not isinstance(first_discipline, dict):
        result.errors.append("Primeira disciplina do catalogo deveria ser objeto")
        return
    subareas = first_discipline.get("subareas")
    if not isinstance(subareas, list) or not subareas:
        result.warnings.append("Primeira disciplina do catalogo sem subareas")
        return
    subjects = subareas[0].get("subjects") if isinstance(subareas[0], dict) else None
    if not isinstance(subjects, list) or not subjects:
        result.warnings.append("Primeira subarea do catalogo sem subjects")
        return
    first_subject = subjects[0]
    if not isinstance(first_subject, dict):
        result.errors.append("Primeiro subject do catalogo deveria ser objeto")
        return
    if "subject_id" not in first_subject:
        result.errors.append("Campo obrigatorio ausente no primeiro subject do catalogo: subject_id")
    if first_subject.get("free_study_allowed") is not True:
        result.errors.append("free_study_allowed deveria ser true no primeiro subject do catalogo")


def _check_activity_recent(payload: Any, result: CheckResult) -> None:
    if not isinstance(payload, list):
        result.errors.append("Payload de /api/activity/recent deveria ser lista")
        return
    if not payload:
        result.warnings.append("/api/activity/recent vazio")


def _check_activity_today(payload: Any, result: CheckResult) -> None:
    _require(payload, ["date"], result.errors)
    _require(payload, ["question_attempts_registered"], result.errors)
    _require(payload, ["subjects_studied_today"], result.errors)
    _require(payload, ["blocks_impacted_today"], result.errors)


def _check_roadmap_mapping_gaps(payload: Any, result: CheckResult) -> None:
    _require(payload, ["unmapped_subjects"], result.errors)
    _require(payload, ["roadmap_nodes_without_subject"], result.errors)
    _require(payload, ["ambiguous_subjects"], result.errors)


def _check_block_progress_snapshot(payload: Any, result: CheckResult) -> None:
    _require(payload, ["discipline"], result.errors)
    _require(payload, ["reviewable_blocks"], result.errors)
    _require(payload, ["ready_to_advance"], result.errors)
    _require(payload, ["message"], result.errors)


CHECKS: list[tuple[str, Any]] = [
    ("/health", _check_health),
    ("/api/system/capabilities", _check_system_capabilities),
    ("/api/roadmap/summary", _check_roadmap_summary),
    ("/api/roadmap/validation", _check_roadmap_validation),
    ("/api/roadmap/mapping/coverage", _check_roadmap_mapping_coverage),
    ("/api/study-guide/preferences", _check_study_guide_preferences),
    ("/api/study-plan/today", _check_study_plan_today),
    ("/api/stats/overview", _check_stats_overview),
    ("/api/stats/disciplines", _check_stats_disciplines),
    ("/api/lessons/contents", _check_lesson_contents),
    ("/api/free-study/catalog", _check_free_study_catalog),
    ("/api/activity/recent", _check_activity_recent),
    ("/api/activity/today", _check_activity_today),
    ("/api/roadmap/mapping/gaps", _check_roadmap_mapping_gaps),
    ("/api/block-progress/discipline/Matemática", _check_block_progress_snapshot),
]


def run_smoke_check(base_url: str, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    checks: list[CheckResult] = []
    warnings: list[str] = []
    errors: list[str] = []

    for endpoint, validator in CHECKS:
        http_status: int | None = None
        duration_ms = 0
        payload: Any = None
        check = CheckResult(endpoint=endpoint, status="ok", http_status=None, duration_ms=0)

        try:
            http_status, payload, duration_ms = _http_get(base_url, endpoint, timeout_seconds)
            check.http_status = http_status
            check.duration_ms = duration_ms
            if http_status != 200:
                check.status = "error"
                check.errors.append(f"HTTP status inesperado: {http_status}")
            else:
                validator(payload, check)
                if check.errors:
                    check.status = "error"
                elif check.warnings:
                    check.status = "warn"
        except Exception as exc:  # noqa: BLE001
            check.status = "error"
            check.errors.append(str(exc))

        warnings.extend(f"{endpoint}: {message}" for message in check.warnings)
        errors.extend(f"{endpoint}: {message}" for message in check.errors)
        checks.append(check)

    ok = not errors
    return {
        "ok": ok,
        "base_url": base_url,
        "checks": [asdict(item) for item in checks],
        "warnings": warnings,
        "errors": errors,
    }


def _print_human(report: dict[str, Any]) -> None:
    for check in report["checks"]:
        endpoint = check["endpoint"]
        status = check["status"]
        if status == "ok":
            print(f"[OK] {endpoint}")
        elif status == "warn":
            joined = "; ".join(check["warnings"])
            print(f"[WARN] {endpoint} {joined}")
        else:
            joined = "; ".join(check["errors"])
            print(f"[ERROR] {endpoint} {joined}")

    if report["warnings"]:
        print(f"[WARN] total de warnings: {len(report['warnings'])}")
    if report["errors"]:
        print(f"[ERROR] total de erros: {len(report['errors'])}")
        print("[ERROR] smoke check falhou")
    else:
        print("[OK] smoke check concluído")


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke check/contrato dos principais endpoints do backend.")
    parser.add_argument("--base-url", required=True, help="Base URL do backend, por exemplo http://127.0.0.1:8000")
    parser.add_argument("--json", action="store_true", help="Imprime o relatório completo em JSON.")
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="Timeout por endpoint.")
    args = parser.parse_args()

    report = run_smoke_check(base_url=args.base_url, timeout_seconds=args.timeout_seconds)
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        _print_human(report)

    if not report["ok"]:
        sys.exit(1)


if __name__ == "__main__":
    main()

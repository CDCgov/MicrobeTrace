#!/usr/bin/env python3

import argparse
import csv
import json
from pathlib import Path


STORY_COLUMNS = [
    "story_sync",
    "story_title",
    "epic",
    "story_type",
    "user_story",
    "workflow_use_case",
    "expected_behavior",
    "acceptance_criteria",
    "tested_fixtures",
    "tested_specs",
    "test_coverage_notes",
    "source_confidence",
]

REQUIRED_TRACKER_COLUMNS = [
    "id",
    "area",
    "subarea",
    "priority",
    "status",
    "category",
    "scope",
    "file_types",
    "fixtures",
    "current_spec",
    "description",
    "primary_assertions",
    "fixture_gap",
    "notes",
    "last_reviewed",
]

REQUIRED_SYNC_COLUMNS = [
    "story_title",
    "epic",
    "story_type",
    "user_story",
    "workflow_use_case",
    "expected_behavior",
    "acceptance_criteria",
    "tested_fixtures",
    "tested_specs",
    "test_coverage_notes",
    "source_confidence",
]

ALLOWED_STORY_TYPES = {
    "User Workflow",
    "Visualization Behavior",
    "Data Processing",
    "Settings/Controls",
    "Export",
    "Session Persistence",
    "Test Coverage",
    "Documentation",
}

ALLOWED_SOURCE_CONFIDENCE = {"High", "Medium", "Low"}

GENERATED_START = "<!-- user-story-generated:start -->"
GENERATED_END = "<!-- user-story-generated:end -->"


def as_list(value: str):
    if not value:
        return []
    return [item.strip() for item in value.split(";") if item.strip()]


def render_bullets(items):
    if not items:
        return "- None recorded"
    return "\n".join(f"- {item}" for item in items)


def render_acceptance_criteria(value: str):
    items = as_list(value)
    if not items:
        return "- Not recorded"
    return "\n".join(f"- {item}" for item in items)


def is_truthy(value: str):
    return (value or "").strip().lower() in {"1", "true", "yes", "y"}


def source_key_for(csv_path: str):
    name = Path(csv_path).name
    suffix = "-cypress-qa-tracker.csv"
    if name.endswith(suffix):
        return name[: -len(suffix)]
    return Path(csv_path).stem


def tracker_url_for(repository: str, commit_sha: str, csv_path: str, line_number: int):
    if repository and commit_sha:
        return f"https://github.com/{repository}/blob/{commit_sha}/{csv_path}#L{line_number}"
    return f"{csv_path}#L{line_number}"


def validate_columns(path: Path, fieldnames):
    missing = [
        column
        for column in [*REQUIRED_TRACKER_COLUMNS, *STORY_COLUMNS]
        if column not in fieldnames
    ]
    if missing:
        raise ValueError(f"{path} is missing required columns: {', '.join(missing)}")


def validate_sync_row(row, path: Path, line_number: int):
    missing = [column for column in REQUIRED_SYNC_COLUMNS if not (row.get(column) or "").strip()]
    if missing:
        raise ValueError(
            f"{path}:{line_number} has story_sync=true but is missing required "
            f"user story fields: {', '.join(missing)}"
        )

    story_type = (row.get("story_type") or "").strip()
    if story_type not in ALLOWED_STORY_TYPES:
        allowed = ", ".join(sorted(ALLOWED_STORY_TYPES))
        raise ValueError(
            f"{path}:{line_number} has unsupported story_type {story_type!r}. "
            f"Allowed values: {allowed}"
        )

    confidence = (row.get("source_confidence") or "").strip()
    if confidence not in ALLOWED_SOURCE_CONFIDENCE:
        allowed = ", ".join(sorted(ALLOWED_SOURCE_CONFIDENCE))
        raise ValueError(
            f"{path}:{line_number} has unsupported source_confidence {confidence!r}. "
            f"Allowed values: {allowed}"
        )


def read_rows_from_path(path: Path, publish_all: bool):
    if not path.exists():
        return []

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        validate_columns(path, fieldnames)

        rows = []
        for line_number, row in enumerate(reader, start=2):
            extras = row.pop(None, None)
            if extras:
                raise ValueError(
                    f"{path}:{line_number} has unexpected extra columns: {extras}"
                )

            story_id = (row.get("id") or "").strip()
            if not story_id:
                continue

            row["_line_number"] = line_number
            row["_csv_path"] = path.as_posix()
            row["_source_key"] = source_key_for(path.as_posix())
            row["_tracker_key"] = f"{row['_source_key']}:{story_id}"

            if publish_all or is_truthy(row.get("story_sync") or ""):
                validate_sync_row(row, path, line_number)
                rows.append(row)

        return rows


def build_issue(row, repository: str, branch: str, commit_sha: str, actor: str):
    story_id = row["id"].strip()
    csv_path = row["_csv_path"]
    tracker_key = row["_tracker_key"]
    line_number = row["_line_number"]
    tracker_url = tracker_url_for(repository, commit_sha, csv_path, line_number)

    story_title = row["story_title"].strip()
    epic = row["epic"].strip()
    story_type = row["story_type"].strip()
    priority = (row.get("priority") or "").strip()
    coverage_status = (row.get("status") or "").strip()
    source_confidence = row["source_confidence"].strip()
    area = (row.get("area") or "").strip()
    subarea = (row.get("subarea") or "").strip()
    category = (row.get("category") or "").strip()
    scope = (row.get("scope") or "").strip()
    file_types = (row.get("file_types") or "").strip()
    description = (row.get("description") or "").strip()
    assertions = (row.get("primary_assertions") or "").strip()
    fixture_gap = (row.get("fixture_gap") or "").strip()
    notes = (row.get("notes") or "").strip()
    reviewed = (row.get("last_reviewed") or "").strip()

    generated_body = "\n".join(
        [
            GENERATED_START,
            f"<!-- user-story-key: {tracker_key} -->",
            f"<!-- user-story-id: {story_id} -->",
            "",
            f"Story Key: `{tracker_key}`",
            f"Tracker ID: `{story_id}`",
            "",
            "## User Story",
            row["user_story"].strip(),
            "",
            "## Workflow / Use Case",
            row["workflow_use_case"].strip(),
            "",
            "## Expected Behavior",
            row["expected_behavior"].strip(),
            "",
            "## Acceptance Criteria",
            render_acceptance_criteria(row["acceptance_criteria"]),
            "",
            "## Tested Against",
            "**Fixtures**",
            render_bullets(as_list(row["tested_fixtures"])),
            "",
            "**Cypress Specs**",
            render_bullets(as_list(row["tested_specs"])),
            "",
            "**Coverage Notes**",
            row["test_coverage_notes"].strip(),
            "",
            "## Source References",
            f"- Tracker row: [{csv_path}#L{line_number}]({tracker_url})",
            f"- Branch: `{branch}`",
            f"- Commit: `{commit_sha}`",
            f"- Generated by: `{actor}`",
            f"- Epic / Feature Group: `{epic}`",
            f"- Story Type: `{story_type}`",
            f"- Priority: `{priority or 'Unspecified'}`",
            f"- QA Coverage Status: `{coverage_status or 'Unspecified'}`",
            f"- Source Confidence: `{source_confidence}`",
            f"- Last reviewed: `{reviewed or 'Unspecified'}`",
            f"- Area: `{area or 'Unspecified'}`",
            f"- Subarea: `{subarea or 'Unspecified'}`",
            f"- Category: `{category or 'Unspecified'}`",
            f"- Scope: `{scope or 'Unspecified'}`",
            f"- File types: `{file_types or 'Unspecified'}`",
            "",
            "**Original QA Description**",
            description or "Not recorded",
            "",
            "**Original Primary Assertions**",
            assertions or "Not recorded",
            "",
            "**Fixture Gap**",
            fixture_gap or "None recorded",
            "",
            "**Tracker Notes**",
            notes or "None recorded",
            "",
            "## Definition of Done",
            "- Acceptance criteria are satisfied.",
            "- Relevant Cypress coverage remains passing or any coverage gap is documented.",
            "- Expected behavior remains distinguishable from bug or enhancement requests.",
            "- Tested fixtures and specs stay current when coverage changes.",
            GENERATED_END,
        ]
    )

    body = "\n".join(
        [
            generated_body,
            "",
            "## Manual Notes",
            "_Reviewer notes added below this line are preserved by future sync runs._",
        ]
    )

    return {
        "id": story_id,
        "csv_path": csv_path,
        "tracker_key": tracker_key,
        "title": story_title,
        "body": body,
        "generated_start": GENERATED_START,
        "generated_end": GENERATED_END,
        "labels": [
            "[issue-type] user story",
            "source-qa-tracker",
            "needs-review",
        ],
        "epic": epic,
        "story_type": story_type,
        "priority": priority,
        "source_confidence": source_confidence,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv-path", nargs="+", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--publish-all",
        action="store_true",
        help="Emit every QA tracker row, ignoring story_sync. Intended for full GitHub review batches.",
    )
    args = parser.parse_args()

    issues = []
    seen_tracker_keys = set()

    for csv_path in args.csv_path:
        rows = read_rows_from_path(Path(csv_path), publish_all=args.publish_all)
        for row in rows:
            tracker_key = row["_tracker_key"]
            if tracker_key in seen_tracker_keys:
                raise ValueError(f"Duplicate user story tracker key: {tracker_key}")
            seen_tracker_keys.add(tracker_key)
            issues.append(
                build_issue(
                    row,
                    repository=args.repository,
                    branch=args.branch,
                    commit_sha=args.commit_sha,
                    actor=args.actor,
                )
            )

    output_path = Path(args.output)
    output_path.write_text(
        json.dumps({"issues": issues, "issue_count": len(issues)}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

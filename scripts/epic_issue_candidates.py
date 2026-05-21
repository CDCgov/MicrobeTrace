#!/usr/bin/env python3

import argparse
import csv
import json
from pathlib import Path


EPIC_COLUMNS = [
    "epic_key",
    "epic_title",
    "epic_type",
    "epic_summary",
    "product_outcome",
    "in_scope",
    "acceptance_signals",
    "constraints",
    "epic_sync",
    "source_confidence",
    "priority",
    "status",
    "linked_story_keys",
    "notes",
    "last_reviewed",
]

REQUIRED_SYNC_COLUMNS = [
    "epic_key",
    "epic_title",
    "epic_type",
    "epic_summary",
    "product_outcome",
    "in_scope",
    "acceptance_signals",
    "linked_story_keys",
    "source_confidence",
]

STORY_INDEX_COLUMNS = [
    "story_key",
    "story_title",
    "linked_qa_tracker_ids",
    "tested_fixtures",
    "tested_specs",
]

ALLOWED_EPIC_TYPES = {
    "Analysis Surface",
    "Cross-Cutting Capability",
    "Workspace",
}

ALLOWED_SOURCE_CONFIDENCE = {"High", "Medium", "Low"}

GENERATED_START = "<!-- epic-generated:start -->"
GENERATED_END = "<!-- epic-generated:end -->"

DEFAULT_APP_CONSTRAINTS = [
    "Treat MicrobeTrace as a client-side application. Epic scope should focus on in-browser behavior plus the limited third-party integrations the app already uses.",
    "Desktop and laptop workflows are the target experience for this backlog. Mobile optimization is not part of epic acceptance unless a row says otherwise.",
    "Use current shipped behavior, grouped user stories, QA tracker evidence, and existing docs as the implementation baseline. Do not depend on UI or UX mockups.",
]


def as_list(value: str):
    if not value:
        return []
    return [item.strip() for item in value.split(";") if item.strip()]


def is_truthy(value: str):
    return (value or "").strip().lower() in {"1", "true", "yes", "y"}


def render_bullets(items):
    if not items:
        return "- None recorded"
    return "\n".join(f"- {item}" for item in items)


def render_inline_code_bullets(items):
    if not items:
        return "- None recorded"
    return "\n".join(f"- `{item}`" for item in items)


def render_story_bullets(story_keys, story_index):
    if not story_keys:
        return "- None recorded"

    lines = []
    for story_key in story_keys:
        story = story_index[story_key]
        lines.append(f"- `{story_key}` - {story['story_title']}")
    return "\n".join(lines)


def source_url_for(repository: str, commit_sha: str, csv_path: str, line_number: int):
    if repository and commit_sha:
        return f"https://github.com/{repository}/blob/{commit_sha}/{csv_path}#L{line_number}"
    return f"{csv_path}#L{line_number}"


def unique_in_order(items):
    seen = set()
    ordered = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def validate_columns(path: Path, fieldnames, expected_columns):
    missing = [column for column in expected_columns if column not in fieldnames]
    if missing:
        raise ValueError(f"{path} is missing required columns: {', '.join(missing)}")


def validate_sync_row(row, path: Path, line_number: int, story_index):
    missing = [column for column in REQUIRED_SYNC_COLUMNS if not (row.get(column) or "").strip()]
    if missing:
        raise ValueError(
            f"{path}:{line_number} has epic_sync=true or publish_all=true but is missing "
            f"required epic fields: {', '.join(missing)}"
        )

    epic_type = (row.get("epic_type") or "").strip()
    if epic_type not in ALLOWED_EPIC_TYPES:
        allowed = ", ".join(sorted(ALLOWED_EPIC_TYPES))
        raise ValueError(
            f"{path}:{line_number} has unsupported epic_type {epic_type!r}. "
            f"Allowed values: {allowed}"
        )

    confidence = (row.get("source_confidence") or "").strip()
    if confidence not in ALLOWED_SOURCE_CONFIDENCE:
        allowed = ", ".join(sorted(ALLOWED_SOURCE_CONFIDENCE))
        raise ValueError(
            f"{path}:{line_number} has unsupported source_confidence {confidence!r}. "
            f"Allowed values: {allowed}"
        )

    linked_story_keys = as_list(row.get("linked_story_keys") or "")
    if not linked_story_keys:
        raise ValueError(f"{path}:{line_number} must include at least one linked_story_keys value.")

    missing_story_keys = [story_key for story_key in linked_story_keys if story_key not in story_index]
    if missing_story_keys:
        raise ValueError(
            f"{path}:{line_number} references unknown linked_story_keys: "
            f"{', '.join(missing_story_keys)}"
        )


def load_story_index(path: Path):
    if not path.exists():
        raise ValueError(f"{path} does not exist.")

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        validate_columns(path, fieldnames, STORY_INDEX_COLUMNS)

        story_index = {}
        for line_number, row in enumerate(reader, start=2):
            extras = row.pop(None, None)
            if extras:
                raise ValueError(
                    f"{path}:{line_number} has unexpected extra columns: {extras}"
                )

            story_key = (row.get("story_key") or "").strip()
            if not story_key:
                continue

            if story_key in story_index:
                raise ValueError(f"Duplicate story_key {story_key!r} in {path}:{line_number}")

            story_index[story_key] = {
                "story_title": (row.get("story_title") or "").strip(),
                "linked_qa_tracker_ids": as_list(row.get("linked_qa_tracker_ids") or ""),
                "tested_fixtures": as_list(row.get("tested_fixtures") or ""),
                "tested_specs": as_list(row.get("tested_specs") or ""),
            }

    return story_index


def read_epic_rows(path: Path, publish_all: bool, story_index):
    if not path.exists():
        return []

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        validate_columns(path, fieldnames, EPIC_COLUMNS)

        rows = []
        for line_number, row in enumerate(reader, start=2):
            extras = row.pop(None, None)
            if extras:
                raise ValueError(
                    f"{path}:{line_number} has unexpected extra columns: {extras}"
                )

            epic_key = (row.get("epic_key") or "").strip()
            if not epic_key:
                continue

            row["_line_number"] = line_number
            row["_csv_path"] = path.as_posix()
            row["_epic_key"] = epic_key

            if publish_all or is_truthy(row.get("epic_sync") or ""):
                validate_sync_row(row, path, line_number, story_index)
                rows.append(row)

        return rows


def build_issue(row, story_index, story_csv_path: Path, repository: str, branch: str, commit_sha: str, actor: str):
    csv_path = row["_csv_path"]
    epic_key = row["_epic_key"]
    line_number = row["_line_number"]
    source_url = source_url_for(repository, commit_sha, csv_path, line_number)

    linked_story_keys = as_list(row["linked_story_keys"])
    linked_stories = [story_index[story_key] for story_key in linked_story_keys]

    linked_qa_tracker_ids = unique_in_order(
        qa_id
        for story in linked_stories
        for qa_id in story["linked_qa_tracker_ids"]
    )
    tested_fixtures = unique_in_order(
        fixture
        for story in linked_stories
        for fixture in story["tested_fixtures"]
    )
    tested_specs = unique_in_order(
        spec
        for story in linked_stories
        for spec in story["tested_specs"]
    )

    epic_title = row["epic_title"].strip()
    epic_type = row["epic_type"].strip()
    priority = (row.get("priority") or "").strip()
    status = (row.get("status") or "").strip()
    source_confidence = row["source_confidence"].strip()
    notes = (row.get("notes") or "").strip()
    reviewed = (row.get("last_reviewed") or "").strip()
    constraints = DEFAULT_APP_CONSTRAINTS + as_list(row.get("constraints") or "")

    generated_body = "\n".join(
        [
            GENERATED_START,
            f"<!-- epic-key: {epic_key} -->",
            "",
            f"Epic Key: `{epic_key}`",
            "",
            "## Epic Summary",
            row["epic_summary"].strip(),
            "",
            "## Product Outcome",
            row["product_outcome"].strip(),
            "",
            "## In Scope",
            render_bullets(as_list(row["in_scope"])),
            "",
            "## Acceptance Signals",
            render_bullets(as_list(row["acceptance_signals"])),
            "",
            "## Linked User Stories",
            render_story_bullets(linked_story_keys, story_index),
            "",
            "## QA Tracker Evidence",
            render_inline_code_bullets(linked_qa_tracker_ids),
            "",
            "## Tested Against",
            "**Fixtures**",
            render_bullets(tested_fixtures),
            "",
            "**Cypress Specs**",
            render_bullets(tested_specs),
            "",
            "## App Constraints",
            render_bullets(constraints),
            "",
            "## Source References",
            f"- Epic row: [{csv_path}#L{line_number}]({source_url})",
            f"- User story source: `{story_csv_path.as_posix()}`",
            f"- Branch: `{branch}`",
            f"- Commit: `{commit_sha}`",
            f"- Generated by: `{actor}`",
            f"- Epic Type: `{epic_type}`",
            f"- Priority: `{priority or 'Unspecified'}`",
            f"- Epic Review Status: `{status or 'Unspecified'}`",
            f"- Source Confidence: `{source_confidence}`",
            f"- Linked User Stories: `{len(linked_story_keys)}`",
            f"- Linked QA Tracker Rows: `{len(linked_qa_tracker_ids)}`",
            f"- Last reviewed: `{reviewed or 'Unspecified'}`",
            "",
            "## Epic Notes",
            notes or "None recorded",
            "",
            "## Definition of Done",
            "- Linked user stories remain aligned with this epic scope.",
            "- Epic acceptance signals are satisfied across the referenced desktop and client-side workflows.",
            "- Derived QA tracker evidence, fixtures, and Cypress specs remain current as linked stories change.",
            "- Behavior remains distinguishable from separate enhancement requests or future backend or mobile work.",
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
        "id": epic_key,
        "csv_path": csv_path,
        "epic_key": epic_key,
        "title": epic_title,
        "body": body,
        "generated_start": GENERATED_START,
        "generated_end": GENERATED_END,
        "labels": [
            "[issue-type] epic",
            "source-epics",
            "needs-review",
        ],
        "epic_type": epic_type,
        "priority": priority,
        "source_confidence": source_confidence,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epic-csv-path", required=True)
    parser.add_argument("--story-csv-path", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--publish-all",
        action="store_true",
        help="Emit every epic CSV row, ignoring epic_sync.",
    )
    args = parser.parse_args()

    story_csv_path = Path(args.story_csv_path)
    story_index = load_story_index(story_csv_path)
    epic_rows = read_epic_rows(
        Path(args.epic_csv_path),
        publish_all=args.publish_all,
        story_index=story_index,
    )

    issues = []
    seen_epic_keys = set()

    for row in epic_rows:
        epic_key = row["_epic_key"]
        if epic_key in seen_epic_keys:
            raise ValueError(f"Duplicate epic key: {epic_key}")
        seen_epic_keys.add(epic_key)
        issues.append(
            build_issue(
                row,
                story_index=story_index,
                story_csv_path=story_csv_path,
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

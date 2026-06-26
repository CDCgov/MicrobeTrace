#!/usr/bin/env python3

import argparse
import csv
import json
from pathlib import Path


CATEGORY_ALIASES = {
    "syntax": "syntax",
    "file type": "file type",
    "file-type": "file type",
    "feature": "feature",
    "feature-behavior": "feature",
    "framework-based": "framework-based",
    "framework based": "framework-based",
    "lib-related": "Lib-related",
    "lib related": "Lib-related",
    "crash": "feature",
    "test-harness": "framework-based",
    "test harness": "framework-based",
}


def as_list(value: str):
    if not value:
        return []
    return [item.strip() for item in value.split(";") if item.strip()]


def render_bullets(items):
    if not items:
        return "- None recorded"
    return "\n".join(f"- {item}" for item in items)


def is_closed_status(value: str):
    return (value or "").strip().lower() in {"closed", "fixed", "resolved"}


def canonicalize_category(value: str, csv_path: str, line_number: int):
    cleaned = " ".join((value or "").strip().split())
    if not cleaned:
        raise ValueError(f"{csv_path}:{line_number} is missing a category value")

    canonical = CATEGORY_ALIASES.get(cleaned.lower())
    if canonical:
        return canonical

    allowed = ", ".join(sorted(set(CATEGORY_ALIASES.values())))
    raise ValueError(
        f"{csv_path}:{line_number} has unsupported category {cleaned!r}. "
        f"Allowed values: {allowed}"
    )


def source_key_for(csv_path: str):
    name = Path(csv_path).name
    suffix = "-cypress-bug-log.csv"
    if name.endswith(suffix):
        return name[: -len(suffix)]
    return Path(csv_path).stem


def read_rows_from_path(path: Path):
    if not path.exists():
        return []

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        if "id" not in fieldnames:
            raise ValueError(f"{path} is missing the required 'id' column")
        if "category" not in fieldnames:
            raise ValueError(f"{path} is missing the required 'category' column")

        rows = []
        for line_number, row in enumerate(reader, start=2):
            extras = row.pop(None, None)
            if extras:
                raise ValueError(
                    f"{path}:{line_number} has unexpected extra columns: {extras}"
                )

            bug_id = (row.get("id") or "").strip()
            if not bug_id:
                continue

            row["_line_number"] = line_number
            row["_csv_path"] = path.as_posix()
            row["_source_key"] = source_key_for(path.as_posix())
            row["_tracker_key"] = f"{row['_source_key']}:{bug_id}"
            row["category"] = canonicalize_category(
                row.get("category") or "",
                path.as_posix(),
                line_number,
            )
            rows.append(row)

        return rows


def issue_title_for(row):
    bug_id = row["id"].strip()
    tracker_key = row["_tracker_key"]
    explicit_title = (row.get("title") or "").strip()
    area = (row.get("area") or "").strip()
    scope = (row.get("view_scope") or "").strip()
    observed = (row.get("observed_behavior") or "").strip()

    title_bits = [f"[Bug Tracker] {tracker_key}"]
    if explicit_title:
        title_bits.append(explicit_title)
    elif area:
        title_bits.append(area)
    elif scope:
        title_bits.append(scope)
    elif observed:
        title_bits.append(observed.split(".")[0][:72].rstrip())
    else:
        title_bits.append(bug_id)

    return " ".join(title_bits)


def build_issue(row, repository: str, branch: str, commit_sha: str, actor: str):
    bug_id = row["id"].strip()
    csv_path = row["_csv_path"]
    tracker_key = row["_tracker_key"]
    line_number = row["_line_number"]

    title = issue_title_for(row)
    area = (row.get("area") or "").strip()
    scope = (row.get("view_scope") or "").strip()
    priority = (row.get("priority") or "").strip()
    status = (row.get("status") or "").strip()
    category = row["category"]
    observed = (row.get("observed_behavior") or "").strip()
    intended = (row.get("intended_behavior") or "").strip()
    current_spec = as_list(row.get("current_spec") or "")
    regression_specs = as_list(row.get("regression_specs") or "")
    fixtures = as_list(row.get("fixtures") or "")
    notes = (row.get("notes") or "").strip()
    cause_summary = (row.get("cause_summary") or "").strip()
    fix_summary = (row.get("fix_summary") or "").strip()
    reviewed = (row.get("last_reviewed") or "").strip()

    tracker_url = (
        f"https://github.com/{repository}/blob/{commit_sha}/{csv_path}#L{line_number}"
        if repository and commit_sha
        else f"{csv_path}#L{line_number}"
    )

    body_lines = [
        f"<!-- bug-tracker-key: {tracker_key} -->",
        f"<!-- bug-tracker-id: {bug_id} -->",
        "",
        f"Bug Tracker Key: `{tracker_key}`",
        f"Bug Tracker ID: `{bug_id}`",
        "",
        "**Source**",
        f"- Tracker row: [{csv_path}#L{line_number}]({tracker_url})",
        f"- Branch: `{branch}`",
        f"- Commit: `{commit_sha}`",
        f"- Recorded by: `{actor}`",
        f"- Priority: `{priority or 'Unspecified'}`",
        f"- Status: `{status or 'Unspecified'}`",
        f"- Category: `{category}`",
        f"- Last reviewed: `{reviewed or 'Unspecified'}`",
    ]

    if scope:
        body_lines.append(f"- View scope: `{scope}`")
    if area:
        body_lines.append(f"- Area: `{area}`")

    body_lines.extend(
        [
            "",
            "**Fixtures**",
            render_bullets(fixtures),
            "",
            "**Current spec**",
            render_bullets(current_spec),
            "",
            "**Regression specs**",
            render_bullets(regression_specs),
            "",
            "**Observed behavior**",
            observed or "Not recorded",
            "",
            "**Intended behavior**",
            intended or "Not recorded",
            "",
            "**Root cause**",
            cause_summary or "Not recorded",
            "",
            "**Fix summary**",
            fix_summary or "Not recorded",
            "",
            "**Notes**",
            notes or "None recorded",
        ]
    )

    comment = f"""Bug tracker row updated to `{status or "Closed"}`.

**Root cause**
{cause_summary or "Not recorded"}

**Fix summary**
{fix_summary or "Not recorded"}

- Tracker row: [{csv_path}#L{line_number}]({tracker_url})
- Branch: `{branch}`
- Commit: `{commit_sha}`
- Updated by: `{actor}`
- Last reviewed: `{reviewed or "Unspecified"}`
"""

    return {
        "id": bug_id,
        "csv_path": csv_path,
        "tracker_key": tracker_key,
        "title": title,
        "body": "\n".join(body_lines),
        "comment": comment,
        "closed": is_closed_status(status),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv-path", nargs="+", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    issues = []
    for csv_path in args.csv_path:
        rows = read_rows_from_path(Path(csv_path))
        for row in rows:
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
        json.dumps({"issues": issues}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

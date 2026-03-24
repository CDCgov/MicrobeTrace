#!/usr/bin/env python3

import argparse
import csv
import json
import subprocess
from pathlib import Path


def read_rows_from_path(path: Path):
    if not path.exists():
        return {}

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = {}
        for line_number, row in enumerate(reader, start=2):
            bug_id = (row.get("id") or "").strip()
            if not bug_id:
                continue
            row["_line_number"] = line_number
            rows[bug_id] = row
        return rows


def read_rows_from_git(revision: str, relative_path: str):
    if not revision or revision == "0" * 40:
        fallback = subprocess.run(
            ["git", "rev-parse", "HEAD^"],
            check=False,
            capture_output=True,
            text=True,
        )
        if fallback.returncode != 0:
            return {}
        revision = fallback.stdout.strip()

    result = subprocess.run(
        ["git", "show", f"{revision}:{relative_path}"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return {}

    reader = csv.DictReader(result.stdout.splitlines())
    rows = {}
    for line_number, row in enumerate(reader, start=2):
        bug_id = (row.get("id") or "").strip()
        if not bug_id:
            continue
        row["_line_number"] = line_number
        rows[bug_id] = row
    return rows


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


def build_issue(row, csv_path: str, repository: str, branch: str, commit_sha: str, actor: str):
    bug_id = row["id"].strip()
    area = (row.get("area") or "").strip()
    priority = (row.get("priority") or "").strip()
    status = (row.get("status") or "").strip()
    observed = (row.get("observed_behavior") or "").strip()
    intended = (row.get("intended_behavior") or "").strip()
    current_spec = as_list(row.get("current_spec") or "")
    regression_specs = as_list(row.get("regression_specs") or "")
    fixtures = as_list(row.get("fixtures") or "")
    notes = (row.get("notes") or "").strip()
    cause_summary = (row.get("cause_summary") or "").strip()
    fix_summary = (row.get("fix_summary") or "").strip()
    reviewed = (row.get("last_reviewed") or "").strip()
    line_number = row["_line_number"]

    title_bits = [f"[Bug Tracker] {bug_id}"]
    if area:
        title_bits.append(area)
    if observed:
        title_bits.append(observed.split(".")[0][:72].rstrip())
    title = " ".join(title_bits)

    tracker_url = (
        f"https://github.com/{repository}/blob/{commit_sha}/{csv_path}#L{line_number}"
        if repository and commit_sha
        else csv_path
    )

    body = f"""<!-- bug-tracker-id: {bug_id} -->
Bug Tracker ID: `{bug_id}`

**Source**
- Tracker row: [{csv_path}#L{line_number}]({tracker_url})
- Branch: `{branch}`
- Commit: `{commit_sha}`
- Recorded by: `{actor}`
- Area: `{area or "Unspecified"}`
- Priority: `{priority or "Unspecified"}`
- Status: `{status or "Unspecified"}`
- Last reviewed: `{reviewed or "Unspecified"}`

**Fixtures**
{render_bullets(fixtures)}

**Current spec**
{render_bullets(current_spec)}

**Regression specs**
{render_bullets(regression_specs)}

**Observed behavior**
{observed or "Not recorded"}

**Intended behavior**
{intended or "Not recorded"}

**Root cause**
{cause_summary or "Not recorded"}

**Fix summary**
{fix_summary or "Not recorded"}

**Notes**
{notes or "None recorded"}
"""

    return {
        "id": bug_id,
        "title": title,
        "body": body,
    }


def build_close_payload(row, csv_path: str, repository: str, branch: str, commit_sha: str, actor: str):
    bug_id = row["id"].strip()
    line_number = row["_line_number"]
    status = (row.get("status") or "").strip()
    cause_summary = (row.get("cause_summary") or "").strip()
    fix_summary = (row.get("fix_summary") or "").strip()
    reviewed = (row.get("last_reviewed") or "").strip()

    tracker_url = (
        f"https://github.com/{repository}/blob/{commit_sha}/{csv_path}#L{line_number}"
        if repository and commit_sha
        else csv_path
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
        "comment": comment,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv-path", required=True)
    parser.add_argument("--before")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    csv_path = Path(args.csv_path)
    current_rows = read_rows_from_path(csv_path)
    previous_rows = read_rows_from_git(args.before, args.csv_path)

    new_bug_ids = [bug_id for bug_id in current_rows if bug_id not in previous_rows]
    create_issues = [
        build_issue(
            current_rows[bug_id],
            args.csv_path,
            args.repository,
            args.branch,
            args.commit_sha,
            args.actor,
        )
        for bug_id in new_bug_ids
        if not is_closed_status(current_rows[bug_id].get("status") or "")
    ]

    close_issues = [
        build_close_payload(
            current_rows[bug_id],
            args.csv_path,
            args.repository,
            args.branch,
            args.commit_sha,
            args.actor,
        )
        for bug_id, row in current_rows.items()
        if is_closed_status(row.get("status") or "")
        and bug_id in previous_rows
        and not is_closed_status(previous_rows[bug_id].get("status") or "")
    ]

    output_path = Path(args.output)
    output_path.write_text(
        json.dumps({"create": create_issues, "close": close_issues}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

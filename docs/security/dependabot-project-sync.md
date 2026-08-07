# Dependabot security project sync

The `Dependabot Security Project Sync` workflow adds Dependabot security-update pull requests targeting `dev` to the MicrobeTrace GitHub Project and sets their project status. It tracks the remediation pull request rather than the private Dependabot alert record, because GitHub Projects accepts issues, pull requests, and draft issues as items.

## Defaults

- Project owner: `CDCgov`
- Project number: `79`
- Status field: `Status`
- Status value: `Security Prompts`

These defaults can be overridden with repository variables named `DEPENDABOT_PROJECT_OWNER`, `DEPENDABOT_PROJECT_OWNER_TYPE`, `DEPENDABOT_PROJECT_NUMBER`, `DEPENDABOT_PROJECT_STATUS_FIELD`, and `DEPENDABOT_PROJECT_STATUS`.

## Token setup

Create a token that can read the repository and organization and write to organization projects. For a classic personal access token, the required scopes are `repo`, `read:org`, and `project`. If CDCgov uses SAML SSO for the account, authorize the token for CDCgov.

Store the same value as a repository secret named `DEPENDABOT_PROJECT_TOKEN` in both locations:

1. **Settings > Secrets and variables > Actions** for manual backfill runs.
2. **Settings > Secrets and variables > Dependabot** for runs initiated by Dependabot pull requests.

Manual runs can fall back to the existing `USER_STORY_PROJECT_TOKEN`, but Dependabot-triggered runs should have `DEPENDABOT_PROJECT_TOKEN` in the Dependabot secret store.

## Backfill

After the workflow is present on the default branch:

1. Open **Actions > Dependabot Security Project Sync > Run workflow**.
2. Leave `dry_run` enabled and run against all open PRs, or enter one PR number.
3. Review the matching PRs in the run log.
4. Run again with `dry_run` disabled to add missing items.
5. Enable `update_existing_status` only when existing matching items should be moved to `Security Prompts`.

The workflow is idempotent: it reuses an existing project item instead of adding a duplicate.

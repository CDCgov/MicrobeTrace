# Local Tomcat harness (scripts/tomcat)

This folder contains a local WAR smoke-test harness for the MicrobeTrace repo.
Use it to validate generated WAR files before handing them to DevOps.

## Components

`setup-local-tomcat.sh`
- downloads/unpacks Tomcat (default `10.1.33`) into `tomcat-server`
- ensures `logs`, `temp`, `work`, `webapps` directories exist

`deploy-war-local.sh [WAR_PATH] [CONTEXT]`
- deploys WAR into local Tomcat `webapps`
- defaults:
  - `WAR_PATH`: newest `dist/MicrobeTrace_*.war`
  - `CONTEXT`: `ROOT`

`start-local-tomcat.sh`
- starts Tomcat in background and writes PID to `tomcat-local.pid`

`stop-local-tomcat.sh`
- stops Tomcat by PID and removes stale PID state

`run-war-smoke.sh`
- full smoke flow: optional build, deploy, start, startup log wait, HTTP check
- command: `bash scripts/tomcat/run-war-smoke.sh [--skip-build] [--war path] [--context ROOT]`
- defaults to port `8080` for the smoke URL

`run-war-smoke.cmd`
- Windows launcher that forwards to `run-war-smoke.ps1`
- command: `scripts/tomcat/run-war-smoke.cmd [--skip-build] [--war path] [--context ROOT]`

`run-war-smoke.ps1`
- Windows-native implementation used by `.cmd`
- uses `scripts\build-war.cmd` unless `-SkipBuild` is set

## Typical local flow

`bash scripts/tomcat/run-war-smoke.sh --skip-build --war dist/MicrobeTrace_2.2.0.war --context ROOT`

`scripts/tomcat/run-war-smoke.cmd --skip-build --war dist\\MicrobeTrace_2.2.0.war --context ROOT`

## Package.json shortcuts

`npm run tomcat:smoke`
- runs `scripts/tomcat/run-war-smoke.sh`

`npm run tomcat:smoke:win`
- runs `scripts\tomcat\run-war-smoke.cmd`

## Useful environment overrides

`TOMCAT_VERSION`
- Tomcat version to use in harness scripts

`TOMCAT_SERVER_DIR`
- base folder containing the Tomcat distribution (defaults to repo `tomcat-server`)

`TOMCAT_HTTP_PORT`
- smoke URL port (defaults to `8080`)

## Manual deploy validation (recommended for DevOps handoff)

If Tomcat logs show `java.util.zip.ZipException: error in opening zip file`, validate the file first:

`jar tf <WAR_PATH>`

If this fails, the artifact is not a valid WAR.

Compare checksum before/after transfer:

Windows transfer check:
- `CertUtil -hashfile <WAR_PATH> SHA256`

Linux/mac transfer check:
- `sha256sum <WAR_PATH>`

On successful local validation:
- file has non-zero size
- `jar tf <WAR_PATH>` succeeds
- deploy logs show `Server startup in` and no `SEVERE` around `deployWAR`

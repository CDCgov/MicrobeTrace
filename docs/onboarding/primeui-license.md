# PrimeUI license configuration

MicrobeTrace uses PrimeNG 22 under a PrimeUI Commercial license. The license
key is supplied to Angular builds without committing it to the repository.

## Local development

Copy `.env.local.example` to `.env.local` at the repository root and replace
the placeholder with the license key from the PrimeUI Store:

```text
PRIMEUI_LICENSE_KEY=your-license-key
```

The `.env.local` file and the generated TypeScript configuration are ignored
by Git. `npm start`, `npm run build`, `npm test`, and `npm run lint` prepare the
generated configuration automatically.

As an alternative to `.env.local`, define `PRIMEUI_LICENSE_KEY` in the shell
environment before invoking an npm command. An existing shell variable takes
precedence over `.env.local`.

## WAR and CI builds

The environment that invokes `scripts/build-war.sh` or
`scripts\\build-war.cmd` must provide `PRIMEUI_LICENSE_KEY`. The WAR scripts
fail before the Angular build when the key is missing.

The key is needed by the build job only. A server that receives and runs an
already-built WAR does not require a PrimeUI environment variable or another
developer seat.

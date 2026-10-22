# Pinned Auspice v2 schemas

These test-only JSON schemas are copied without modification from `nextstrain/augur` commit `0d287496eed3816f94d674f5a08201273f479487`:

- `augur/data/schema-export-v2.json`
- `augur/data/schema-auspice-config-v2.json`
- `augur/data/schema-annotations.json`
- `augur/data/schema-export-root-sequence.json`

`auspiceExporter.spec.ts` registers the referenced schemas with Ajv and validates a rich dataset produced by the MicrobeTrace builder. Updating the snapshot must be a deliberate compatibility change and should be followed by the official `augur validate export-v2` release gate.

The upstream project is licensed under the GNU Affero General Public License v3.0; see the [Nextstrain Augur repository](https://github.com/nextstrain/augur).

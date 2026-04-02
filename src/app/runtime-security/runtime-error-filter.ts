import { describeError } from './runtime-error.store';

const EXTENSION_PROTOCOL_PATTERN = /\b(?:chrome|moz|safari-web)-extension:\/\//i;
const EXTENSION_SCRIPT_PATTERN = /\b(?:content|contentscript|inpage)\.js\b/i;
const EXTENSION_MESSAGE_PATTERNS = [
  /Could not establish connection\.\s*Receiving end does not exist\./i,
  /Failed to connect to MetaMask/i,
  /MetaMask extension not found/i,
  /FILE_ERROR_NO_SPACE/i,
];

export function shouldIgnoreRuntimeError(
  error: unknown,
  context: {
    filename?: string | null;
    source?: string | null;
  } = {},
): boolean {
  const signals = collectSignals(error, context);
  if (!signals.length) {
    return false;
  }

  return signals.some((signal) => {
    return (
      EXTENSION_PROTOCOL_PATTERN.test(signal) ||
      EXTENSION_SCRIPT_PATTERN.test(signal) ||
      EXTENSION_MESSAGE_PATTERNS.some((pattern) => pattern.test(signal))
    );
  });
}

function collectSignals(
  error: unknown,
  context: {
    filename?: string | null;
    source?: string | null;
  },
): string[] {
  const values = new Set<string>();

  const add = (value: unknown): void => {
    if (typeof value === 'string' && value.trim()) {
      values.add(value.trim());
    }
  };

  add(context.filename);
  add(context.source);
  add(describeError(error));

  if (error instanceof Error) {
    add(error.name);
    add(error.message);
    add(error.stack);
  } else if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    add(record.message);
    add(record.stack);
    add(record.name);
    add(record.code);

    try {
      add(JSON.stringify(record));
    } catch {
      // Ignore non-serializable error payloads.
    }
  }

  return Array.from(values);
}

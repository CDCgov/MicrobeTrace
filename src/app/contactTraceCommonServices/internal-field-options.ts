const INTERNAL_OPTION_PREFIX = '__microbetrace_option__:';
const ESCAPED_FIELD_PREFIX = '__microbetrace_field__:';

export const INTERNAL_FIELD_OPTION_VALUES = Object.freeze({
  none: `${INTERNAL_OPTION_PREFIX}none`,
  timelineNodeColor: `${INTERNAL_OPTION_PREFIX}timeline-node-color`,
  linkSourceId: `${INTERNAL_OPTION_PREFIX}link-source-id`,
  linkSourceIndex: `${INTERNAL_OPTION_PREFIX}link-source-index`,
  linkTargetId: `${INTERNAL_OPTION_PREFIX}link-target-id`,
  linkTargetIndex: `${INTERNAL_OPTION_PREFIX}link-target-index`
});

export const INTERNAL_FIELD_OPTION_LABELS = new Map<string, string>([
  [INTERNAL_FIELD_OPTION_VALUES.none, 'None'],
  [INTERNAL_FIELD_OPTION_VALUES.timelineNodeColor, 'Node Color'],
  [INTERNAL_FIELD_OPTION_VALUES.linkSourceId, 'Source ID'],
  [INTERNAL_FIELD_OPTION_VALUES.linkSourceIndex, 'Source Index'],
  [INTERNAL_FIELD_OPTION_VALUES.linkTargetId, 'Target ID'],
  [INTERNAL_FIELD_OPTION_VALUES.linkTargetIndex, 'Target Index']
]);

export type LegacyInternalFieldOptions = Readonly<Record<string, string>>;

export function isInternalFieldOptionValue(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(INTERNAL_OPTION_PREFIX);
}

export function createFieldOptionValue(
  fieldName: unknown,
  legacyInternalValues: readonly string[] = []
): string {
  const field = String(fieldName ?? '');
  const needsEscaping = field.startsWith(INTERNAL_OPTION_PREFIX) ||
    field.startsWith(ESCAPED_FIELD_PREFIX) ||
    Object.prototype.hasOwnProperty.call(Object.prototype, field) ||
    legacyInternalValues.includes(field);

  return needsEscaping
    ? `${ESCAPED_FIELD_PREFIX}${encodeURIComponent(field)}`
    : field;
}

export function getFieldNameFromOptionValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '' || isInternalFieldOptionValue(value)) {
    return null;
  }

  const optionValue = String(value);
  if (!optionValue.startsWith(ESCAPED_FIELD_PREFIX)) {
    return optionValue;
  }

  try {
    return decodeURIComponent(optionValue.slice(ESCAPED_FIELD_PREFIX.length));
  } catch {
    return optionValue.slice(ESCAPED_FIELD_PREFIX.length);
  }
}

export function normalizeFieldOptionValue(
  value: unknown,
  legacyInternalOptions: LegacyInternalFieldOptions
): string {
  if (value === undefined || value === null || value === '') {
    return INTERNAL_FIELD_OPTION_VALUES.none;
  }

  const optionValue = String(value);
  if (isInternalFieldOptionValue(optionValue) || optionValue.startsWith(ESCAPED_FIELD_PREFIX)) {
    return optionValue;
  }

  const internalValue = Object.prototype.hasOwnProperty.call(legacyInternalOptions, optionValue)
    ? legacyInternalOptions[optionValue]
    : undefined;
  return internalValue || createFieldOptionValue(optionValue, Object.keys(legacyInternalOptions));
}

export function getInternalFieldOptionLabel(value: unknown): string | undefined {
  return INTERNAL_FIELD_OPTION_LABELS.get(String(value ?? ''));
}

export function getFieldOptionValue(record: any, optionValue: unknown): any {
  if (optionValue === 'None') return undefined;
  const field = getFieldNameFromOptionValue(optionValue);
  return field !== null && record != null && Object.prototype.hasOwnProperty.call(record, field)
    ? record[field]
    : undefined;
}

/** Keep legacy no-field settings compatible while escaping real sentinel names. */
export function createFieldSelectOptions(fields: readonly string[], noneValue: string = 'None') {
  return [
    { label: fields.includes('None') ? 'None (No field)' : 'None', value: noneValue },
    ...fields.map(field => ({ label: field, value: createFieldOptionValue(field, ['None']) }))
  ];
}

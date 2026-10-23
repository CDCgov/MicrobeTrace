import {
  createFieldOptionValue,
  createFieldSelectOptions,
  getFieldOptionValue,
  getFieldNameFromOptionValue,
  getInternalFieldOptionLabel,
  INTERNAL_FIELD_OPTION_VALUES,
  isInternalFieldOptionValue,
  normalizeFieldOptionValue
} from './internal-field-options';

describe('internal field option values', () => {
  ['constructor', '__proto__', 'toString', 'hasOwnProperty'].forEach(field => {
    it(`retains ${field} as a real field rather than an inherited legacy option`, () => {
      const normalized = normalizeFieldOptionValue(field, { None: INTERNAL_FIELD_OPTION_VALUES.none });
      expect(typeof normalized).toBe('string');
      expect(normalized).toBe(createFieldOptionValue(field));
      expect(getFieldNameFromOptionValue(normalized)).toBe(field);
      expect(getFieldOptionValue({}, normalized)).toBeUndefined();
    });
  });

  it('distinguishes a real None field from legacy and namespaced no-field choices', () => {
    const fields = ['None', 'status', INTERNAL_FIELD_OPTION_VALUES.none];
    const options = createFieldSelectOptions(fields);
    expect(new Set(options.map(option => option.value)).size).toBe(options.length);
    expect(options[0]).toEqual({ label: 'None (No field)', value: 'None' });
    expect(getFieldOptionValue({ None: 'category-a' }, options[1].value)).toBe('category-a');
    expect(getFieldOptionValue({ None: 'category-a' }, options[0].value)).toBeUndefined();
    expect(createFieldSelectOptions(['None'], INTERNAL_FIELD_OPTION_VALUES.none)[0].value)
      .toBe(INTERNAL_FIELD_OPTION_VALUES.none);
  });

  it('escapes inherited keys before they are used in style dictionaries', () => {
    const options = createFieldSelectOptions(['constructor', '__proto__', 'toString']);
    options.slice(1).forEach(option => {
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, option.value)).toBeFalse();
      expect(getFieldNameFromOptionValue(option.value)).toBe(option.label);
    });
  });

  it('keeps synthetic choices separate from ordinary field keys', () => {
    expect(INTERNAL_FIELD_OPTION_VALUES.none).not.toBe('None');
    expect(INTERNAL_FIELD_OPTION_VALUES.timelineNodeColor).not.toBe('Node Color');
    expect(INTERNAL_FIELD_OPTION_VALUES.linkSourceId).not.toBe('source_id');
    expect(INTERNAL_FIELD_OPTION_VALUES.linkTargetId).not.toBe('target_id');
    expect(isInternalFieldOptionValue(INTERNAL_FIELD_OPTION_VALUES.none)).toBeTrue();
  });

  it('escapes fields that would otherwise collide with legacy or internal values', () => {
    const noneField = createFieldOptionValue('None', ['None']);
    const sourceIdField = createFieldOptionValue('source_id', ['source_id']);
    const internalLookingField = createFieldOptionValue(INTERNAL_FIELD_OPTION_VALUES.none);

    expect(noneField).not.toBe(INTERNAL_FIELD_OPTION_VALUES.none);
    expect(sourceIdField).not.toBe(INTERNAL_FIELD_OPTION_VALUES.linkSourceId);
    expect(internalLookingField).not.toBe(INTERNAL_FIELD_OPTION_VALUES.none);
    expect(getFieldNameFromOptionValue(noneField)).toBe('None');
    expect(getFieldNameFromOptionValue(sourceIdField)).toBe('source_id');
    expect(getFieldNameFromOptionValue(internalLookingField)).toBe(INTERNAL_FIELD_OPTION_VALUES.none);
  });

  it('migrates legacy synthetic values while retaining encoded real fields', () => {
    const legacyOptions = {
      None: INTERNAL_FIELD_OPTION_VALUES.none,
      'Node Color': INTERNAL_FIELD_OPTION_VALUES.timelineNodeColor
    };
    const actualNodeColorField = createFieldOptionValue('Node Color', Object.keys(legacyOptions));

    expect(normalizeFieldOptionValue('None', legacyOptions)).toBe(INTERNAL_FIELD_OPTION_VALUES.none);
    expect(normalizeFieldOptionValue('Node Color', legacyOptions)).toBe(INTERNAL_FIELD_OPTION_VALUES.timelineNodeColor);
    expect(normalizeFieldOptionValue(actualNodeColorField, legacyOptions)).toBe(actualNodeColorField);
    expect(getFieldNameFromOptionValue(actualNodeColorField)).toBe('Node Color');
    expect(getFieldNameFromOptionValue(INTERNAL_FIELD_OPTION_VALUES.timelineNodeColor)).toBeNull();
  });

  it('provides display labels without exposing internal tokens', () => {
    expect(getInternalFieldOptionLabel(INTERNAL_FIELD_OPTION_VALUES.none)).toBe('None');
    expect(getInternalFieldOptionLabel(INTERNAL_FIELD_OPTION_VALUES.timelineNodeColor)).toBe('Node Color');
    expect(getInternalFieldOptionLabel(INTERNAL_FIELD_OPTION_VALUES.linkSourceId)).toBe('Source ID');
    expect(getInternalFieldOptionLabel(INTERNAL_FIELD_OPTION_VALUES.linkTargetId)).toBe('Target ID');
  });
});

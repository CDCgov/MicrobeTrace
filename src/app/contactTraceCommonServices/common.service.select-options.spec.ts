import { CommonService } from './common.service';

describe('CommonService select option rendering', () => {
  const testRootId = 'common-service-select-options-test-root';

  beforeEach(() => {
    const testRoot = document.createElement('div');
    testRoot.id = testRootId;
    document.body.appendChild(testRoot);
  });

  afterEach(() => {
    document.getElementById(testRootId)?.remove();
  });

  it('renders untrusted field names as option text instead of markup', () => {
    document.getElementById(testRootId)!.innerHTML = '<select id="search-field"></select>';
    const service = Object.create(CommonService.prototype) as CommonService;
    const maliciousField = 'field\"><img src=x onerror="window.xssTriggered = true">';

    (service as any).replaceSelectOptions('#search-field', [maliciousField]);

    const select = document.querySelector<HTMLSelectElement>('#search-field')!;
    expect(select.options.length).toBe(1);
    expect(select.options[0].value).toBe(maliciousField);
    expect(select.options[0].textContent).toBe(maliciousField);
    expect(select.querySelector('img')).toBeNull();
  });

  it('retains the None option for color variable dropdowns', () => {
    document.getElementById(testRootId)!.innerHTML = '<select id="node-color-variable"></select>';
    const service = Object.create(CommonService.prototype) as CommonService;

    (service as any).replaceSelectOptions('#node-color-variable', ['cluster'], true);

    const select = document.querySelector<HTMLSelectElement>('#node-color-variable')!;
    expect(Array.from(select.options).map(option => option.value)).toEqual(['None', 'cluster']);
  });

  it('keeps a real None field distinct from the synthetic choice in native selectors', () => {
    document.getElementById(testRootId)!.innerHTML = '<select id="node-color-variable"></select>';
    const service = Object.create(CommonService.prototype) as CommonService;
    (service as any).replaceSelectOptions('#node-color-variable', ['None'], true);
    const select = document.querySelector<HTMLSelectElement>('#node-color-variable')!;
    expect(select.options[0].textContent).toBe('None (No field)');
    expect(select.options[1].textContent).toBe('None');
    expect(select.options[1].value).not.toBe(select.options[0].value);
    expect(service.getFieldValue({ None: 'real-value' }, select.options[1].value)).toBe('real-value');
  });

  it('preserves exact field names so similar identifiers remain distinguishable', () => {
    document.getElementById(testRootId)!.innerHTML = '<select id="search-field"></select>';
    const service = Object.create(CommonService.prototype) as CommonService;
    const fields = ['id', '_id', 'lat', 'Lat', 'l_at'];

    (service as any).replaceSelectOptions('#search-field', fields);

    const select = document.querySelector<HTMLSelectElement>('#search-field')!;
    expect(Array.from(select.options).map(option => option.textContent)).toEqual(fields);
    expect(Array.from(select.options).map(option => option.value)).toEqual(fields);
  });

  it('keeps case-distinct styleable fields while removing exact duplicates', () => {
    const service = Object.create(CommonService.prototype) as CommonService;
    (service as any).session = {
      data: { nodeFields: ['lat', 'Lat', 'l_at', 'lat'] }
    };
    (service as any).nonStyleableNodeFields = new Set<string>();
    (service as any).lowPriorityStyleableNodeFields = new Set<string>();

    expect(service.getStyleableNodeFields()).toEqual(['lat', 'Lat', 'l_at']);
  });
});

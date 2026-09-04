import { ExportService } from './export.service';

describe('ExportService continuous color legends', () => {
  let service: ExportService;

  beforeEach(() => {
    service = new ExportService();
  });

  it('exports a visible, accessible label with the continuous ramp', () => {
    const legend = document.createElement('div');
    legend.id = 'key-tables-node-legend';
    legend.innerHTML = `
      <h6 class="continuous-ramp__label">Node Color: Risk &amp; score</h6>
      <div
        class="continuous-ramp__gradient"
        aria-label="Continuous color ramp from 0 to 10."
        style="background: linear-gradient(to right, #000000 0%, #ffffff 100%);">
      </div>
      <div class="continuous-ramp__ticks">
        <span style="left: 0%">0</span>
        <span style="left: 100%">10</span>
      </div>
      <span class="continuous-ramp__missing-swatch" style="background: #abcdef"></span>
    `;

    const output = service.exportColorLegendAsSVG(legend);

    expect(output.width).toBeGreaterThanOrEqual(320);
    expect(output.height).toBe(134);
    expect(output.svg).toContain('<title>Node Color: Risk &amp; score. Continuous color ramp from 0 to 10.</title>');
    expect(output.svg).toContain('font-weight="bold" fill="black">Node Color: Risk &amp; score</text>');
    expect(output.svg).toContain('y="36"');
    expect(output.svg).toContain('y="104"');
  });
});

import { ExportService } from './export.service';
import { threeDShapePreview } from '../visualizationComponents/ThreeDComponent/three-d-shape-previews';

describe('shape key image exports', () => {
  it('keeps a 3D preview and display name when composing an SVG legend', () => {
    const service = new ExportService();
    const table = document.createElement('table');
    const row = table.insertRow();
    row.insertCell().textContent = 'A group';
    const cell = row.insertCell();
    const wrapper = document.createElement('span');
    wrapper.className = 'shape-tree-value';
    const preview = document.createElement('img');
    preview.setAttribute('data-shape-key', 'cube');
    preview.setAttribute('data-shape-preview-src', threeDShapePreview('cube'));
    wrapper.append(preview, document.createTextNode('Cube'));
    cell.appendChild(wrapper);
    const svg = service.exportTableAsSVG(table, false).svg;
    expect(svg).toContain('A group');
    expect(svg).toContain('Cube');
    expect(svg).toContain(threeDShapePreview('cube').replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;'));
  });
});

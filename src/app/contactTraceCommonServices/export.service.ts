import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { getNodeShapePreviewDataUri } from './node-shapes';

export interface ExportOptions {
  filename: string;
  filetype: string;
  scale: number;
  quality: number;
}

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private readonly nodeShapeExportPrefix = 'nodeShape|';
  private textMeasureContext: CanvasRenderingContext2D | null = null;

  private exportRequestedSource = new Subject<{
    element: HTMLElement[],
    exportNodeTable: boolean,
    exportLinkTable: boolean,
    exportNodeShapeTable: boolean
  }>();
  exportRequested$: Observable<{
    element: HTMLElement[],
    exportNodeTable: boolean,
    exportLinkTable: boolean,
    exportNodeShapeTable: boolean
  }> = this.exportRequestedSource.asObservable();

  private exportSVGSource = new Subject<{
    element: HTMLTableElement[],
    mainSVGString: string,
    exportNodeTable: boolean,
    exportLinkTable: boolean,
    exportNodeShapeTable: boolean
  }>();
  exportSVG$: Observable<{
    element: HTMLTableElement[],
    mainSVGString: string,
    exportNodeTable: boolean,
    exportLinkTable: boolean,
    exportNodeShapeTable: boolean
  }> = this.exportSVGSource.asObservable();

  private exportOptions: ExportOptions = {
    filename: 'network_export',
    filetype: 'png',
    scale: 1,
    quality: 0.92,
  };

  constructor() {}

  /**
   * Sets the export options.
   * @param options ExportOptions object containing user-selected options.
   */
  setExportOptions(options: ExportOptions): void {
    this.exportOptions = { ...options };
  }

  /**
   * Retrieves the current export options.
   * @returns ExportOptions object.
   */
  getExportOptions(): ExportOptions {
    return this.exportOptions;
  }

  /**
   * Notifies subscribers that an export has been requested.
   * @param element The HTMLDivElement(s) to export.
   * @param exportNodeTable Flag for exporting the node table.
   * @param exportLinkTable Flag for exporting the link table.
   * @param exportNodeShapeTable Flag for exporting the node shape table.
   */
  requestExport(
    element: HTMLElement[],
    exportNodeTable: boolean,
    exportLinkTable: boolean,
    exportNodeShapeTable: boolean = false
  ): void {
    this.exportRequestedSource.next({ element, exportNodeTable, exportLinkTable, exportNodeShapeTable });
  }

  /**
   * Notifies subscribers that an SVG export has been requested.
   * @param element The HTMLTableElement(s) to export.
   * @param mainSVGString The main SVG string.
   * @param exportNodeTable Flag for exporting the node table.
   * @param exportLinkTable Flag for exporting the link table.
   * @param exportNodeShapeTable Flag for exporting the node shape table.
   */
  requestSVGExport(
    element: HTMLTableElement[],
    mainSVGString: string,
    exportNodeTable: boolean,
    exportLinkTable: boolean,
    exportNodeShapeTable: boolean = false
  ): void {
    this.exportSVGSource.next({ element, mainSVGString, exportNodeTable, exportLinkTable, exportNodeShapeTable });
  }

  private getTextMeasureContext(): CanvasRenderingContext2D | null {
    if (this.textMeasureContext) {
      return this.textMeasureContext;
    }

    const canvas = document.createElement('canvas');
    this.textMeasureContext = canvas.getContext('2d');
    return this.textMeasureContext;
  }

  private normalizeCellText(text: string): string {
    return text
      .replace(/\u21C5/g, '')
      .replace(/â‡…|Ã¢â€¡â€¦/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getShapeExportData(cellValue: string): { shapeKey: string, label: string } | null {
    if (cellValue.startsWith(this.nodeShapeExportPrefix)) {
      const [, shapeKey = '', label = ''] = cellValue.split('|');
      return {
        shapeKey: decodeURIComponent(shapeKey),
        label: decodeURIComponent(label)
      };
    }

    if (cellValue === 'shapeRhombus') {
      return { shapeKey: 'rhomboid', label: '(Rhombus)' };
    }
    if (cellValue === 'shapeTag') {
      return { shapeKey: 'tag', label: '(Tag)' };
    }
    if (cellValue === 'shapeBarrel') {
      return { shapeKey: 'barrel', label: '(Barrel)' };
    }

    return null;
  }

  private getShapeExportLabel(cellValue: string): string {
    return this.getShapeExportData(cellValue)?.label ?? cellValue;
  }

  private isShapeExportCellValue(cellValue: string): boolean {
    return this.getShapeExportData(cellValue) !== null;
  }

  private measureTextWidth(
    text: string,
    fontWeight: 'normal' | 'bold' = 'normal',
    fontSize: number = 16
  ): number {
    const context = this.getTextMeasureContext();
    if (!context) {
      return text.length * fontSize * (fontWeight === 'bold' ? 0.625 : 0.5625);
    }

    context.font = `${fontWeight === 'bold' ? '700' : '400'} ${fontSize}px Roboto, "Helvetica Neue", sans-serif`;
    return Math.ceil(context.measureText(text).width);
  }

  private getEstimatedCellWidth(cellValue: string, isHeaderCell: boolean, fontSize: number): number {
    if (this.isColorCellValue(cellValue)) {
      return 40;
    }

    if (this.isShapeExportCellValue(cellValue)) {
      return this.measureTextWidth(this.getShapeExportLabel(cellValue), 'normal', fontSize) + 40;
    }

    return this.measureTextWidth(cellValue, isHeaderCell ? 'bold' : 'normal', fontSize) + 16;
  }

  private getCellDimensions(
    cell: HTMLTableCellElement,
    cellValue: string,
    isHeaderCell: boolean,
    fontSize: number
  ): { width: number, height: number } {
    const rect = cell.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(cell);
    const paddingTop = parseFloat(computedStyle.paddingTop || '0');
    const paddingBottom = parseFloat(computedStyle.paddingBottom || '0');
    const estimatedWidth = this.getEstimatedCellWidth(cellValue, isHeaderCell, fontSize);
    const estimatedHeight = Math.ceil(Math.max(
      isHeaderCell ? fontSize * 1.5 : this.isShapeExportCellValue(cellValue) ? fontSize + 14 : fontSize + 6,
      fontSize + paddingTop + paddingBottom
    ));

    return {
      width: Math.ceil(Math.max(rect.width, cell.offsetWidth, cell.scrollWidth, estimatedWidth)),
      height: estimatedHeight
    };
  }

  private escapeSVGText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private isColorCellValue(cellValue: string): boolean {
    const [color] = cellValue.split(':');
    return color.length === 7 && color[0] === '#';
  }

  private extractShapeCellValue(cell: HTMLTableCellElement): string | null {
    const shapeSelector = cell.querySelector('p-dropdown, p-treeselect');
    if (!shapeSelector) {
      return null;
    }

    const shapePreview = shapeSelector.querySelector<HTMLElement>('[data-shape-key]');
    if (shapePreview) {
      const shapeKey = shapePreview.getAttribute('data-shape-key') ?? '';
      const textSource = shapeSelector.querySelector('.shape-tree-value, .p-dropdown-label, .p-treeselect-label') as HTMLElement | null;
      const label = (textSource?.textContent ?? shapeSelector.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();

      return `${this.nodeShapeExportPrefix}${encodeURIComponent(shapeKey)}|${encodeURIComponent(label)}`;
    }

    const shapeAnchor = shapeSelector.querySelector('a');
    if (shapeAnchor?.classList.contains('rhombus')) {
      return 'shapeRhombus';
    }
    if (shapeAnchor?.classList.contains('tag')) {
      return 'shapeTag';
    }
    if (shapeAnchor?.classList.contains('barrel')) {
      return 'shapeBarrel';
    }

    const textSource = shapeSelector.querySelector('.shape-tree-value, .p-dropdown-label, .p-treeselect-label') as HTMLElement | null;
    const text = (textSource?.textContent ?? shapeSelector.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

    return text.length > 0 ? text : null;
  }

  private getCellExportValue(cell: HTMLTableCellElement): string {
    const shapeCellValue = this.extractShapeCellValue(cell);
    if (shapeCellValue !== null) {
      return shapeCellValue;
    }

    const colorInput = cell.querySelector('input[type="color"]') as HTMLInputElement | null;
    if (colorInput) {
      const opacity = colorInput.style.opacity || '1';
      return `${colorInput.value}:${opacity}`;
    }

    return this.normalizeCellText(cell.innerText);
  }

  private buildShapeSVG(
    cellValue: string,
    x: number,
    baselineY: number,
    renderNodeShapeImages: boolean,
    fontSize: number
  ): string {
    const shapeData = this.getShapeExportData(cellValue);
    if (!shapeData) {
      return '';
    }

    const label = this.escapeSVGText(shapeData.label);
    const iconTop = baselineY - 16;
    const escapedShapeKey = this.escapeSVGText(shapeData.shapeKey);
    const previewDataUri = getNodeShapePreviewDataUri(shapeData.shapeKey);

    if (renderNodeShapeImages) {
      const markerSvg = this.parseNodeShapeDataUri(previewDataUri);
      const viewBox = String(markerSvg?.documentElement.getAttribute('viewBox') || '')
        .trim()
        .split(/\s+/)
        .map(Number);
      if (markerSvg && viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
        const iconSize = 22;
        const scale = Math.min(iconSize / viewBox[2], iconSize / viewBox[3]);
        const translateX = x + ((iconSize - (viewBox[2] * scale)) / 2) - (viewBox[0] * scale);
        const translateY = iconTop + ((iconSize - (viewBox[3] * scale)) / 2) - (viewBox[1] * scale);
        const markerContents = Array.from(markerSvg.documentElement.childNodes)
          .map(child => new XMLSerializer().serializeToString(child))
          .join('');
        return `<g data-node-shape-key="${escapedShapeKey}" font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="${fontSize}" fill="black">
          <g transform="translate(${translateX},${translateY}) scale(${scale})">${markerContents}</g>
          <text x="${x + 30}" y="${baselineY}">${label}</text>
        </g>`;
      }
    }

    const previewUri = this.escapeSVGText(previewDataUri);

    return `<g data-node-shape-key="${escapedShapeKey}" font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="${fontSize}" fill="black">
      <image href="${previewUri}" x="${x}" y="${iconTop}" width="16" height="16" preserveAspectRatio="xMidYMid meet"></image>
      <text x="${x + 22}" y="${baselineY}">${label}</text>
    </g>`;
  }

  private parseNodeShapeDataUri(dataUri: string): XMLDocument | null {
    const commaIndex = dataUri.indexOf(',');
    if (commaIndex < 0) {
      return null;
    }

    try {
      const payload = dataUri.slice(commaIndex + 1);
      const parsed = new DOMParser().parseFromString(decodeURIComponent(payload), 'image/svg+xml');
      return parsed.getElementsByTagName('parsererror').length === 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Converts an HTMLTableElement into an SVG representation.
   * @param tableElement The HTMLTableElement (for example, a Node Color Table).
   * @param hasHeaderRow Whether the first row should use bold header styling.
   * @param renderNodeShapeImages Whether node-shape previews should be rendered as vectors.
   * @param fontSize Font size used to measure and render table text.
   * @returns An object containing the SVG string (<g>...</g>), width, and height.
   */
  exportTableAsSVG(
    tableElement: HTMLTableElement,
    hasHeaderRow: boolean = false,
    renderNodeShapeImages: boolean = false,
    fontSize: number = 16
  ): { svg: string, width: number, height: number } {
    const exportFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
    const rows = tableElement.rows;
    const tableData: string[][] = [];
    const columnWidths: number[] = [];
    const rowHeights: number[] = [];

    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].cells;
      const rowData: string[] = [];
      let rowHeight = 0;
      let visibleColumnIndex = 0;

      for (let j = 0; j < cells.length; j++) {
        const computedStyle = window.getComputedStyle(cells[j]);
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
          continue;
        }

        const cellValue = this.getCellExportValue(cells[j]);
        rowData.push(cellValue);

        const dimensions = this.getCellDimensions(
          cells[j],
          cellValue,
          hasHeaderRow && i === 0,
          exportFontSize
        );
        columnWidths[visibleColumnIndex] = Math.max(columnWidths[visibleColumnIndex] || 0, dimensions.width);
        rowHeight = Math.max(rowHeight, dimensions.height);
        visibleColumnIndex++;
      }

      if (rowData.length > 0) {
        tableData.push(rowData);
        rowHeights.push(rowHeight || 24);
      }
    }

    const widthOffsets: number[] = [10];
    columnWidths.forEach((columnWidth, index) => {
      widthOffsets.push(widthOffsets[index] + columnWidth + 15);
    });

    const heightOffsets: number[] = [Math.max(15, exportFontSize)];
    rowHeights.forEach((rowHeight, index) => {
      heightOffsets.push(heightOffsets[index] + rowHeight);
    });

    const tableWidth = Math.max(0, widthOffsets[widthOffsets.length - 1] - 20);
    const tableHeight = Math.max(0, heightOffsets[heightOffsets.length - 1] - 10);
    let out = `<g><rect x="0" y="0" width="${tableWidth}" height="${tableHeight}" fill="#ffffff" stroke="black" stroke-width="1"></rect>`;

    tableData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (this.isColorCellValue(cell)) {
          const data = cell.split(':');
          out += `<rect x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex] - 12}" width="20" height="20" fill="${data[0]}" fill-opacity="${data[1]}"></rect>`;
        } else if (this.isShapeExportCellValue(cell)) {
          out += this.buildShapeSVG(
            cell,
            widthOffsets[colIndex],
            heightOffsets[rowIndex],
            renderNodeShapeImages,
            exportFontSize
          );
        } else if (hasHeaderRow && rowIndex === 0) {
          out += `<text x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex]}" font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="${exportFontSize}" fill="black" font-weight="bold">${this.escapeSVGText(cell)}</text>`;
        } else {
          out += `<text x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex]}" font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="${exportFontSize}" fill="black">${this.escapeSVGText(cell)}</text>`;
        }
      });
    });

    out += '</g>';
    return { svg: out, width: tableWidth, height: tableHeight };
  }

  /**
   * Extracts the SVG from a DOM element with CSS included.
   * @param svgNode The SVG HTMLElement (for example, obtained via document.getElementById('network')).
   * @returns A string containing the complete SVG code with CSS.
   */
  unparseSVG(svgNode: HTMLElement): string {
    svgNode.setAttribute('xlink', 'http://www.w3.org/1999/xlink');
    const selectorTextArr: string[] = [];

    // Add the parent element's ID and classes.
    selectorTextArr.push('#' + svgNode.id);
    const nClasses = svgNode.classList.length;
    for (let c = 0; c < nClasses; c++) {
      const classSelector = '.' + svgNode.classList[c];
      if (!selectorTextArr.includes(classSelector)) {
        selectorTextArr.push(classSelector);
      }
    }

    // Add children element IDs and classes.
    const nodes = svgNode.getElementsByTagName('*');
    const nNodes = nodes.length;
    for (let i = 0; i < nNodes; i++) {
      const child = nodes[i] as HTMLElement;
      const childId = child.id;
      if (childId && !selectorTextArr.includes('#' + childId)) {
        selectorTextArr.push('#' + childId);
      }
      const classes = child.classList;
      for (let d = 0; d < classes.length; d++) {
        const classSelector = '.' + classes[d];
        if (!selectorTextArr.includes(classSelector)) {
          selectorTextArr.push(classSelector);
        }
      }
    }

    // Extract CSS rules for the selectors.
    let extractedCSSText = '';
    const nStylesheets = document.styleSheets.length;
    for (let j = 0; j < nStylesheets; j++) {
      const s = document.styleSheets[j] as CSSStyleSheet;
      try {
        if (!s.cssRules) continue;
      } catch (e) {
        if ((e as Error).name !== 'SecurityError') throw e;
        continue;
      }
      const cssRules = s.cssRules;
      const nRules = cssRules.length;
      for (let r = 0; r < nRules; r++) {
        const rule = cssRules[r] as CSSStyleRule;
        if (!rule.selectorText) continue;
        if (selectorTextArr.some(selector => rule.selectorText.includes(selector))) {
          extractedCSSText += rule.cssText;
        }
      }
    }

    const styleElement = document.createElement('style');
    styleElement.setAttribute('type', 'text/css');
    styleElement.innerHTML = extractedCSSText;
    const refNode = svgNode.hasChildNodes() ? svgNode.children[0] : null;
    svgNode.insertBefore(styleElement, refNode);
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgNode);
  }

  /**
     * XXXXX TODO:: currently not in use - do we need? XXXXX
     * @returns
     */
//   exportHIVTRACE() {
//     let links = this.session.data.links.filter(l => l.visible);
//     let geneticLinks = links.filter(l => l.origin.includes("Genetic Distance"));
//     let sequences = new Set(
//         geneticLinks.map(l => l.source).concat(
//             geneticLinks.map(l => l.target))
//     ).size;
//     let pas = {};
//     this.session.data.nodes.forEach(d => {
//         Object.keys(d).forEach(key => {
//             if (pas[key]) return;
//             pas[key] = {
//                 label: key,
//                 type: this.titleize(typeof d[key])
//             };
//         });
//     });
//     return JSON.stringify(
//         {
//             trace_results: {
//                 "Cluster sizes": this.session.data.clusters.map(c => c.size),
//                 Degrees: {
//                     Distribution: [],
//                     Model: "Waring",
//                     fitted: [],
//                     rho: 0,
//                     "rho CI": [-1, 1]
//                 },
//                 "Directed Edges": {
//                     Count: 0,
//                     "Reasons for unresolved directions": {
//                         "Missing dates": links.length
//                     }
//                 },
//                 "Edge Stages": {},
//                 Edges: links.map(l => ({
//                     attributes: ["BULK"],
//                     directed: false,
//                     length: l[this.session.style.widgets["link-sort-variable"]],
//                     removed: false,
//                     sequences: [l.source, l.target],
//                     source: this.session.data.nodes.findIndex(d => d._id == l.source),
//                     support: 0,
//                     target: this.session.data.nodes.findIndex(d => d._id == l.target)
//                 })),
//                 "HIV Stages": {
//                     "A-1": 0,
//                     "A-2": 0,
//                     "A-3": 0,
//                     Chronic: this.session.data.nodes.length,
//                     "E-1": 0,
//                     "E-2": 0,
//                     "E-3": 0
//                 },
//                 "Multiple sequences": {
//                     "Followup, days": null,
//                     "Subjects with": 0
//                 },
//                 "Network Summary": {
//                     Clusters: this.session.data.clusters.length,
//                     Edges: links.length,
//                     Nodes: this.session.data.nodes.length,
//                     "Sequences used to make links": sequences
//                 },
//                 Nodes: this.session.data.nodes.map(d => ({
//                     attributes: [],
//                     baseline: null,
//                     cluster: d.cluster,
//                     edi: null,
//                     id: d._id,
//                     patient_attributes: d
//                 })),
//                 patient_attribute_schema: pas,
//                 Settings: {
//                     "contaminant-ids": [],
//                     contaminants: "remove",
//                     "edge-filtering": "remove",
//                     threshold: this.session.style.widgets["link-threshold"]
//                 }
//             }
//         },
//         null,
//         2
//     );
// };

}

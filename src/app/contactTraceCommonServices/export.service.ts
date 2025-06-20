import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

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
  private exportRequestedSource = new Subject<{
    element: HTMLDivElement[],
    exportNodeTable: boolean,
    exportLinkTable: boolean
  }>();
  exportRequested$: Observable<{
    element: HTMLDivElement[],
    exportNodeTable: boolean,
    exportLinkTable: boolean
  }> = this.exportRequestedSource.asObservable();

  private exportSVGSource = new Subject<{
    element: HTMLTableElement[],
    mainSVGString: string,
    exportNodeTable: boolean,
    exportLinkTable: boolean
  }>();
  exportSVG$: Observable<{
    element: HTMLTableElement[],
    mainSVGString: string,
    exportNodeTable: boolean,
    exportLinkTable: boolean
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
   */
  requestExport(element: HTMLDivElement[], exportNodeTable: boolean, exportLinkTable: boolean): void {
    this.exportRequestedSource.next({ element, exportNodeTable, exportLinkTable });
  }

  /**
   * Notifies subscribers that an SVG export has been requested.
   * @param element The HTMLTableElement(s) to export.
   * @param mainSVGString The main SVG string.
   * @param exportNodeTable Flag for exporting the node table.
   * @param exportLinkTable Flag for exporting the link table.
   */
  requestSVGExport(element: HTMLTableElement[], mainSVGString: string, exportNodeTable: boolean, exportLinkTable: boolean): void {
    this.exportSVGSource.next({ element, mainSVGString, exportNodeTable, exportLinkTable });
  }

  /**
   * Converts an HTMLTableElement into an SVG representation.
   * @param tableElement The HTMLTableElement (for example, a Node Color Table).
   * @returns An object containing the SVG string (<g>...</g>), width, and height.
   */
  exportTableAsSVG(tableElement: HTMLTableElement, hasHeaderRow: boolean = false): { svg: string, width: number, height: number } {
    const rows = tableElement.rows;
    let tableData: string[][] = [];
    let widthOffsets: number[] = [10];
    let heightOffsets: number[] = [15];

    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].cells;
      const rowData: string[] = [];
      
      for (let j = 0; j < cells.length; j++) {
        if (i === 0) {
          widthOffsets.push(widthOffsets[j] + cells[j].offsetWidth + 15);
        }
        if (j === 0) {
          heightOffsets.push(heightOffsets[i] + cells[0].offsetHeight);
        }

        if (window.getComputedStyle(cells[j]).display === 'none') {
          continue;
        }
        if (cells[j].querySelector('p-dropdown')) {
          if (cells[j].querySelector('p-dropdown div a').className == 'rhombus'){
            rowData.push('shapeRhombus')
          } else if (cells[j].querySelector('p-dropdown div a').className == 'tag'){
            rowData.push('shapeTag')
          } else if (cells[j].querySelector('p-dropdown div a').className == 'barrel'){
            rowData.push('shapeBarrel')
          } else {
            rowData.push(cells[j].querySelector('p-dropdown div').innerHTML.replace(/&nbsp;/g, ' '));
          }
        } else if (cells[j].querySelector('input[type="color"]')) {
          const input = (cells[j].querySelector('input[type="color"]') as HTMLInputElement)
          let color = input.value;
          let opacity = input.style['opacity'] || '1';
          rowData.push(`${color}:${opacity}`);
        } else {
          rowData.push(cells[j].innerText.replace('⇅', ''));
        }
      }
      tableData.push(rowData);
    }

    let out = `<g><rect x="0" y="0" width="${widthOffsets[widthOffsets.length - 1] - 20}" height="${heightOffsets[heightOffsets.length - 1] - 10}" stroke="black" stroke-width="1"></rect>`;
    
    tableData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell.split(':')[0].length === 7 && cell[0] === '#') {
          let data = cell.split(':');
          out += `<rect x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex] - 12}" width="20" height="20" fill="${data[0]}" fill-opacity="${data[1]}"></rect>`;
        } else if (cell === 'shapeRhombus') { 
          out += `<g font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="16" fill="black">
            <text x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex]-12}" fill="black" rotate="80">▰</text>
            <text x="${widthOffsets[colIndex]+15}" y="${heightOffsets[rowIndex]}">(Rhombus)</text>
            </g>`;
        } else if (cell === 'shapeTag') { 
          out += `<g font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="16" fill="black">
            <text x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex]-12}" fill="black" rotate="90">☗</text>
            <text x="${widthOffsets[colIndex]+15}" y="${heightOffsets[rowIndex]}">(Tag)</text>
            </g>`;
        } else if (cell === 'shapeBarrel') { 
          out += `<g font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="16" fill="black">
            <rect x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex]-12}" fill="black" width="12" height="12" rx="4" ry="4"/>
            <text x="${widthOffsets[colIndex]+15}" y="${heightOffsets[rowIndex]}">(Barrel)</text>
            </g>`;
        } else if (hasHeaderRow && rowIndex === 0) { 
          out += `<text x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex]}" font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="16" fill="black" font-weight="bold">${cell}</text>`;
        } else {
          out += `<text x="${widthOffsets[colIndex]}" y="${heightOffsets[rowIndex]}" font-family="Roboto, 'Helvetica Neue', sans-serif" font-size="16" fill="black">${cell}</text>`;
        }
      });
    });

    out += '</g>';
    return { svg: out, width: widthOffsets[widthOffsets.length - 1] - 20, height: heightOffsets[heightOffsets.length - 1] - 10 };
  }

  /**
   * Extracts the SVG from a DOM element with CSS included.
   * @param svgNode The SVG HTMLElement (for example, obtained via document.getElementById('network')).
   * @returns A string containing the complete SVG code with CSS.
   */
  unparseSVG(svgNode: HTMLElement): string {
    svgNode.setAttribute("xlink", "http://www.w3.org/1999/xlink");
    const selectorTextArr: string[] = [];

    // Add the parent element's ID and classes.
    selectorTextArr.push("#" + svgNode.id);
    const nClasses = svgNode.classList.length;
    for (let c = 0; c < nClasses; c++) {
      const classSelector = "." + svgNode.classList[c];
      if (!selectorTextArr.includes(classSelector)) {
        selectorTextArr.push(classSelector);
      }
    }

    // Add children element IDs and classes.
    const nodes = svgNode.getElementsByTagName("*");
    const nNodes = nodes.length;
    for (let i = 0; i < nNodes; i++) {
      const child = nodes[i] as HTMLElement;
      const childId = child.id;
      if (childId && !selectorTextArr.includes("#" + childId)) {
        selectorTextArr.push("#" + childId);
      }
      const classes = child.classList;
      for (let d = 0; d < classes.length; d++) {
        const classSelector = "." + classes[d];
        if (!selectorTextArr.includes(classSelector)) {
          selectorTextArr.push(classSelector);
        }
      }
    }

    // Extract CSS rules for the selectors.
    let extractedCSSText = "";
    const nStylesheets = document.styleSheets.length;
    for (let j = 0; j < nStylesheets; j++) {
      const s = document.styleSheets[j] as CSSStyleSheet;
      try {
        if (!s.cssRules) continue;
      } catch (e) {
        if ((e as Error).name !== "SecurityError") throw e;
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

    const styleElement = document.createElement("style");
    styleElement.setAttribute("type", "text/css");
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
import { Injectable } from "@angular/core";

import { MicrobeTraceNextHomeComponent } from "./microbe-trace-next-plugin.component";
import { FilesComponent } from "./filesComponent/files-plugin.component";
import { TwoDComponent } from "./visualizationComponents/TwoDComponent/twoD-plugin.component";
import { MapComponent } from "./visualizationComponents/MapComponent/map-plugin.component";
import { TableComponent } from "./visualizationComponents/TableComponent/table-plugin-component";
import { PhylogeneticComponent } from "./visualizationComponents/PhylogeneticComponent/phylogenetic-plugin.component";
import { TimelineComponent } from "./visualizationComponents/TimelineComponent/timeline-component.component";
import { AlignmentViewComponent } from "./visualizationComponents/AlignmentViewComponent/alignment-view-plugin-component";
import { CrosstabComponent } from "./visualizationComponents/CrosstabComponent/crosstab-plugin.component";
import { AggregateComponent } from "./visualizationComponents/AggregateComponent/aggregate.component";
import { GanttComponent } from "./visualizationComponents/GanttComponent/gantt-plugin.component";
import { HeatmapComponent } from "./visualizationComponents/HeatmapComponent/heatmap.component";
import { BubbleComponent } from "./visualizationComponents/BubbleComponent/bubble.component";
import { WaterfallComponent } from './visualizationComponents/WaterfallComponent/waterfall.component';

@Injectable({
    providedIn: 'root',
})
export class MicrobeTraceNextVisuals {
    public microbeTrace: MicrobeTraceNextHomeComponent;
    public filesPlugin: FilesComponent;
    public twoD: TwoDComponent;
    public gisMap: MapComponent;
    public tableComp: TableComponent;
    public epiCurve: TimelineComponent;
    public phylogenetic: PhylogeneticComponent;
    public alignment: AlignmentViewComponent;
    public crossTab: CrosstabComponent;
    public aggregate: AggregateComponent;
    public gantt: GanttComponent;
    public heatmap: HeatmapComponent;
    public bubble: BubbleComponent;
    public waterfall: WaterfallComponent;
}

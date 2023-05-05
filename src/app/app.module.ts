import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule, Component } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import * as $ from 'jquery';
import { HttpClientModule, HttpClientJsonpModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
// import { ServiceProxyModule } from '@shared/service-proxies/service-proxy.module';
import { UtilsModule } from '@shared/utils/utils.module';
import { AbpModule } from 'abp-ng2-module/dist/src/abp.module';
import { ModalModule, TooltipModule, TabsModule, BsDropdownModule, PopoverModule } from 'ngx-bootstrap';
import { TableModule } from 'primeng/components/table/table';
import { FileUploadModule, ListboxModule, RadioButtonModule, CalendarModule, PaginatorModule, ProgressBarModule, ConfirmDialogModule, DropdownModule, AccordionModule, SidebarModule, MultiSelect, MultiSelectModule, SliderModule } from 'primeng/primeng';
import { MicrobeTraceNextHomeComponent } from './microbe-trace-next-plugin.component';
import {TabViewModule} from 'primeng/tabview';
import {SelectButtonModule} from 'primeng/selectbutton';
import {TreeModule} from 'primeng/tree';
import {DialogModule} from 'primeng/dialog';
import { AppSessionService } from '@shared/common/session/app-session.service';
import { AppUiCustomizationService } from '@shared/common/ui/app-ui-customization.service';
import { AppUrlService } from '@shared/common/nav/app-url.service';
import { FilesComponent } from './filesComponent/files-plugin.component';
import { AggregationComponent } from './visualizationComponents/AggregationComponent/aggregation-plugin.component';
import { BubblesComponent } from './visualizationComponents/BubblesComponent/bubbles-plugin.component';
import { FlowDiagramComponent } from './visualizationComponents/FlowDiagrmComponent/flowDiagram-plugin.component';
import { GanttComponent } from './visualizationComponents/GanttCompnent/gantt-plugin.component';
import { HeatMapComponent } from './visualizationComponents/HeatMapComponent/heatMap-plugin.component';
import { PhylogeneticComponent } from './visualizationComponents/PhylogeneticComponent/phylogenetic-plugin.component';
import { ScatterPlotComponent } from './visualizationComponents/ScatterPlotComponent/scatterPlot-plugin.component';
import { TimelineComponent } from './visualizationComponents/TimelineComponent/timeline-plugin.component';
import { TwoDComponent } from './visualizationComponents/TwoDComponent/twoD-plugin.component';
import { WaterfallComponent } from './visualizationComponents/WaterfallComponent/waterfall-plugin.component';

import { CoreModule } from '@metronic/app/core/core.module';
import { ThreeDComponent } from './visualizationComponents/ThreeDComponent/threeD-plugin-component';
import { TableComponent } from './visualizationComponents/TableComponent/table-plugin-component';
import { HistogramComponent } from './visualizationComponents/HistogramComponent/histogram-plugin.component';
import { MapComponent } from './visualizationComponents/MapComponent/map-plugin.component';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import { LeafletMarkerClusterModule } from '@asymmetrik/ngx-leaflet-markercluster';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSliderModule } from '@angular/material/slider';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DndDirective } from '@shared/dnd.directive';

// import { GoldenLayoutModule, GoldenLayoutService, GoldenLayoutConfiguration } from '@embedded-enterprises/ng6-golden-layout';
// import GoldenLayout from 'golden-layout';

// It is required to have JQuery as global in the window object.
window['$'] = $;

@Component({
  template: `<h1>Test2</h1>`,
  selector: `app-tested`,
})
export class TestedComponent {
  constructor() { }

}

// const config: GoldenLayoutConfiguration = {
//   components: [
//     {
//       componentName: "FilesComponent",
//       component: FilesComponent
//     },
//     {
//       componentName: "TwoDComponent",
//       component: TwoDComponent
//     },
//     {
//       componentName: "TableComponent",
//       component: TableComponent
//     },
//     {
//       componentName: "MapComponent",
//       component: MapComponent
//     },
//     {
//       componentName: "PhylogeneticComponent",
//       component: PhylogeneticComponent
//     },
//   ],
//   defaultLayout: {
//     content: [{
//         type: 'stack',
//         content:[
//           {
//             type: 'component',
//             componentName: 'FilesComponent',
//             componentState: { label: 'A' }
//            }
//           ]
//     }]
//   }
// };

@NgModule({
  declarations: [
    AppComponent,
    MicrobeTraceNextHomeComponent,
    FilesComponent,
    TwoDComponent,
    HistogramComponent,
    ThreeDComponent,
    TableComponent,
    AggregationComponent,
    BubblesComponent,
    FlowDiagramComponent,
    ScatterPlotComponent,
    WaterfallComponent,
    MapComponent,
    GanttComponent,
    TimelineComponent,
    TestedComponent,
    HeatMapComponent,
    DndDirective,
    PhylogeneticComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    //ngCommon.CommonModule,
    FormsModule,
    // GoldenLayoutModule.forRoot(config),
    HttpClientModule,
    MatButtonModule,
    MatInputModule,
    MatMenuModule,
    MatSliderModule,
    MatToolbarModule,
    HttpClientJsonpModule,
    ModalModule.forRoot(),
    TooltipModule.forRoot(),
    TabsModule.forRoot(),
    BsDropdownModule.forRoot(),
    PopoverModule.forRoot(),
    FileUploadModule,
    AbpModule,
    AppRoutingModule,
    UtilsModule,
    //AppCommonModule.forRoot(),
    // ServiceProxyModule,
    TableModule,
    ListboxModule,   
    RadioButtonModule,     
    CalendarModule,
    PaginatorModule,
    //PrimeNgFileUploadModule,
    ProgressBarModule,
    //PerfectScrollbarModule,
    CoreModule,
    //NgxChartsModule,
    //TextMaskModule,
    //ImageCropperModule,
    ConfirmDialogModule,    
    DropdownModule,
    TabViewModule,
    SelectButtonModule,
    TreeModule,
    DialogModule,
    AccordionModule,
    SidebarModule,
    MultiSelectModule,
    SliderModule,
    LeafletModule,
    LeafletMarkerClusterModule
  ],
  entryComponents:[
    FilesComponent,
    TwoDComponent,
    HistogramComponent,
    ThreeDComponent,
    TableComponent,
    TestedComponent,
    AggregationComponent,
    BubblesComponent,
    FlowDiagramComponent,
    ScatterPlotComponent,
    WaterfallComponent,
    MapComponent,
    GanttComponent,
    TimelineComponent,
    HeatMapComponent,
    PhylogeneticComponent
  ],
  providers: [
    AppSessionService,
    AppUiCustomizationService,
    AppUrlService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

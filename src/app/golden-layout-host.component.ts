import { ApplicationRef, Component, ComponentRef, ElementRef, EmbeddedViewRef, EventEmitter, OnDestroy, Output, ViewChild, ViewContainerRef } from '@angular/core';
import {
  ComponentContainer, GoldenLayout,
  LogicalZIndex,
  ResolvedComponentItemConfig
} from "golden-layout";
import { BaseComponentDirective } from './base-component.directive';
import { GoldenLayoutComponentService } from './golden-layout-component.service';
import { FilesComponent } from './filesComponent/files-plugin.component';
import { MapComponent } from './visualizationComponents/MapComponent/map-plugin.component';
import { PhylogeneticComponent } from './visualizationComponents/PhylogeneticComponent/phylogenetic-plugin.component';
import { TimelineComponent } from './visualizationComponents/TimelineComponent/timeline-component.component';
import { TableComponent } from './visualizationComponents/TableComponent/table-plugin-component';
import { TwoDComponent } from './visualizationComponents/TwoDComponent/twoD-plugin.component';
import { AlignmentViewComponent } from './visualizationComponents/AlignmentViewComponent/alignment-view-plugin-component';
import { CrosstabComponent } from './visualizationComponents/CrosstabComponent/crosstab-plugin.component';
import { AggregateComponent } from './visualizationComponents/AggregateComponent/aggregate.component';
import { GanttComponent } from './visualizationComponents/GanttComponent/gantt-plugin.component';
import { HeatmapComponent } from './visualizationComponents/HeatmapComponent/heatmap.component';
import { BubbleComponent } from './visualizationComponents/BubbleComponent/bubble.component';

@Component({
  selector: 'app-golden-layout-host',
  template: '<ng-template #componentViewContainer></ng-template>',
  styles: [`
    :host {
      height: 100%;
      width: 100%;
      padding: 0;
      display: block;
      position: relative;
    }
    `,
  ],
})
export class GoldenLayoutHostComponent implements OnDestroy {
  private _goldenLayout: GoldenLayout;
  private _goldenLayoutElement: HTMLElement;
  private _virtualActive = true;
  private _viewContainerRefActive = true;
  private _componentRefMap = new Map<ComponentContainer, ComponentRef<BaseComponentDirective>>();
  private _goldenLayoutBoundingClientRect: DOMRect = new DOMRect();

  private _goldenLayoutBindComponentEventListener =
    (container: ComponentContainer, itemConfig: ResolvedComponentItemConfig) => this.handleBindComponentEvent(container, itemConfig);
  private _goldenLayoutUnbindComponentEventListener =
    (container: ComponentContainer) => this.handleUnbindComponentEvent(container);

  @ViewChild('componentViewContainer', { read: ViewContainerRef, static: true }) private _componentViewContainerRef: ViewContainerRef;
  
  @Output() TabRemovedEvent = new EventEmitter();

  @Output() TabChangedEvent = new EventEmitter();

  get goldenLayout() { return this._goldenLayout; }
  get virtualActive() { return this._virtualActive; }
  get viewContainerRefActive() { return this._viewContainerRefActive; }
  get isGoldenLayoutSubWindow() { return this._goldenLayout.isSubWindow; }

  constructor(private _appRef: ApplicationRef,
    private _elRef: ElementRef<HTMLElement>,
    private goldenLayoutComponentService: GoldenLayoutComponentService,
  ) {
    this._goldenLayoutElement = this._elRef.nativeElement;

    this.goldenLayoutComponentService.registerComponentType(FilesComponent.componentTypeName, FilesComponent);
    this.goldenLayoutComponentService.registerComponentType(TwoDComponent.componentTypeName, TwoDComponent);
    this.goldenLayoutComponentService.registerComponentType(TableComponent.componentTypeName, TableComponent);
    this.goldenLayoutComponentService.registerComponentType(MapComponent.componentTypeName, MapComponent);
    this.goldenLayoutComponentService.registerComponentType(PhylogeneticComponent.componentTypeName, PhylogeneticComponent);
    this.goldenLayoutComponentService.registerComponentType(TimelineComponent.componentTypeName, TimelineComponent);
    this.goldenLayoutComponentService.registerComponentType(AlignmentViewComponent.componentTypeName, AlignmentViewComponent);
    this.goldenLayoutComponentService.registerComponentType(CrosstabComponent.componentTypeName, CrosstabComponent);
    this.goldenLayoutComponentService.registerComponentType(AggregateComponent.componentTypeName, AggregateComponent);
    this.goldenLayoutComponentService.registerComponentType(GanttComponent.componentTypeName, GanttComponent);
    this.goldenLayoutComponentService.registerComponentType(HeatmapComponent.componentTypeName, HeatmapComponent);
    this.goldenLayoutComponentService.registerComponentType(BubbleComponent.componentTypeName, BubbleComponent);
  }

  ngOnDestroy() {
    this._goldenLayout.destroy();
  }

  initialise() {

    this._goldenLayout = new GoldenLayout(
      this._goldenLayoutElement,
      this._goldenLayoutBindComponentEventListener,
      this._goldenLayoutUnbindComponentEventListener,
    );
    this._goldenLayout.resizeWithContainerAutomatically = true;
    this._goldenLayout.beforeVirtualRectingEvent = (count) => this.handleBeforeVirtualRectingEvent(count);

    if (this._goldenLayout.isSubWindow) {
      this._goldenLayout.checkAddDefaultPopinButton();
    }

    // Add the activeContentItemChanged event listener
    this._goldenLayout.on('activeContentItemChanged', contentItem => {
      this.handleActiveTabChange(contentItem);
    });

    this.setViewContainerRefActive(true);

  }

  setVirtualActive(value: boolean) {
    this._goldenLayout.clear();
    this._virtualActive = value;
    if (!this._virtualActive) {
      this._viewContainerRefActive = false;
    }
  }

  setViewContainerRefActive(value: boolean) {
    this._goldenLayout.clear();
    if (value && !this.virtualActive) {
      throw new Error('ViewContainerRef active only possible if VirtualActive');
    }
    this._viewContainerRefActive = value;
  }

  setSize(width: number, height: number) {
    this._goldenLayout.setSize(width, height)
  }

  getComponentRef(container: ComponentContainer) {
    return this._componentRefMap.get(container);
  }

  public focusComponent(componentId: string) : ComponentContainer {

    const container = Array.from(this._componentRefMap.keys()).find(
      (container) => container.componentType?.toString() === componentId
    ) as ComponentContainer;
  
    if (container) {
      const componentItem = container.parent;
      this._goldenLayout.focusComponent(componentItem);
    }

    return container;

  }

  private handleBindComponentEvent(container: ComponentContainer, itemConfig: ResolvedComponentItemConfig): ComponentContainer.BindableComponent {
    const componentType = itemConfig.componentType;
    const componentRef = this.goldenLayoutComponentService.createComponent(componentType, container);
    const component = componentRef.instance;

    this._componentRefMap.set(container, componentRef);

    if (this._virtualActive) {
      container.virtualRectingRequiredEvent = (container, width, height) => this.handleContainerVirtualRectingRequiredEvent(container, width, height);
      container.virtualVisibilityChangeRequiredEvent = (container, visible) => this.handleContainerVisibilityChangeRequiredEvent(container, visible);
      container.virtualZIndexChangeRequiredEvent = (container, logicalZIndex, defaultZIndex) => this.handleContainerVirtualZIndexChangeRequiredEvent(container, logicalZIndex, defaultZIndex);

      if (this._viewContainerRefActive) {
        this._componentViewContainerRef.insert(componentRef.hostView);
      } else {
        this._appRef.attachView(componentRef.hostView);
        const componentRootElement = component.rootHtmlElement;
        this._goldenLayoutElement.appendChild(componentRootElement);
      }
    } else {
      this._appRef.attachView(componentRef.hostView);
      const domElem = (componentRef.hostView as EmbeddedViewRef<unknown>).rootNodes[0] as HTMLElement;
      container.element.appendChild(domElem);
    }

    return {
      component,
      virtual: this._virtualActive,
    }
  }

  private handleUnbindComponentEvent(container: ComponentContainer) {
    const componentRef = this._componentRefMap.get(container);
    if (componentRef === undefined) {
      throw new Error('Could not unbind component. Container not found');
    }
    this._componentRefMap.delete(container);

    const hostView = componentRef.hostView;

    if (container.virtual) {
      if (this._viewContainerRefActive) {
        const viewRefIndex = this._componentViewContainerRef.indexOf(hostView);
        if (viewRefIndex < 0) {
          throw new Error('Could not unbind component. ViewRef not found');
        }
        this._componentViewContainerRef.remove(viewRefIndex);
      } else {
        const component = componentRef.instance;
        const componentRootElement = component.rootHtmlElement;
        this._goldenLayoutElement.removeChild(componentRootElement);
        this._appRef.detachView(hostView);
      }
    } else {
      const component = componentRef.instance;
      const componentRootElement = component.rootHtmlElement;
      container.element.removeChild(componentRootElement);
      this._appRef.detachView(hostView);
    }

    if (container.componentType !== undefined){
      this.TabRemovedEvent.emit(container.componentType.toString());
    }

    componentRef.destroy();
  }

  private handleBeforeVirtualRectingEvent(count: number) {
    this._goldenLayoutBoundingClientRect = this._goldenLayoutElement.getBoundingClientRect();
  }

  private handleContainerVirtualRectingRequiredEvent(container: ComponentContainer, width: number, height: number) {
    const containerBoundingClientRect = container.element.getBoundingClientRect();
    const left = containerBoundingClientRect.left - this._goldenLayoutBoundingClientRect.left;
    const top = containerBoundingClientRect.top - this._goldenLayoutBoundingClientRect.top;

    const componentRef = this._componentRefMap.get(container);
    if (componentRef === undefined) {
        throw new Error('handleContainerVirtualRectingRequiredEvent: ComponentRef not found');
    }
    const component = componentRef.instance;
    component.setPositionAndSize(left, top, width, height);
  }

  public removeComponent(componentId: string) {
    const container = Array.from(this._componentRefMap.keys()).find(
      (container) => container.componentType?.toString() === componentId
    ) as ComponentContainer;
  
    if (container) {
      const componentItem = container.parent;
      if (componentItem && componentItem.parent) {
        componentItem.parent.removeChild(componentItem);
      }
    } else {
      throw new Error('Component not found for the provided id');
    }
  }

  private handleContainerVisibilityChangeRequiredEvent(container: ComponentContainer, visible: boolean) {
    const componentRef = this._componentRefMap.get(container);
    if (componentRef === undefined) {
        throw new Error('handleContainerVisibilityChangeRequiredEvent: ComponentRef not found');
    }
    const component = componentRef.instance;
    component.setVisibility(visible);
  }

  private handleContainerVirtualZIndexChangeRequiredEvent(container: ComponentContainer, logicalZIndex: LogicalZIndex, defaultZIndex: string) {
    const componentRef = this._componentRefMap.get(container);
    if (componentRef === undefined) {
        throw new Error('handleContainerVirtualZIndexChangeRequiredEvent: ComponentRef not found');
    }
    const component = componentRef.instance;
    component.setZIndex(defaultZIndex);
  }

  private handleActiveTabChange(contentItem: any) {
    this.TabChangedEvent.emit(contentItem._title);
  }
}



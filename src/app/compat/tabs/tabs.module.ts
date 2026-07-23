import {
  AfterContentInit,
  Component,
  ContentChildren,
  forwardRef,
  Host,
  Inject,
  Input,
  NgModule,
  OnDestroy,
  Optional,
  QueryList,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'tab',
  template: `
    <div
      class="tab-pane fade"
      [class.active]="active"
      [class.show]="active"
      [hidden]="!active"
      role="tabpanel">
      <ng-content></ng-content>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class TabComponent {
  @Input() heading = '';
  @Input() customClass = '';
  @Input() disabled = false;

  private activeState = false;

  constructor(
    @Optional()
    @Host()
    @Inject(forwardRef(() => TabsetComponent))
    private readonly tabset: TabsetComponent | null,
  ) {}

  @Input()
  get active(): boolean {
    return this.activeState;
  }

  set active(value: boolean | string) {
    const next = value !== false && value !== 'false';
    this.activeState = next;
    if (next) {
      this.tabset?.activate(this);
    }
  }

  setActiveFromTabset(active: boolean): void {
    this.activeState = active;
  }
}

@Component({
  selector: 'tabset',
  template: `
    <ul class="nav nav-tabs" role="tablist">
      <li
        *ngFor="let tab of tabs"
        class="nav-item"
        [ngClass]="tab.customClass"
        role="presentation">
        <button
          type="button"
          class="nav-link"
          [class.active]="tab.active"
          [disabled]="tab.disabled"
          [attr.aria-selected]="tab.active"
          role="tab"
          (click)="activate(tab)">
          {{ tab.heading }}
        </button>
      </li>
    </ul>
    <div class="tab-content">
      <ng-content></ng-content>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class TabsetComponent implements AfterContentInit, OnDestroy {
  @ContentChildren(TabComponent) private tabQuery!: QueryList<TabComponent>;

  tabs: TabComponent[] = [];
  private tabChanges?: Subscription;

  ngAfterContentInit(): void {
    this.syncTabs();
    this.tabChanges = this.tabQuery.changes.subscribe(() => this.syncTabs());
  }

  ngOnDestroy(): void {
    this.tabChanges?.unsubscribe();
  }

  activate(tab: TabComponent): void {
    if (tab.disabled) {
      return;
    }

    this.tabs.forEach((candidate) => candidate.setActiveFromTabset(candidate === tab));
  }

  private syncTabs(): void {
    this.tabs = this.tabQuery.toArray();
    const selected = this.tabs.find((tab) => tab.active) ?? this.tabs[0];
    if (selected) {
      this.activate(selected);
    }
  }
}

@NgModule({
  imports: [CommonModule],
  declarations: [TabComponent, TabsetComponent],
  exports: [TabComponent, TabsetComponent],
})
export class TabsModule {}

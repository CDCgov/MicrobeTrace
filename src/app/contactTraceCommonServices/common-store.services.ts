import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CommonStoreService {

  // ----------------------------
  // State Subjects
  // ----------------------------

  private _linkThreshold$ = new BehaviorSubject<number>(0.015);
  linkThreshold$ = this._linkThreshold$.asObservable();

  private _networkRendered$ = new BehaviorSubject<boolean>(false);
  networkRendered$ = this._networkRendered$.asObservable();

  private _loadingMessageUpdated$ = new BehaviorSubject<string>('');
  loadingMessageUpdated$ = this._loadingMessageUpdated$.asObservable();

  private _networkUpdated$ = new BehaviorSubject<boolean>(false);
  networkUpdated$ = this._networkUpdated$.asObservable();

  private _settingsLoaded$ = new BehaviorSubject<boolean>(false);
  settingsLoaded$ = this._settingsLoaded$.asObservable();

  private _metricChanged$ = new BehaviorSubject<string>(null);
  metricChanged$ = this._metricChanged$.asObservable();

  private _sessionDestroyed$ = new BehaviorSubject<boolean>(false);
  sessionDestroyed$ = this._sessionDestroyed$.asObservable();

  private _newSession$ = new BehaviorSubject<boolean>(false);
  newSession$ = this._newSession$.asObservable();

  private _styleFileApplied$ = new BehaviorSubject<boolean>(false);
  styleFileApplied$ = this._styleFileApplied$.asObservable();

  private _tableCleared$ = new BehaviorSubject<string>(null);
  tableCleared$ = this._tableCleared$.asObservable();

  private _statisticsChanged$ = new BehaviorSubject<string>(null);
  statisticsChanged$ = this._statisticsChanged$.asObservable();

  private _FP_removeFiles$ = new BehaviorSubject<boolean>(null);
  FP_removeFiles$ = this._FP_removeFiles$.asObservable();

  private currentThresholdStepSize: Number = 0.001;


  constructor() {}

  /**
   * Generic update method that emits a new value only if it differs
   * from the current value.
   */
  private updateValue<T>(subject: BehaviorSubject<T>, newValue: T): void {
    if (subject.value !== newValue) {
      subject.next(newValue);
    }
  }

  // ----------------------------
  // Getters & Setters
  // ----------------------------
  get linkThresholdValue(): number {
    return this._linkThreshold$.value;
  }
  setLinkThreshold(newThreshold: number): void {
    this.updateValue(this._linkThreshold$, newThreshold);
  }

  get networkRenderedValue(): boolean {
    return this._networkRendered$.value;
  }
  setNetworkRendered(isRendered: boolean): void {
    this.updateValue(this._networkRendered$, isRendered);
  }

  get loadingMessageUpdatedValue(): string {
    return this._loadingMessageUpdated$.value;
  }
  setLoadingMessageUpdated(message: string): void {
    this.updateValue(this._loadingMessageUpdated$, message);
  }

  get networkUpdatedValue(): boolean {
    return this._networkUpdated$.value;
  }
  setNetworkUpdated(isUpdated: boolean): void {
    this.updateValue(this._networkUpdated$, isUpdated);
  }

  get settingsLoadedValue(): boolean {
    return this._settingsLoaded$.value;
  }
  setSettingsLoaded(loaded: boolean): void {
    this.updateValue(this._settingsLoaded$, loaded);
  }

  get metricChangedValue(): string {
    return this._metricChanged$.value;
  }
  setMetricChanged(newMetric: string): void {
    this.updateValue(this._metricChanged$, newMetric);
  }

  get sessionDestroyedValue(): boolean {
    return this._sessionDestroyed$.value;
  }
  setSessionDestroyed(value: boolean): void {
    this.updateValue(this._sessionDestroyed$, value);
  }

  get newSessionValue(): boolean {
    return this._newSession$.value;
  }
  setNewSession(value: boolean): void {
    this.updateValue(this._newSession$, value);
  }

  get styleFileAppliedValue(): boolean {
    return this._styleFileApplied$.value;
  }
  setStyleFileApplied(value: boolean): void {
    this.updateValue(this._styleFileApplied$, value);
  }

  get tableClearedValue(): string {
    return this._tableCleared$.value;
  }
  setTableCleared(value: string): void {
    this.updateValue(this._tableCleared$, value);
  }

  get statisticsChangedValue(): string {
    return this._statisticsChanged$.value;
  }
  setStatisticsChanged(value: string): void {
    this.updateValue(this._statisticsChanged$, value);
  }

  get FP_removeFilesValue(): boolean {
    return this._FP_removeFiles$.value;
  }
  setFP_removeFiles(value: boolean): void {
    this.updateValue(this._FP_removeFiles$, value);
  }

  updatecurrentThresholdStepSize(distanceMetric: string) {
    this.currentThresholdStepSize = distanceMetric === 'snps' ? 1 : 0.001
}
  get currentThresholdStepSizeValue(): Number {
    return this.currentThresholdStepSize;
  }

}
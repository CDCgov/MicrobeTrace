export const testIds = {
  appGlobalSettingsButton: 'app-global-settings-button',
  appGlobalSettingsDialog: 'app-global-settings-dialog',
  appViewMenuButton: 'app-view-menu-button',
  appViewMenuTwoD: 'app-view-menu-2d-network',
  appSampleDatasetButton: 'app-sample-dataset-button',
  filesSettingsButton: 'files-settings-button',
  filesSettingsDialog: 'files-settings-dialog',
  filterEpsilon: 'filter-epsilon',
  filterMinimumClusterSize: 'filter-minimum-cluster-size',
  filterRevealEverything: 'filter-reveal-everything',
  twodSettingsButton: 'twod-settings-button',
  twodSettingsDialog: 'twod-settings-dialog',
  twodPinAllButton: 'twod-pin-all-button',
  twodRecalculateLayoutButton: 'twod-recalculate-layout-button',
} as const;

export const byTestId = (value: string): string => `[data-testid="${value}"]`;

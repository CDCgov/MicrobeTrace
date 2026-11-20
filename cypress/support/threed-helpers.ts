/** Exercise the real style pipeline without changing the graph's topology. */
export function applyThreeDInvestigationStyling(win: any): void {
  const common = win.commonService;
  const home = common.visuals.microbeTrace;
  const view = common.visuals.threeD;
  if (!common.session.data.nodeFields.includes('qaCategory')) common.session.data.nodeFields.push('qaCategory');
  common.session.data.nodes.forEach((node: any, index: number) => {
    node.qaCategory = `Group ${index % 6}`;
  });
  common.session.data.links.forEach((link: any, index: number) => {
    link.origin = index % 3 === 0 ? ['Contact tracing', 'Genetic distance'] : [index % 2 ? 'Contact tracing' : 'Genetic distance'];
    link._originAll = [...link.origin];
    link.directed = link.origin.includes('Contact tracing');
    link.bidirectional = link.directed && index % 5 === 0;
    link.hasDistance = link.origin.includes('Genetic distance');
    link.distanceOrigins = link.hasDistance ? ['Genetic distance'] : [];
    if (link.hasDistance) link.distanceOrigin = 'Genetic distance';
    else delete link.distanceOrigin;
  });
  common.session.style.widgets['link-origin-array-order'] = ['Contact tracing', 'Genetic distance'];
  home.SelectedColorNodesByVariable = 'qaCategory';
  home.onColorNodesByChanged();
  home.SelectedColorLinksByVariable = 'origin';
  home.onColorLinksByChanged();
  Object.assign(view.settings, {
    nodeShapeField: 'qaCategory', nodeSizeField: 'degree', nodeSizeMin: 2, nodeSizeMax: 6,
    nodeBorderWidth: 1.25, nodeLabelField: '_id', nodeLabelSize: 10,
    linkWidthField: 'distance', linkWidthMin: 0.6, linkWidthMax: 2,
    linkLabelField: 'distance', linkLabelSize: 9,
    linkArrows: true, linkBidirectional: true, linkTransparency: 0.35, linkOpacityOverride: true,
  });
  view.changeSettings();
}

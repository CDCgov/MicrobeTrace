/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goToTableView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import {
  assertFirstVisibleRowValue,
  assertTableRowValueByMatch,
  assertTableVisibleRowCount,
  clearTableFilterValue,
  selectTableDataset,
  setTableFilterValue,
  setTableRowsPerPage,
} from '../../../support/table-helpers';

type WinWithMT = Window & {
  commonService: any;
  cytoscapeInstance?: any;
};

const getNodeId = (node: any): string => String(node?._id ?? node?.id ?? '');

describe('Journey Flow - Table uploaded refresh and sync', () => {
  const mapColorProfile = getProfile('map-color-by-uploaded');
  const thresholdProfile = getProfile('nn-angulartesting-tn93-edgelist');

  it('reorders node rows after a node is selected outside Table in 2D', () => {
    const selectedNodeId = 'D';

    launchProfileToTwoD(mapColorProfile);
    assertAfterLaunchCounts(mapColorProfile);

    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      win.cytoscapeInstance.getElementById(selectedNodeId).select();
    });

    cy.window().should((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const sessionNode = win.commonService.session.data.nodes
        .find((node: any) => getNodeId(node) === selectedNodeId);

      expect(sessionNode?.selected, `session node ${selectedNodeId} selected from 2D`).to.equal(true);
    });

    goToTableView();
    assertFirstVisibleRowValue('Id', selectedNodeId);
    cy.window()
      .its('commonService.visuals.tableComp.SelectedTableData.dataSelection')
      .should('have.length', 1);
  });

  it('keeps rows-per-page All coherent through filtering and dataset switches', () => {
    launchProfileToTwoD(thresholdProfile);
    assertAfterLaunchCounts(thresholdProfile);
    goToTableView();

    assertTableVisibleRowCount(10);
    setTableRowsPerPage('All');

    cy.window()
      .its('commonService.session.data.nodes')
      .then((nodes: any[]) => {
        assertTableVisibleRowCount(nodes.length);
        cy.wrap(getNodeId(nodes[0]), { log: false }).as('tableAllFilterNodeId');
      });

    cy.get<string>('@tableAllFilterNodeId').then((nodeId) => {
      setTableFilterValue('Id', nodeId);
      assertTableVisibleRowCount(1);
      cy.window()
        .its('commonService.visuals.tableComp.selectedRows')
        .should('equal', 1);

      clearTableFilterValue('Id');
    });

    cy.window()
      .its('commonService.session.data.nodes')
      .then((nodes: any[]) => {
        assertTableVisibleRowCount(nodes.length);
        cy.window()
          .its('commonService.visuals.tableComp.selectedRows')
          .should('equal', nodes.length);
      });

    selectTableDataset('Link');
    cy.window()
      .its('commonService.session.data.links')
      .then((links: any[]) => {
        assertTableVisibleRowCount(links.length);
        cy.window()
          .its('commonService.visuals.tableComp.selectedRows')
          .should('equal', links.length);
      });

    selectTableDataset('Node');
    cy.window()
      .its('commonService.session.data.nodes')
      .then((nodes: any[]) => {
        assertTableVisibleRowCount(nodes.length);
      });
  });

  it('refreshes the open Table when threshold filtering changes visible node degree outside the view', () => {
    launchProfileToTwoD(thresholdProfile);
    assertAfterLaunchCounts(thresholdProfile);
    goToTableView();
    setTableRowsPerPage('All');

    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const visibleNodes = win.commonService.getVisibleNodes();
      const visibleLinks = (win.commonService.session.data.links || []).filter((link: any) => link.visible);
      const nextThreshold = 0.0144;
      const nextVisibleLinkIds = new Set(
        visibleLinks
          .filter((link: any) => Number(link.distance) <= nextThreshold)
          .map((link: any) => String(link.id || [link.source, link.target].sort().join('-'))),
      );

      const selectedNode = visibleNodes.find((node: any) => {
        const nodeId = getNodeId(node);
        const currentLinks = visibleLinks.filter(
          (link: any) => link.source === nodeId || link.target === nodeId,
        );
        const nextLinks = currentLinks.filter((link: any) =>
          nextVisibleLinkIds.has(String(link.id || [link.source, link.target].sort().join('-'))),
        );

        return currentLinks.length > nextLinks.length && nextLinks.length > 0;
      });

      expect(selectedNode, 'node whose visible degree shrinks at threshold 0.0144').to.exist;

      const nodeId = getNodeId(selectedNode);
      const currentDegree = visibleLinks.filter(
        (link: any) => link.source === nodeId || link.target === nodeId,
      ).length;
      const nextDegree = visibleLinks.filter((link: any) => (
        (link.source === nodeId || link.target === nodeId) &&
        nextVisibleLinkIds.has(String(link.id || [link.source, link.target].sort().join('-')))
      )).length;

      cy.wrap({
        nodeId,
        currentDegree,
        nextDegree,
      }, { log: false }).as('tableThresholdRefreshCase');
    });

    cy.get<{ nodeId: string; currentDegree: number; nextDegree: number }>('@tableThresholdRefreshCase')
      .then((refreshCase) => {
        assertTableRowValueByMatch('Id', refreshCase.nodeId, 'Degree', String(refreshCase.currentDegree));

        openGlobalFilteringTab();
        setGlobalLinkThreshold(0.0144);
        cy.closeGlobalSettings();
        waitForProcessingDialogToClear();

        assertMetricCount('#numberOfNodes', 14);
        assertMetricCount('#numberOfVisibleLinks', 16);
        assertMetricCount('#numberOfDisjointComponents', 2);
        assertMetricCount('#numberOfSingletonNodes', 2);

        assertTableRowValueByMatch('Id', refreshCase.nodeId, 'Degree', String(refreshCase.nextDegree));
      });
  });
});

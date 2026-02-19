/// <reference types="cypress" />

/**
 * High-value integration tests for MicrobeTrace Next (TS)
 * Uses Angular-exposed window.commonService to assert internal state.
 */

const FIXTURE_CSV = 'AngularTesting_Distance_linklist_small.csv';

type Selectors = {
  eula_modal: string;
  eula_accept_btn: string;
  eula_reject_btn: string;

  search_field: string;
  link_sort_variable: string;
  node_color_variable: string;
  default_distance_metric: string;
  link_color_variable: string;

  link_threshold_input: string;
  link_threshold_histogram: string;

  stats_nodes: string;
  stats_links: string;
  stats_singletons: string;
  stats_components: string;

  files_tab: string;
  file_input: string;
  global_settings_btn: string;

  link_color_table_modal: string;
  node_color_table_modal: string;
};

const sel: Selectors = {
  eula_modal: '#eula-modal',
  eula_accept_btn: '#eula-accept',
  eula_reject_btn: '#eula-reject',

  search_field: '#search-field',
  link_sort_variable: '#link-sort-variable',
  node_color_variable: '#node-color-variable',
  default_distance_metric: '#default-distance-metric',
  link_color_variable: '#link-color-variable',

  link_threshold_input: '#link-threshold',
  link_threshold_histogram: '#linkThresholdSparkline, #link-threshold-sparkline, #link-threshold-histogram',

  stats_nodes: '#numberOfNodes',
  stats_links: '#numberOfVisibleLinks',
  stats_singletons: '#numberOfSingletonNodes',
  stats_components: '#numberOfDisjointComponents',

  files_tab: '#FilesTab, [data-test=files-tab]',
  file_input: 'input[type=file]',
  global_settings_btn: '#SettingsTab, [data-test=open-global-settings]',

  link_color_table_modal: '#global-settings-link-color-table',
  node_color_table_modal: '#global-settings-node-color-table'
};

function parse_int_text(el: JQuery<HTMLElement>): number {
  return parseInt(el.text().replace(/,/g, ''), 10);
}

describe('microbetrace core flows (ts)', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get_common_service();
  });

  it('eula appears once and persists acceptance', () => {
    cy.get(sel.eula_modal, { timeout: 10000 }).should('be.visible');
    cy.get(sel.eula_accept_btn).click();
    cy.get(sel.eula_modal).should('not.exist');

    cy.reload();
    cy.get(sel.eula_modal).should('not.exist');
  });

  it('load csv and compute network stats', () => {
    cy.get(sel.files_tab).click({ force: true });
    cy.attach_file(sel.file_input, FIXTURE_CSV, 'text/csv');

    cy.get(sel.stats_nodes, { timeout: 30000 }).should($n => {
      const v = parse_int_text($n);
      expect(v).to.be.greaterThan(0);
    });
    cy.get(sel.stats_links).should($n => {
      const v = parse_int_text($n);
      expect(v).to.be.greaterThan(0);
    });

    cy.get_common_service().then((cs: any) => {
      expect(cs.session.data.nodes.length).to.be.greaterThan(0);
      expect(cs.session.data.links.length).to.be.greaterThan(0);
      expect(cs.session.network.isFullyLoaded).to.equal(true);
    });
  });

  it('threshold filtering changes link counts and updates widget', () => {
    cy.get(sel.files_tab).click({ force: true });
    cy.attach_file(sel.file_input, FIXTURE_CSV, 'text/csv');

    let initial_links = 0;
    cy.get(sel.stats_links, { timeout: 30000 }).then($n => {
      initial_links = parse_int_text($n);
      expect(initial_links).to.be.greaterThan(0);
    });

    cy.get('body').then($b => {
      if ($b.find(sel.link_threshold_input).length) {
        cy.get(sel.link_threshold_input).clear().type('0.030').blur();
      } else {
        cy.click_histogram_at(sel.link_threshold_histogram, 0.75);
      }
    });

    cy.get(sel.stats_links, { timeout: 10000 }).should($n => {
      const after = parse_int_text($n);
      expect(after).to.be.a('number');
    });

    cy.get_common_service().then((cs: any) => {
      const thr = cs.session.style.widgets['link-threshold'];
      expect(thr).to.be.a('number');
      expect(thr).to.be.greaterThan(0);
    });
  });

  it('switch distance metric tn93 ↔ snps and keeps threshold coherent', () => {
    cy.get(sel.default_distance_metric).should('be.visible');

    cy.get(sel.default_distance_metric).select('snps');
    cy.get_common_service().then((cs: any) => {
      expect(cs.session.style.widgets['default-distance-metric']).to.equal('snps');
      expect(cs.session.style.widgets['link-threshold']).to.be.a('number');
    });

    cy.get(sel.default_distance_metric).select('tn93');
    cy.get_common_service().then((cs: any) => {
      expect(cs.session.style.widgets['default-distance-metric']).to.equal('tn93');
      expect(cs.session.style.widgets['link-threshold']).to.be.a('number');
    });
  });
});

describe('microbetrace color tables (ts)', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get_common_service();
    cy.get(sel.files_tab).click({ force: true });
    cy.attach_file(sel.file_input, FIXTURE_CSV, 'text/csv');
    cy.get(sel.stats_nodes, { timeout: 30000 }).should('be.visible');
  });

  it('link color table populates when variable is origin', () => {
    cy.get(sel.link_color_variable).select('origin', { force: true });
    cy.get(sel.global_settings_btn).click({ force: true });

    cy.get(sel.link_color_table_modal).should('exist');
    cy.get(sel.link_color_table_modal).find('table tr').its('length').should('be.greaterThan', 0);
  });

  it('node color table populates when variable is _id', () => {
    cy.get(sel.node_color_variable).select('_id', { force: true });
    cy.get(sel.global_settings_btn).click({ force: true });

    cy.get(sel.node_color_table_modal).should('exist');
    cy.get(sel.node_color_table_modal).find('table tr').its('length').should('be.greaterThan', 0);
  });
});

describe('microbetrace color tables (ts)', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.waitForNetworkToRender(); // Wait for the default network
  });

  it('shows Link Color table when variable=origin and table visibility=Show', () => {
    cy.get('#link-color-variable').select('origin');
    cy.get('#LinkColorTableTypes').select('Show');
    cy.get('#link-color-table').should('exist').and('be.visible');
    cy.get('#link-color-table').find('tr').its('length').should('be.greaterThan', 1);
  });

  it('shows Node Color table when variable is selected and table visibility=Show', () => {
    cy.get('#node-color-variable').select('cluster'); // Use 'cluster' or another default field
    cy.get('#NodeColorTableTypes').select('Show');
    cy.get('#node-color-table').should('exist').and('be.visible');
    cy.get('#node-color-table').find('tr').its('length').should('be.greaterThan', 1);
  });
});

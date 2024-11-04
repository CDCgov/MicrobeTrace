# MicrobeTrace Testing Plan

## Table of Contents
1. [Introduction](#introduction)
2. [Objectives](#objectives)
3. [Scope](#scope)
4. [Testing Strategies](#testing-strategies)
   - [1. Unit Testing with Jasmine/Karma](#1-unit-testing-with-jasminekarma)
   - [2. Integration Testing with Jasmine/Karma](#2-integration-testing-with-jasminekarma)
   - [3. End-to-End (E2E) Testing with Selenium](#3-end-to-end-e2e-testing-with-selenium)
   - [4. Visual Regression Testing](#4-visual-regression-testing)
5. [Tools and Technologies](#tools-and-technologies)
6. [Test Coverage Goals](#test-coverage-goals)
7. [Test Cases and Scenarios](#test-cases-and-scenarios)
8. [Roles and Responsibilities](#roles-and-responsibilities)
9. [Timeline](#timeline)
10. [Continuous Integration/Continuous Deployment (CI/CD) Integration](#continuous-integrationcontinuous-deployment-ci-cd-integration)
11. [Reporting and Metrics](#reporting-and-metrics)
12. [Maintenance and Updates](#maintenance-and-updates)
13. [Conclusion](#conclusion)

---

## Introduction

This Testing Plan outlines a comprehensive approach to ensure the quality, reliability, and performance of the **MicrobeTrace** client-side application. Given the application's complexity, which includes dynamic visualizations, user interactions, and extensive data handling, a multi-faceted testing strategy is essential to deliver a robust and user-friendly experience.

## Objectives

- **Ensure Functional Accuracy:** Validate that all features operate as intended.
- **Maintain Visual Integrity:** Ensure visualizations render correctly across various scenarios and configurations.
- **Enhance User Experience:** Confirm that user interactions are smooth, intuitive, and free of defects.
- **Facilitate Continuous Improvement:** Integrate testing seamlessly into the development lifecycle for ongoing quality assurance.

## Scope

The testing plan covers the following aspects of MicrobeTrace:

- **Unit Testing:** Testing individual components and services.
- **Integration Testing:** Ensuring different parts of the application work together seamlessly.
- **End-to-End (E2E) Testing:** Simulating real user interactions to validate complete workflows.
- **Visual Regression Testing:** Ensuring the visual aspects of the application remain consistent over time.

## Testing Strategies

### 1. Unit Testing with Jasmine/Karma

**Purpose:** Validate the functionality of individual components, services, and utilities in isolation.

**Approach:**

- **Component Testing:**
  - Test Angular components (e.g., `TwoDComponent`, `FilesComponent`) to ensure they render correctly based on inputs.
  - Verify component lifecycle hooks (`OnInit`, `OnDestroy`) function as expected.
  
- **Service Testing:**
  - Test services like `CommonService` to ensure methods handle data processing accurately.
  - Mock dependencies to isolate service functionality.

- **Utility Functions:**
  - Test utility functions (e.g., `convertName`, `delayFunction`) for correct outputs given various inputs.

**Examples:**
  - Verify that `FilesComponent` correctly processes different file types (JSON, CSV, XLSX).
  - Ensure `CommonService` accurately updates session states when thresholds change.

**Components**
- Microbetraceplugin - Wrapper component for app + golden layout + holds timeline player
- Files - Adding/updating files
- 2D 
- Timeline (Epi Curve)
- Aggregate 
- Alignment
- Bubble
- Crosstab
- Gantt
- Heatmap
- Map
- Phylogenetic
- Table

**Services**
- Common - shared service that's accessed by all components that retrieves, stores, and manipulates session data

### 2. Integration Testing with Jasmine/Karma

**Purpose:** Ensure that different modules and components interact correctly.

**Approach:**

- **Component-Module Interaction:**
  - Test interactions between `FilesComponent` and `CommonService`.
  
- **Service Dependencies:**
  - Validate that `CommonService` correctly collaborates with other services and components, such as updating visualization states based on user inputs.

- **Data Flow:**
  - Ensure data flows seamlessly between components, services, and utilities without loss or corruption.

**Examples:**
- Test that uploading a file through `FilesComponent` correctly invokes `CommonService` methods and updates the visualization.
- Verify that changing a distance threshold in the settings appropriately updates the network visualization.

### 3. End-to-End (E2E) Testing with Selenium

**Purpose:** Simulate real user interactions to validate complete workflows and ensure the application behaves as expected from the user's perspective.

**Approach:**

- **User Workflow Simulation:**
  - Automate user actions such as uploading files, adjusting settings, and interacting with visualizations.
  
- **Visual Verification:**
  - Although Selenium doesn’t inherently support visual comparisons, integrate it with visual regression tools to ensure visual elements render correctly after interactions.

**Examples:**
- Automate the process of loading different file types and verify that the corresponding visualizations update accordingly.
- Simulate user interactions like setting distance thresholds and ensure the network visualization reflects these changes accurately.

### 4. Visual Regression Testing

**Purpose:** Ensure the visual aspects of the application remain consistent over time and that UI changes do not introduce unintended visual defects.

**Approach:**

- **Baseline Image Capture:**
  - Capture screenshots of various application states representing different user interactions and configurations.

- **Comparison and Detection:**
  - Compare current screenshots against baseline images to detect visual discrepancies.

- **Integration with E2E Tests:**
  - Trigger visual regression tests as part of the E2E testing workflow to automate visual verification.

**Tools:**
- **BackstopJS:** An open-source tool for visual regression testing.
- **Applitools Eyes:** An AI-powered visual testing tool offering advanced features.
- **Resemble.js:** A JavaScript library for image comparison.

**Examples:**
- After setting a specific distance threshold, capture the updated network visualization and compare it against the expected baseline.
- Verify that loading a new dataset results in the correct visual representation without unintended UI changes.

## Tools and Technologies

- **Unit and Integration Testing:**
  - **Jasmine:** A behavior-driven development framework for testing JavaScript code.
  - **Karma:** A test runner that allows executing tests in real browsers.
  
- **End-to-End Testing:**
  - **Selenium WebDriver:** Automates browser interactions for testing.
  - **WebDriverIO:** A modern testing framework built on top of Selenium WebDriver.
  
- **Visual Regression Testing:**
  - **BackstopJS:** For capturing and comparing screenshots.
  - **Applitools Eyes:** For AI-powered visual testing and smart comparisons.
  - **Resemble.js:** For custom image comparisons within test scripts.
  
- **Build and CI/CD Integration:**
  - **Jenkins/GitHub Actions/GitLab CI:** For orchestrating automated test executions.
  
## Test Coverage Goals

- **Unit Tests:**
  - Achieve at least 80% code coverage for all critical components and services.
  
- **Integration Tests:**
  - Ensure all major interactions between components and services are tested.
  
- **E2E Tests:**
  - Cover primary user workflows and edge cases, ensuring the application functions correctly under various scenarios.
  
- **Visual Regression:**
  - Establish baseline images for all critical UI states and ensure new changes do not introduce visual defects.

## Test Cases and Scenarios

### Unit Testing Scenarios

- **FilesComponent:**
  - Test file upload functionality for different file types (JSON, CSV, XLSX).
  - Verify correct parsing and processing of uploaded data.
  
- **CommonService:**
  - Test methods for adding nodes and links.
  - Validate state management when updating visualization settings.
  
- **Utility Functions:**
  - Ensure `convertName` accurately maps view identifiers to user-friendly names.
  - Verify `delayFunction` correctly invokes callbacks after specified delays.

### Integration Testing Scenarios

- **Component-Service Interaction:**
  - Test that `FilesComponent` correctly invokes `CommonService` methods upon file upload.
  
- **Data Flow:**
  - Ensure that changes in `CommonService` state are accurately reflected in `TwoDComponent` visualizations.
  
- **Combined Functionality:**
  - Test the entire flow from file upload to visualization rendering.

### End-to-End Testing Scenarios

- **File Upload and Visualization:**
  - Automate uploading a JSON file and verify that the network visualization updates correctly.
  
- **Settings Adjustment:**
  - Simulate adjusting distance thresholds and verify visual updates.
  
- **User Interaction:**
  - Automate user interactions such as clicking, dragging, and setting parameters to ensure the UI responds as expected.

### Visual Regression Testing Scenarios

- **Initial Load:**
  - Capture and verify the default state of the application upon initial load.
  
- **After File Upload:**
  - Capture and verify the visualization state after uploading different file types.
  
- **After Settings Change:**
  - Capture and verify the visualization after adjusting various settings like distance thresholds and label orientations.

## Roles and Responsibilities

| **Role**                 | **Responsibilities**                                                                  |
|--------------------------|---------------------------------------------------------------------------------------|
| **QA Engineers**         | Develop and execute unit, integration, E2E, and visual regression tests. |
| **Developers**           | Write and maintain unit and integration tests. Fix issues identified during testing. Collaborate with QA for test case development. |


## Timeline

| **Milestone**                        | **Description**                           | **Duration** | **Responsible**            |
|--------------------------------------|-------------------------------------------|--------------|----------------------------|
| **Develop Unit Tests**               | Write tests for components and services.  | 1 Week      | QA Engineers, Developers   |
| **Develop Integration Tests**        | Test interactions between modules.        | 2 Weeks      | QA Engineers, Developers   |
| **Develop E2E Tests**                | Automate user workflows with Selenium.    | 2 Weeks      | QA Engineers               |
| **Develop Visual Regression Tests**  | Setup visual testing with BackstopJS.     | 2 Weeks      | QA Engineers               |
| ** Optional CI/CD Integration**                | Integrate tests into CI/CD pipelines.     | 2 Weeks      | DevOps, QA Engineers       |

*Total Estimated Duration: 7 Weeks w/o CI/CD integration*

## Continuous Integration/Continuous Deployment (CI/CD) Integration

- **Automated Test Execution:**
  - Integrate unit, integration, E2E, and visual regression tests into the CI pipeline.
  - Ensure tests are triggered on every code commit and pull request.
  
- **Reporting:**
  - Generate and publish test reports automatically.
  - Notify the team of test failures via preferred communication channels (e.g., Slack, Email).
  
- **Pipeline Configuration:**
  - Use tools like Jenkins, GitHub Actions, or GitLab CI to orchestrate the testing workflows.
  - Parallelize test executions where possible to reduce feedback time.

## Reporting and Metrics

- **Test Coverage Reports:**
  - Generate reports to visualize code coverage metrics, aiming for high coverage in critical areas.
  
- **Test Execution Reports:**
  - Document test run results, including pass/fail status, execution time, and error logs.
  
- **Visual Regression Reports:**
  - Highlight visual discrepancies with side-by-side image comparisons and percentage differences.
  
- **Defect Tracking:**
  - Log and track bugs detected during testing using tools like Jira or GitHub Issues.
  - Prioritize and assign defects for resolution.

## Maintenance and Updates

- **Regular Test Suite Reviews:**
  - Periodically review and update test cases to align with application changes.
  
- **Baseline Image Updates:**
  - Update visual regression baselines when intentional UI changes are made.
  
- **Dependency Management:**
  - Keep testing tools and libraries up-to-date to leverage new features and security patches.
  
- **Documentation:**
  - Maintain comprehensive documentation of test cases, environments, and procedures for onboarding and reference.

## Conclusion

Implementing this comprehensive testing plan will ensure that **MicrobeTrace** delivers a robust, reliable, and visually consistent experience to its users. By leveraging a combination of unit, integration, E2E, and visual regression testing, the team can proactively identify and address issues, maintain high-quality standards, and facilitate continuous improvement throughout the application's lifecycle.

---

**Appendix**

- **References:**
  - [Jasmine Documentation](https://jasmine.github.io/)
  - [Karma Documentation](https://karma-runner.github.io/)
  - [Selenium Documentation](https://www.selenium.dev/documentation/)
  - [BackstopJS Documentation](https://github.com/garris/BackstopJS)
  - [Applitools Eyes Documentation](https://applitools.com/docs/)
  - [WebDriverIO Documentation](https://webdriver.io/docs/gettingstarted.html)
  - [Cypress Documentation](https://www.cypress.io/)
  - [Resemble.js GitHub](https://github.com/rsmbl/Resemble.js/)
  - [Storybook Documentation](https://storybook.js.org/)

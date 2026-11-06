# 3D Network

Open **View > 3D Network** to explore the same visible network in three dimensions. The pane can be docked beside 2D Network and other views.

## Navigation and selection

- Drag to rotate freely using Classic-style trackball navigation, right-drag to pan, and scroll to zoom.
- Click a node to select it. Shift-, Ctrl-, or Command-click toggles additional nodes. Click the background or press Escape to clear selection.
- **Fit Network** frames the visible nodes. **Reset Camera** also restores the default viewing direction.
- The lower-right **orientation compass** shows the world X (red), Y (green), and Z (blue) axes as you orbit or roll the camera, including during playback. Dashed arrows point away from you. An end-on axis appears as a dot toward you or a ring away from you.
- **Play camera rotation** turns the camera around its current target once every 30 seconds. Click **Pause camera rotation** to hold the current angle. Dragging the view, fitting/resetting the camera, recalculating the layout, or hiding/closing the pane stops playback. Rotation works with a frozen layout, and zoom buttons adjust the distance while it plays. Saved sessions retain the camera angle and reopen with playback paused.
- **Freeze Layout** holds node positions while camera navigation remains available. **Resume Layout** restarts the forces. **Recalculate Layout** creates a fresh arrangement.
- Focus the network and use `+` / `-` to zoom or `F` to fit. Table and 2D Network remain available for accessible inspection of individual records.

## Settings and filtering

The settings dialog controls node shapes, node size, sizing by a numeric field, node/link tooltips, link width, and link transparency. Under **Nodes > Shapes and Sizes**, choose a uniform **Shape**, or choose a **Shape By** field to assign shapes by category. Available shapes are sphere, cube, cone, cylinder, diamond (octahedron), and square pyramid. The category key lets you edit each assignment; shapes repeat beyond six categories. Assignments are saved per field and stay stable while filtering. These controls use independent 3D settings and do not change 2D shape assignments.

Shapes share a common enclosing radius, and **Size By** scales their volume. Geometries and materials are reused between nodes and released when the view closes. Colors and background follow global settings; selected nodes use the shared selection color. Threshold, nearest-neighbor, cluster, subset, and timeline filters use the existing shared network rules. Only links with two visible endpoints are rendered.

The Classic `3DNet-*` widget names are retained for imported styles and sessions. Legacy layout names `3d_network` and `3dnetwork` restore the new pane. Older sessions without 3D camera state receive a new layout.

## Saving and images

Session files and local session links store a versioned `session.meta.threeDViewState` record with camera position, camera target, camera up direction (roll), node positions by ID, and the frozen-layout setting. Older saved camera states use the upright default. These positions are independent of shared node coordinates and the 2D renderer. Positions survive filtering and pane closure. Saved positions are restored without rearranging the network; topology changes can resume layout when it is not frozen. **Reset Camera** restores an upright view.

**Export** produces a PNG from the current camera view, optionally with node/link color keys. Dashboard export preserves the 3D WebGL frame. Image scaling changes output dimensions; it does not add geometric detail beyond the rendered canvas.

## Implementation and lifecycle

`ThreeDComponent` integrates with the shared view lifecycle. `ThreeDNetworkRenderer` owns the lazy-loaded, pinned `3d-force-graph`/Three.js renderer, copied graph records, physics coordinates, and graphics resources. Tooltips are created as text nodes. Rapid events are coalesced into one update per animation frame. Hidden panes and background documents pause animation and simulation; showing a pane reconciles shared state. Closing it removes listeners, disposes the renderer, and releases its WebGL context. WebGL failures offer Retry and Open 2D Network.

3D is registered as its own component and does not inherit from or call `TwoDComponent`. Its appearance controls write only `3DNet-*` settings; 2D node labels, tooltips, sizing, and link appearance retain their existing keys. Its camera and coordinates live in `threeDViewState`, separately from 2D's `rendererViewState`. Shared data, colors, filtering, and selection remain intentional application-wide behavior. Unit tests check both directions of appearance-setting isolation.

Node dragging/pinning, imported custom shape models, persistent labels, cluster surfaces, and video export are follow-up work. The default view renders all visible links. See the measured graph-size recommendations below.

## Validation

- Focused unit tests: `src/app/visualizationComponents/ThreeDComponent/three-d-network.model.spec.ts`.
- Prepared Cypress coverage: `cypress/e2e/view-state/threed-view.cy.ts`, including shared selection while 2D is hidden, filtering, coordinate isolation, camera restoration, and PNG export.
- Follow repository guidance before running Cypress. Cypress is not run automatically as part of implementing the view.

### Recommended graph sizes

The [October 29 capacity benchmark](../performance/3d-network-capacity.md) replaces the preliminary pre-trackball measurements with five runs of eleven graph sizes. On the tested Chrome / Intel Arc setup, start with about **750 visible nodes and 1,500 visible links** for smooth navigation while layout is running. **1,000 / 2,000** is an upper everyday tier with less consistent layout responsiveness. After layout stops, freezing permits smooth inspection at **2,000 / 4,000**. At **5,000 / 10,000**, rotation averaged about 25 fps frozen and 5 fps during layout, so that size is not recommended for fluid navigation with the current renderer.

These are recommendations for the measured hardware, viewport, graph structures, and default styling, not hard limits. Use shared subset filters to inspect a smaller visible graph. No nodes or links are silently sampled away. The linked report includes the measurements, limitations, and opt-in Cypress benchmark commands.

The implementation was also checked in Chrome for real canvas selection, camera navigation, settings, subset and timeline filtering, pane/session restoration, Classic session launch and settings, selection synchronization with both 2D renderers, PNG and dashboard capture, and recovery from context loss. Closing a pane released its graphics context. The production build and 21 focused model/Sigma adapter unit tests passed.

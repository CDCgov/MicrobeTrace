# 3D Network

Open **View > 3D Network** to explore the same visible network in three dimensions. The pane can be docked beside 2D Network and other views.

## Navigation and selection

- The toolbar's **Rotate / Pan** toggle chooses how dragging navigates the camera, using the same icon-and-text button style as Heatmap's **Zoom / Pan** control. **Rotate** is the default and uses Classic-style trackball navigation. Choose **Pan** to move the network with a left drag. Right-drag pans and scrolling zooms in either mode. The footer describes the active mode.
- Click a node to select it. Shift-, Ctrl-, or Command-click toggles additional nodes. Click the background or press Escape to clear selection.
- **Fit Network** frames the visible nodes. **Reset Camera** also restores the default viewing direction.
- The lower-right **orientation compass** shows the world X (red), Y (green), and Z (blue) axes as you orbit or roll the camera, including during playback. Dashed arrows point away from you. An end-on axis appears as a dot toward you or a ring away from you.
- **Play camera rotation** turns the camera around its current target once every 30 seconds. Click **Pause camera rotation** to hold the current angle. Dragging the view, switching navigation modes, fitting/resetting the camera, recalculating the layout, or hiding/closing the pane stops playback. Rotation works with a frozen layout. Saved sessions retain the camera angle and reopen with playback paused.
- **Freeze Layout** holds node positions while camera navigation remains available. **Resume Layout** restarts the forces. **Recalculate Layout** creates a fresh arrangement.
- Focus the network and use `+` / `-` to zoom or `F` to fit. Separate zoom-in and zoom-out toolbar buttons are omitted, matching Heatmap's use of direct zoom gestures. Table and 2D Network remain available for accessible inspection of individual records.

## Settings and filtering

The settings dialog follows the 2D Network dialog's sizing, tabs, section names, and control layout. **Show Colors** keeps it open and places Global Settings alongside it. Node and link tooltips accept multiple fields. Nodes support labels, label size/orientation, borders, uniform size, and bounded **Size By** mapping. Links support labels and decimal formatting, uniform width or bounded **Width By** mapping (including reciprocal scaling), layout length, and arrows. Length is disabled while the layout is frozen. **Network > Display** controls neighbor highlighting.

Under **Nodes > Shapes and Sizes > Show Shapes**, choose a uniform shape or **Shape By** field. Available shapes are sphere, cube, cone, cylinder, diamond (octahedron), and square pyramid; assignments repeat beyond six categories. The separate **3D Node Shapes** legend uses the shared table presentation, with shape previews, sorting, editable names/headings, count/frequency switches, collapse/expand, and **Show / Dock / Hide** modes. Counts and frequencies describe the visible graph. Assignments are saved per field and stay stable while filtering. The 2D shape table is identified as **2D Shapes**; editing either view's shapes leaves the other view unchanged.

**Show Shapes** respects the legend's saved docked or floating mode. A new legend, or reopening a hidden legend, follows the other shape/key tables' display mode, defaulting to docked. **Border Width** controls the thickness in screen pixels of the shape's frame edges, including edges between visible faces. It does not enlarge an outer silhouette. Set it to zero to hide the frame. Frame lines follow the shape through orbiting, sizing, filtering, and export, and retain category transparency and neighbor dimming.

Shapes share a common enclosing radius. **Size By** maps numeric values between Min Size and Max Size, rather than allowing outliers to grow without bounds. Geometries, label textures, and materials are reused and released when no longer needed or when the view closes. Colors, per-category transparency, and background follow global settings; selected nodes use the shared selection color. Moving the link **Transparency** slider right makes links more transparent, while saved `3DNet-link-transparency` values retain their old meaning so older sessions keep their appearance. **Use legend transparency** removes the local link-opacity override. Threshold, nearest-neighbor, cluster, subset, and timeline filters use the existing shared network rules. Only links with two visible endpoints are rendered.

When **Color Links By** is **Origin**, dual-origin links show the first origin as a solid stroke and the second as dashed bands, matching the two origins in the Duo-Link legend and the 2D view. Each origin keeps its own color and legend transparency; the local link Transparency override applies to both. The bands follow the link in 3D during layout and camera navigation, support mapped widths and neighbor highlighting, and appear in exported images. Choosing another color field restores ordinary solid links.

Distance labels and tooltips follow the global metric and TN93 display format: percentages for TN93 percentage display and whole numbers for SNP counts. Label precision remains independent of 2D. Distance labels are omitted when the distance is unavailable or its origin is filtered out; zero TN93 labels are suppressed, while zero SNP counts remain visible.

**Links > Shapes and Sizes > Arrows** reveals arrowheads only for records marked as directed. **Bidirectional** adds a reverse arrowhead only for directed records also marked as bidirectional. Both switches are independent of the 2D settings and are saved as `3DNet-link-directed` and `3DNet-link-bidirectional`. Arrowheads have a contrasting outline and scale with link thickness so they extend beyond opaque links. They follow layout changes and neighbor highlighting and appear in image exports; they do not add links or forces to the graph.

Grouping surfaces, collapsed aggregate nodes, geographic/cluster layouts, and mixed-color node rings remain 2D features. The 3D view continues to use solid node colors and a force-directed layout.

The Classic `3DNet-*` widget names are retained for imported styles and sessions. Legacy layout names `3d_network` and `3dnetwork` restore the new pane. Older sessions without 3D camera state receive a new layout.

## Saving and images

Session files and local session links store a versioned `session.meta.threeDViewState` record with camera position, camera target, camera up direction (roll), node positions by ID, and the frozen-layout setting. Older saved camera states use the upright default. These positions are independent of shared node coordinates and the 2D renderer. Positions survive filtering and pane closure. Saved positions are restored without rearranging the network; topology changes can resume layout when it is not frozen. **Reset Camera** restores an upright view.

**Export** produces PNG, JPEG, or WebP from the current camera view, optionally with node/link color keys and the independent 3D shape legend (including previews and display names). The dialog identifies the visible graph's node/link counts. Dashboard export preserves the 3D WebGL frame. Image scaling changes output dimensions; it does not add geometric detail beyond the rendered canvas.

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

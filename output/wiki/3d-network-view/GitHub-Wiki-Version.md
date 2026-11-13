⚠️ **Feature in development:** The 3D Network view is currently available only in the development version of MicrobeTrace and is not yet available on the [main MicrobeTrace site](https://microbetrace.cdc.gov/).

The 3D Network view displays your network's nodes and links in an interactive three-dimensional scene. Use it to:

1. Rotate a network to inspect connections from different angles.
2. Distinguish node categories with 3D shapes, colors, labels, and sizes.
3. Review link origins and direction, then export the current camera view with its legends.

### Use case 1: Explore a network in three dimensions

#### Before you begin

Load a network in MicrobeTrace. You can use node and link files, sequence-based network data, or a saved MicrobeTrace session. To follow the examples below, choose **Continue with Sample Dataset** on the welcome screen.

#### Steps

1. Load your data and select **Launch**, or continue with the sample dataset.
2. Open **View**, then select **3D Network**.

<img alt="MicrobeTrace View menu with the 3D Network option available above the other network views" src="https://raw.githubusercontent.com/wiki/CDCgov/MicrobeTrace/images/3d-network/01-open-view.png" />

3. Select **Fit Network**, the eye button in the view's toolbar, to bring the visible nodes into view.
4. Drag an empty part of the network to rotate the camera. Right-drag to pan, and use the scroll wheel to zoom.
5. Select **Freeze Layout**, the pin button, when you want the nodes to hold their positions while you explore. Select the same button, now labeled **Resume Layout**, to let the layout move again.

<img alt="The sample network displayed in 3D with its toolbar, shared color keys, independent shape legend, and XYZ orientation compass" src="https://raw.githubusercontent.com/wiki/CDCgov/MicrobeTrace/images/3d-network/02-overview.png" />

The lower-left count shows the nodes and links currently displayed. The 3D view follows the same shared network filters as the other network views.

#### Rotate the camera automatically

1. Select **Play camera rotation**, the triangle button in the 3D toolbar.
2. Watch the network rotate around the current camera target. A full turn takes about 30 seconds.
3. Select the button again, now showing **Pause camera rotation**, to hold the current angle.

<img alt="A rotated 3D network with camera playback active, the pause button highlighted, and the XYZ compass showing the new viewing direction" src="https://raw.githubusercontent.com/wiki/CDCgov/MicrobeTrace/images/3d-network/05-camera-navigation.png" />

Camera rotation also works while the layout is frozen. Dragging the scene, fitting or resetting the camera, recalculating the layout, or hiding the view stops automatic rotation.

The compass in the lower-right corner follows the camera. **X is red, Y is green, and Z is blue.** Dashed arrows point away from you. An axis viewed end-on appears as a dot when it points toward you, or a ring when it points away.

### Use case 2: Recognize node categories with shapes and labels

#### Before you begin

Choose a categorical node field to represent with shapes. The sample dataset includes **WHOclass**, **Node type**, **Profession**, and **State**. These examples use WHOclass for shapes and State for colors, allowing you to see both attributes at once.

#### Steps

1. Select the settings button in the upper-left corner of the 3D view.
2. On the **Nodes** tab, expand **Labels and Tooltips**. Choose **ID** under **Label** to identify individual nodes, and adjust the label size or orientation as needed.
3. Expand **Shapes and Sizes**. Leave **Size By** as **None** to use a fixed size, increase **Size** to make the shapes easier to see, and set **Border Width** to a small value such as **1.5**.

<img alt="3D Network Nodes settings showing ID labels, a fixed node size, Border Width set to 1.5, and Dock selected for the shape table" src="https://raw.githubusercontent.com/wiki/CDCgov/MicrobeTrace/images/3d-network/04-node-settings.png" />

4. Select **Show Shapes**. A new shape legend normally appears in **Dock** mode beside the other key tables. Use **Show**, **Dock**, or **Hide** to choose its display mode.
5. In the **3D Node Shapes** legend, choose **WHOclass** under **Shape By**.
6. Use the shape dropdown beside each category to change its assignment. Available shapes are sphere, cube, cone, cylinder, diamond, and square pyramid.
7. To adjust colors, expand **Colors** and select **Show Colors**. Choose **State** as the node color field for this example. Global color changes apply across views.
8. Close the settings dialog to inspect the styled graph. If labels overlap, set **Label** back to **None** and use tooltips to inspect individual nodes.

<img alt="Sample nodes shown as cones, cubes, cylinders, diamonds, and spheres, with the docked 3D Node Shapes legend listing WHOclass categories and counts" src="https://raw.githubusercontent.com/wiki/CDCgov/MicrobeTrace/images/3d-network/03-shape-legend.png" />

#### Understand the shape legend

- **Count** describes the currently visible nodes in each shape category. **(Empty)** groups nodes without a value for the selected field.
- Select a category name or column heading to edit its display text. Use the column arrows to sort, and the legend's settings button to choose whether to show counts or frequencies.
- Use the collapse button to save space or the float button to move the legend into a separate dialog. **Show Shapes** keeps an already visible legend in its current mode.
- Shapes repeat when a field has more categories than available shapes. Category assignments remain stable as you filter the network.
- **Border Width** changes the visible frame edges of the 3D shape, including edges between faces. Set it to **0** to hide the frame.

The **3D Node Shapes** legend controls this view. The separate **Node Shapes / 2D Shapes** table controls the 2D view. The 3D view keeps its own shape assignments, sizing, labels, and tooltips.

To vary node sizes, select a numeric field under **Size By**, then adjust **Min Size** and **Max Size**. Under **Labels and Tooltips**, choose one or more tooltip fields to inspect when you hover over a node.

### Use case 3: Inspect link origins and direction

#### Before you begin

Use a network with multiple link sources to compare origins. The sample dataset combines contact-tracing and genetic-distance links. To display arrowheads, links must also contain direction information.

#### Steps

1. In the **Link Colors** key table, choose **Origin**. Links supported by two origins appear in the **Duo-Link** row.
2. For shorter legend labels, edit the source names directly in the table. The screenshots use **Contact tracing** and **Genetic distance**.
3. Open the 3D view's settings, select **Links**, and expand **Shapes and Sizes**.
4. Adjust **Width** to make the links easier to inspect. Alternatively, choose a numeric field under **Width By**, then set its minimum and maximum widths. **Reciprocal** reverses the width mapping.
5. Move **Transparency** to the right to make links more transparent. Select **Use legend transparency** to return to the transparency settings in the global color keys.
6. Set **Arrows** to **Show** for directed links. Set **Bidirectional** to **Show** to add a reverse arrowhead on directed links that are also marked as bidirectional.

<img alt="3D Network Links settings showing transparency, width, and the controls for directed and bidirectional arrows" src="https://raw.githubusercontent.com/wiki/CDCgov/MicrobeTrace/images/3d-network/06-link-settings.png" />

With **Origin** coloring selected, a dual-origin link uses a solid stroke for its first origin and dashed bands for its second. Each origin retains its color and legend transparency. Arrowheads have a contrasting outline so they remain visible against opaque links.

Expand **Labels and Tooltips** on the Links tab to choose a link label or tooltip fields. Distance labels follow the active global metric: SNP counts appear as whole numbers, and TN93 labels follow the selected decimal or percentage display format.

### Work with selections and filters

- Select a node to select the same record in linked views. Use **Shift**, **Ctrl** on Windows, or **Command** on macOS while clicking to build or adjust a selection.
- Click empty space or press **Escape** while the network has focus to clear the selection.
- Open **Network > Display** in 3D settings to control neighbor highlighting while hovering over nodes.
- Shared distance thresholds, nearest-neighbor rules, minimum cluster size, subset filters, and timeline filters change which nodes and links appear. Only links with two visible endpoints are drawn.
- For a dense network, narrow the visible subset and freeze the layout before inspecting it from several angles.

### Save the view and export an image

#### Save a session

Use **File > Save** to save a MicrobeTrace session. The session stores the 3D camera angle, node positions, frozen-layout state, and appearance settings. Reopening a saved view retains its camera angle and starts with automatic camera rotation paused.

#### Export the current camera view

1. Rotate and zoom to the angle you want, then pause camera rotation.
2. Select **Export Screen**, the download button in the 3D toolbar.
3. Enter a filename and choose **png**, **jpeg**, or **webp** under **File type**.
4. Increase **Image scale** if you need a larger image.
5. Choose whether to include the node color key, link color key, and 3D node shape key. The shape-key option becomes available when **Shape By** is set to a field.
6. Select **Export PNG**, **Export JPEG**, or **Export WEBP**, depending on the selected format.

<img alt="Export 3D Network dialog with a filename, PNG format, image scale, and all three legend options selected" src="https://raw.githubusercontent.com/wiki/CDCgov/MicrobeTrace/images/3d-network/07-export-dialog.png" />

The exported image uses the current camera angle and visible network. The selected keys are added alongside the graph. Below is the PNG produced by the example above:

<img alt="PNG exported from the 3D view, showing the current network, node colors, contact-tracing and genetic-distance link colors, and the WHOclass shape legend" src="https://raw.githubusercontent.com/wiki/CDCgov/MicrobeTrace/images/3d-network/08-exported-network.png" />

### Helpful controls

- **Settings:** Change node and link appearance, tooltips, and neighbor highlighting.
- **Fit Network:** Bring the visible graph into view. Press **F** while the network has focus for the same action.
- **Reset Camera:** Restore the default viewing direction and frame the network.
- **Freeze Layout / Resume Layout:** Hold or release node positions while keeping camera navigation available.
- **Recalculate Layout:** Create a new arrangement of the nodes.
- **Play / Pause camera rotation:** Start or stop automatic camera movement.
- **Zoom in / Zoom out:** Change the viewing distance. The scroll wheel and **+ / −** keys also zoom.

### Quick troubleshooting

- **3D Network is missing from the View menu:** This feature is currently available only in the development version of MicrobeTrace.
- **The graph is off-screen:** Select **Fit Network** or **Reset Camera**.
- **No nodes match the current filters:** Review the global filters, selected subset, and timeline range.
- **The network keeps moving while you inspect it:** Select **Freeze Layout**. Camera rotation has a separate play/pause button.
- **The shape legend is missing:** Open **Nodes > Shapes and Sizes** and choose **Show** or **Dock** for **Shape Table**. Expand the card if it is collapsed.
- **Arrows do not appear:** Confirm that **Arrows** is set to **Show** and the relevant links are marked as directed. Reverse arrowheads also require the bidirectional flag and its display control.
- **The Length slider is disabled:** Resume the layout before changing link length.
- **The 3D shape key cannot be included in an export:** Choose a field under **Shape By** first.
- **A WebGL error appears:** Select **Retry**, or use **Open 2D Network** to continue inspecting the network in 2D.

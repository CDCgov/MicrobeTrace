# Map View Custom Floorplans

MicrobeTrace Map View can render a user-provided GeoJSON or image background behind the network. This supports non-geographic layouts such as hospital floors, clinics, wards, rooms, or other outbreak investigation spaces.

## Data Requirements

- The node file can contain one field for horizontal position and one field for vertical position, or positions can be assigned manually in Map View.
- In Map settings, select the vertical field as `Latitude` and the horizontal field as `Longitude` when the node file already has positions.
- GeoJSON coordinates must use the same coordinate plane as the node file and must follow GeoJSON order: `[longitude, latitude]`.
- For floorplans, treat that order as `[x, y]`: `x` is stored in the GeoJSON longitude slot, and `y` is stored in the GeoJSON latitude slot.
- The `Background` upload accepts `.geojson`, `.json`, and image files. MicrobeTrace detects the file type automatically.
- GeoJSON files must contain a `FeatureCollection`, `Feature`, or geometry object.
- Uploaded image floorplans use a normalized `x/y` coordinate plane that preserves the image aspect ratio. The longer image side is scaled to `80`, and the shorter side is scaled proportionally.

## Example Workflow

1. Load the node data file, for example `geoJSON_test_nodes.csv`.
2. Open Map View.
3. Open `Geospatial Settings`.
4. In the `Data` tab, set `Latitude` to `lat` and `Longitude` to `long`.
5. In `Components > User Provided`, use `Background` to load `geoJSON_test.json`.
6. Keep `User Provided > Layer` set to `Show`.
7. Use `Center Screen` or `User Provided > Center` to fit the nodes and floorplan.

When a user-provided background is shown, MicrobeTrace hides the basemap, satellite, country, state, and county layers so the floorplan remains the only map background. Nodes and links still use the normal Map View styling controls.

## Image Floorplans

To use an image as the floorplan, open `Components > User Provided`, use `Background` to load an image file, and keep `Layer` set to `Show`. The loaded image summary shows the original image dimensions and the normalized `x/y` coordinate range used for manual placement.

Only one user-provided floorplan background is active through this control. Loading a GeoJSON file clears any uploaded image background, and loading an image clears any uploaded GeoJSON background.

## Manual Node Placement

When a user-provided background is shown, open `Components > User Provided > Manual Positions` and turn `Positioning` on. Choose a visible node, then click the floorplan to assign its `x/y` position. Nodes that already have positions can be moved by dragging their markers.

Manual positions are saved on nodes as:

- `map_floorplan_x`
- `map_floorplan_y`

These fields are only used while a user-provided floorplan background is shown. When the background is hidden, Map View returns to the normal selected geographic fields. Use `Next Unplaced` to step through nodes without manual positions, `Clear Selected` to remove one node position, or `Clear All` to remove positions for all currently visible nodes.

## Creating GeoJSON for Floorplans

The simplest route is to draw polygons in a GIS or vector tool, export GeoJSON, and record node positions in the same coordinate system. For a floorplan without real-world coordinates, a small local coordinate plane is enough. For example, rooms can be drawn from `0` to `10` on the x-axis and y-axis, and nodes can use matching `x/y` values.

For image-based floorplans that need room outlines as selectable geometry, create the GeoJSON boundaries from the image first, then use the same coordinate scale for node positions. When only a visual background is needed, upload the image directly and use the manual placement controls to assign node `x/y` values on top of the floorplan.

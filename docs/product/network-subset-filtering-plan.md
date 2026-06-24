# Network Subset Filtering Feature Plan

## Summary

MicrobeTrace should let users temporarily narrow a loaded network to the nodes and links they care about, without changing or deleting the underlying data.

This feature would help users answer focused questions in large networks, such as:

- Show only nodes from Texas.
- Show only links involving CDC.
- View a smaller regional, institutional, or metadata-defined subset of the full network.

The original dataset remains loaded. The filter only changes what is visible.

## User Experience

Users would open the existing Settings area and use a new Subset section inside Filtering.

The first version should use simple controls:

```text
Filter nodes where:
Field: State
Condition: equals
Value: Texas

[Apply Filter] [Clear Filter]
```

For link-based filtering:

```text
Filter links where:
Field: Institution
Condition: contains
Value: CDC

[Apply Filter] [Clear Filter]
```

When a filter is active, MicrobeTrace should show a visible notice:

```text
Subset active: State equals Texas
```

The notice should include an easy way to clear the filter.

## Example Workflows

### View Only Texas Nodes

The user chooses:

```text
Node field: State
Condition: equals
Value: Texas
```

MicrobeTrace shows only Texas nodes and the links between those visible Texas nodes.

This allows users to inspect a smaller regional network without making a new file.

### View Links Related to CDC

The user chooses:

```text
Link field: Institution
Condition: contains
Value: CDC
```

MicrobeTrace shows only matching links and the nodes connected by those links.

This allows users to focus on relationships involving one institution inside a larger network.

## What Should Update

When a subset filter is active, every view should agree with the filtered network.

The filtered state should apply to:

- 2D Network
- Table
- Map
- Bubble
- Aggregate summaries
- Crosstab
- Waterfall
- Network statistics
- Exports, when exporting the visible network

For example, if the 2D Network shows 40 visible nodes, the Table and statistics should also reflect those same 40 visible nodes.

## Safety Rules

The feature must be reversible and must not damage the loaded data.

Core rules:

- Filtering must not delete nodes or links.
- Filtering must not rewrite uploaded source data.
- Clearing the filter must restore the full visible network, subject to the other active MicrobeTrace settings.
- Saved sessions may remember the filter, but the app must clearly show that a subset filter is active after reopening.
- Exports must clearly indicate whether they are exporting the full dataset or the filtered view.

The safest mental model is:

```text
Original data = unchanged
Filter rules = saved separately
Visible network = calculated from original data plus filter rules
```

## First Release Scope

The first release should support one node filter and one link filter at a time.

Supported operators:

- contains
- equals
- does not equal
- starts with
- ends with
- less than
- less than or equal to
- greater than
- greater than or equal to

The first release should include:

- Node subset filter.
- Link subset filter.
- Active filter notice.
- Clear filter button.
- Consistent view updates across the main visualizations and statistics.
- Session save and reopen support.
- Export labeling so users know whether they are exporting the filtered view.

## Later Enhancements

Possible follow-up improvements:

- Multiple filters at once, such as `State equals Texas` and `Age greater than 30`.
- Saved filter presets.
- A Table action to apply current table filters to the network.
- Filter chips that can be individually removed.
- More advanced matching options for blank values, lists, and dates.
- Option to include neighboring nodes when filtering nodes.

## Risks And Safeguards

### Users may forget a filter is active

Safeguard: always show a clear active-filter notice and a Clear Filter button.

### Views may disagree

Safeguard: implement the subset filter as a shared network visibility rule, not as a 2D Network-only display trick.

### Exports may surprise users

Safeguard: export dialogs should clearly say whether the export uses the full data or the visible filtered network.

### Cluster counts may change

This is expected. When the visible network changes, clusters are recalculated for the subset. The UI should make clear that statistics are for the filtered view when a subset is active.

### Existing filters may interact with the subset filter

MicrobeTrace already has filtering controls such as link threshold, nearest neighbor pruning, minimum cluster size, and timeline filtering.

Safeguard: define the subset filter as part of the shared visibility calculation so all existing controls apply in a predictable order.

Recommended order:

1. Apply the subset filter.
2. Apply link threshold and nearest neighbor rules.
3. Apply minimum cluster size.
4. Apply timeline visibility, when timeline filtering is active.

## Acceptance Criteria

The feature is ready when:

- A user can filter nodes by a field and value.
- A user can filter links by a field and value.
- Clearing the filter restores the previous full-network view.
- The active filter is clearly visible in the UI.
- 2D Network, Table, Map, summaries, and statistics agree on visible counts.
- Saved sessions reopen with the active filter clearly shown.
- Exports clearly distinguish filtered-view exports from full-data exports.
- Tests cover node filtering, link filtering, clearing filters, and session round trip.

## Implementation Notes

This should be implemented as a shared visibility feature in the common network state, not inside one visualization.

The filter rule should be stored separately from the original nodes and links. Views should consume the calculated visible network instead of modifying source data.

The Table already has local row filters. Those should remain separate in the first version. A later explicit action can allow users to apply a Table filter to the whole network.


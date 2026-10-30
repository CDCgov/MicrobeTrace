export interface ReleaseNotesLinkedItem {
    before?: string;
    link: { text: string; url: string };
    after?: string;
}

export type ReleaseNotesItem = string | ReleaseNotesLinkedItem;

export interface ReleaseNotesGroup {
    title: string;
    items: readonly ReleaseNotesItem[];
}

export interface ReleaseNotesSection {
    title: string;
    items?: readonly ReleaseNotesItem[];
    groups?: readonly ReleaseNotesGroup[];
}

export interface ReleaseNotesEntry {
    version: string;
    date?: string;
    sourceUrl?: string;
    sections: readonly ReleaseNotesSection[];
}

// Keep newest versions first. Content is bundled so Updates also works offline.
// Notes come from published GitHub releases or release text provided by maintainers.
// Add a new entry here when its release notes are ready.
// The first entry's version also controls the Updates notification.
export const RELEASE_NOTES: readonly ReleaseNotesEntry[] = [
    {
        version: '2.4',
        date: '',
        sections: [
            {
                title: 'Highlights',
                items: [
                    {
                        link: {
                            text: 'Mixed and Weighted Node Values',
                            url: 'https://github.com/CDCgov/MicrobeTrace/wiki/Showing-Mixed-Values-as-Donuts'
                        },
                        after: ': Visualize nodes assigned to multiple categories as hollow, multi-color rings, including proportional segments from inline weights such as 2a:70/3a:30.'
                    },
                    'Network Subset Filtering: Filter the visible network by node or link metadata without changing the source dataset.',
                    {
                        link: {
                            text: 'Custom Maps and GeoJSON',
                            url: 'https://github.com/CDCgov/MicrobeTrace/wiki/Map-View-with-GeoJSON-Files-and-Custom-Maps'
                        },
                        after: ': Add locations from GeoJSON, display custom map layers, or place nodes on image floorplans.'
                    },
                    {
                        link: {
                            text: 'Color Assignment Files',
                            url: 'https://github.com/CDCgov/MicrobeTrace/wiki/Color-Assignment-File'
                        },
                        after: ': Import CSV, TSV, or iTOL files to apply consistent node colors across datasets and saved sessions.'
                    },
                    'Local Session Bookmark Links: Save a session in the current browser and create a local link that can be bookmarked and reopened on the same browser and MicrobeTrace site.',
                ]
            }
        ]
    },
    {
        version: '2.3',
        date: '2026-09-08',
        sourceUrl: 'https://github.com/CDCgov/MicrobeTrace/releases/tag/v2.3',
        sections: [
            {
                title: 'Highlights',
                items: [
                    {
                        before: 'Improved Partner Embeds: ',
                        link: {
                            text: 'Auspice (Nextstrain)',
                            url: 'https://github.com/CDCgov/MicrobeTrace/wiki/Nextstrain-trees-and-MicrobeTrace'
                        },
                        after: ' datasets now retain partner-provided launch defaults, including the selected view, filtering threshold, and styling settings.'
                    },
                    'Updated Online Basemap: Map View now uses OpenFreeMap with English or Latin place labels.',
                ]
            }
        ]
    },
    {
        version: '2.2',
        date: '2026-07-22',
        sourceUrl: 'https://github.com/CDCgov/MicrobeTrace/releases/tag/v2.2',
        sections: [
            {
                title: 'Highlights',
                items: [
                    {
                        link: {
                            text: 'Docked Key Tables',
                            url: 'https://github.com/CDCgov/MicrobeTrace/wiki/2D-Network-View#docked-tables-versus-floating'
                        },
                        after: ': Added ability to dock and undock key tables (node color, link color, node shape, and group color).'
                    },
                    'Global Node Shapes: Node shapes are now consistent across 2D Network, Map View, and optionally Phylogenetic Tree View.',
                    'Added 46 new shapes including various places, animals, vectors, and people.',
                    'Improved Newick File Ingestion: Larger trees can be loaded into MicrobeTrace either directly or through Nextstrain.',
                    {
                        link: {
                            text: 'Phylogenetic Subtrees',
                            url: 'https://github.com/CDCgov/MicrobeTrace/wiki/Phylogeny-View#subtrees'
                        },
                        after: ': Display a subtree and return to the full tree.'
                    },
                    'Improved file loading, session restoration, dashboard layout persistence, and restored support for loading zipped MicrobeTrace session archives.',
                    'Expanded visualization controls across 2D Network, Map, Phylogenetic Tree, EpiCurve, Gantt, Bubble, and dashboard/table workflows.',
                ]
            }
        ]
    },
    {
        version: '2.1',
        date: '2026-03-20',
        sourceUrl: 'https://github.com/CDCgov/MicrobeTrace/releases/tag/v2.1',
        sections: [
            {
                title: 'Highlights',
                items: [
                    'Dashboard Views: Automatically resize and recenter when view size changes, including in dashboard mode',
                    'Cluster Logic: Updating the link threshold now correctly updates all views and tables when clusters split or merge.',
                    'Fixed synchronization issues for node selection across different views.',
                    'Gantt Chart: Added user controls for sizing, font size, opacity, and grid line visibility.',
                    'Map View: Added a dialog box to display nodes without location data and fixes overlapping map layers and link colors'
                ]
            }
        ]
    },
    {
        version: '2.0',
        date: '2025-12-11',
        sourceUrl: 'https://github.com/CDCgov/MicrobeTrace/releases/tag/v2.0.0',
        sections: [
            {
                title: 'Highlights',
                items: [
                    'Refactored the entire codebase to Angular for improved scalability, performance, and usability.',
                    'Switched to Cytoscape.js as the visualization engine for 2D Network for faster, more efficient rendering of large networks.',
                    'Added a default dataset to allow new users to easily test MicrobeTrace\'s functionality.',
                    'Expanded functionality of multiple views including Bubble, EpiCurve, and Alignment Views.',
                    'Redesigned the user interface to make key features more visible and user-friendly.'
                ]
            }
        ]
    }
];

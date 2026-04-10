export type NodeShapeGroupKey = 'basic' | 'buildings' | 'people' | 'vectors' | 'animals' | 'other';

export const DEFAULT_NODE_SHAPE_KEY = 'ellipse';

export const NODE_SHAPE_GROUPS: ReadonlyArray<{ key: NodeShapeGroupKey; label: string }> = [
    { key: 'basic', label: 'Basic Shapes' },
    { key: 'buildings', label: 'Buildings' },
    { key: 'people', label: 'People' },
    { key: 'vectors', label: 'Pathogens & Vectors' },
    { key: 'animals', label: 'Animals' },
    { key: 'other', label: 'Other' },
];

export interface NodeShapeOption {
    key: string;
    value: string;
    name: string;
    groupKey: NodeShapeGroupKey;
}

type NodeShapePoint = [number, number];

const MAP_NODE_SHAPE_CANVAS_SIZE = 300;
const MAP_NODE_SHAPE_CENTER = MAP_NODE_SHAPE_CANVAS_SIZE / 2;
const MAP_NODE_SHAPE_RADIUS = 110;
const TREE_BASIC_NODE_SHAPE_SCALE = MAP_NODE_SHAPE_CANVAS_SIZE / (MAP_NODE_SHAPE_RADIUS * 2);


interface CustomNodeShapeDefinition extends NodeShapeOption {
    cytoscapeShape: string;
    width: number;
    height: number;
    viewBox: string;
    path: string;
    fillPath?: string;
}

export const BASIC_NODE_SYMBOL_OPTIONS: NodeShapeOption[] = [
    { key: 'ellipse', value: '\u2b24', name: ' (Circle) ', groupKey: 'basic' },
    { key: 'triangle', value: '\u25b2', name: ' (Triangle)', groupKey: 'basic' },
    { key: 'rectangle', value: '\u25fc', name: ' (Square)', groupKey: 'basic' },
    { key: 'rhomboid', value: '\u25b0', name: ' (Rhombus)', groupKey: 'basic' },
    { key: 'diamond', value: '\u25c6', name: ' (Diamond)', groupKey: 'basic' },
    { key: 'heptagon', value: '\u2b23', name: ' (Heptagon)', groupKey: 'basic' },
    { key: 'pentagon', value: '\u2b1f', name: ' (Pentagon)', groupKey: 'basic' },
    { key: 'hexagon', value: '\u2b22', name: ' (Hexagon)', groupKey: 'basic' },
    { key: 'barrel', value: '', name: ' (Barrel)', groupKey: 'basic' },
    { key: 'octagon', value: '\u2bc3', name: ' (Octagon)', groupKey: 'basic' },
    { key: 'star', value: '\u2605', name: ' (Star)', groupKey: 'basic' },
    { key: 'tag', value: '\u2617', name: ' (Tag)', groupKey: 'basic' },
    { key: 'vee', value: 'V', name: ' (Vee)', groupKey: 'basic' },
];

const BASIC_NODE_SHAPE_KEYS = new Set(BASIC_NODE_SYMBOL_OPTIONS.map(({ key }) => key));

const CUSTOM_NODE_SHAPE_DEFINITIONS: Record<string, CustomNodeShapeDefinition> = {
    unknown: {
        key: 'unknown',
        value: '?',
        name: ' (Unknown)',
        groupKey: 'other',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M109 109q-2 27 5 44q5 14 17 23q7 6 21 12t18 10q8 7 8 18t-8.5 17t-21.5 6q-26 0 -26 -34h-84q0 21 9.5 40t26.5 32q36 24 79 22q48 1 79 -20.5t31 -61.5q0 -17 -8 -30q-5 -11 -17 -19q-6 -5 -21 -14q-19 -10 -25 -17q-11 -12 -8 -28h-75zM188 78v-78h-83v78h83z'    
    },
    house: {
        key: 'house',
        value: '',
        name: 'House',
        groupKey: 'buildings',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M125 50v75h50v-75h62v100h38l-125 113l-125 -113h37v-100h63z'    
    },
    clinic: {
        key: 'clinic',
        value: '',
        name: 'Clinic',
        groupKey: 'buildings',
        cytoscapeShape: 'round-rectangle',
        width: 337,
        height: 300,
        viewBox: '0 0 337 300',
        path: 'M169 233l-128 -113l-3 -2v-109q0 -4 2.5 -6.5t6.5 -2.5h244q4 0 6.5 2.5t2.5 6.5v109l-3 2zM225 80q0 -2 -1.5 -3.5t-3.5 -1.5h-32v-33q0 -2 -1.5 -3t-3.5 -1h-28q-2 0 -3.5 1t-1.5 3v33h-33q-2 0 -3 1.5t-2 3.5v28q1 2 2 3.5t3 1.5h33v32q0 2 1.5 3.5t3.5 1.5h28q2 0 3.5 -1.5t1.5 -3.5v-32h32q2 -1 3.5 -2t1.5 -3v-28zM334 162l-150 132q-6 6 -15 6t-16 -6l-150 -132q-3 -3 -3 -7t2 -7l13 -14q3 -3 6.5 -3t6.5 3l135 118q2 3 5.5 3t6.5 -3l134 -118q3 -3 7 -3t7 3l12 14q3 3 2.5 7t-3.5 7z'
    },
    school: {
        key: 'school',
        value: '',
        name: 'School',
        groupKey: 'buildings',
        cytoscapeShape: 'barrel',
        width: 375,
        height: 300,
        viewBox: '0 0 375 300',
        path: `M0 169v-160q0 -4 2.5 -6.5t6.5 -2.5h47v188h-37q-8 0 -13.5 -5.5t-5.5 -13.5zM211 197h-14v23q0 2 -1.5 3.5t-3.5 1.5h-9q-2 0 -3.5 -1.5t-1.5 -3.5v-37q0 -2 1.5 -3.5t3.5 -1.5h28q2 0 3.5 1.5t1.5 3.5v9q0 2 -1.5 3.5t-3.5 1.5zM292 234l-94 63q-5 3 -10.5 3t-10.5 -3l-94 -63q-8 -5 -8 -15v-219h75v84q0 4 2.5 7t6.5 3h57q4 0 6.5 -3t2.5 -7v-84h75v219q0 10 -8 15zM188 150q-20 0 -33.5 13.5t-13.5 33t13.5 33.5t33 14t33 -14t13.5 -33.5t-13.5 -33t-32.5 -13.5zM356 188h-37v-188h47q4 0 6.5 2.5t2.5 6.5v160q0 8 -5.5 13.5t-13.5 5.5z`
    },
    placeOfWorship: {
        key: 'placeOfWorship',
        value: '',
        name: 'Place of Worship',
        groupKey: 'buildings',
        cytoscapeShape: 'barrel',
        width: 375,
        height: 300,
        viewBox: '0 0 375 300',
        path: `M364 85l-64 28v-113h66q4 0 6.5 2.5t2.5 6.5v59q0 6 -3 10.5t-8 6.5zM0 68v-59q0 -4 2.5 -6.5t6.5 -2.5h66v113l-64 -28q-5 -2 -8 -6.5t-3 -10.5zM272 155l-28 18v67q0 8 -6 13l-44 44q-3 3 -6.5 3t-6.5 -3l-44 -44q-6 -5 -6 -13v-67l-28 -18q-9 -5 -9 -16v-139h56v56q0 16 11 27t26.5 11t26.5 -11t11 -27v-56h56v139q0 11 -9 16z`
        },
    farm: {
        key: 'farm',
        value: '',
        name: 'Farm',
        groupKey: 'buildings',
        cytoscapeShape: 'barrel',
        width: 337,
        height: 300,
        viewBox: '0 0 337 300',
        path: 'M130 247v0q-5 25 -25 40t-45.5 12.5t-42.5 -21t-17 -44.5v-234h75v147q0 9 4 17l32 65q6 12 19 18zM336 156l-33 65q-3 6 -9 9l-71 31q-7 3 -15 0l-71 -31q-6 -3 -9 -9l-32 -65q-2 -4 -2 -9v-147h75v56h94v-56h75v147q-1 5 -2 9zM244 113h-56v56h56v-56z'    
    },
    city: {
        key: 'city',
        value: '',
        name: 'City',
        groupKey: 'buildings',
        cytoscapeShape: 'barrel',
        width: 375,
        height: 300,
        viewBox: '0 0 375 300',
        path: `M361 188h-80v98q0 6 -4 10t-10 4h-84q-6 0 -10 -4t-4 -10v-42h-38v47q0 4 -2.5 6.5t-6.5 2.5h-9q-4 0 -7 -2.5t-3 -6.5v-47h-37v47q0 4 -3 6.5t-7 2.5h-9q-4 0 -6.5 -2.5t-2.5 -6.5v-47h-24q-6 0 -10 -4t-4 -10v-211q0 -8 5.5 -13.5t13.5 -5.5h337q8 0 13.5 5.5t5.5 13.5
v154q0 6 -4 10.5t-10 4.5zM75 63q0 -3 -2 -5t-5 -2h-23q-3 0 -5 2t-2 5v24q0 3 2 5t5 2h23q3 0 5 -2t2 -5v-24zM75 120q0 -3 -2 -5t-5 -2h-23q-3 0 -5 2t-2 5v23q0 3 2 5t5 2h23q3 0 5 -2t2 -5v-23zM75 176q0 -3 -2 -5t-5 -2h-23q-3 0 -5 2t-2 5v23q0 3 2 5t5 2h23q3 0 5 -2
t2 -5v-23zM150 63q0 -3 -2 -5t-5 -2h-23q-3 0 -5 2t-2 5v24q0 3 2 5t5 2h23q3 0 5 -2t2 -5v-24zM150 120q0 -3 -2 -5t-5 -2h-23q-3 0 -5 2t-2 5v23q0 3 2 5t5 2h23q3 0 5 -2t2 -5v-23zM150 176q0 -3 -2 -5t-5 -2h-23q-3 0 -5 2t-2 5v23q0 3 2 5t5 2h23q3 0 5 -2t2 -5v-23z
M244 120q0 -3 -2 -5t-5 -2h-24q-3 0 -5 2t-2 5v23q0 3 2 5t5 2h24q3 0 5 -2t2 -5v-23zM244 176q0 -3 -2 -5t-5 -2h-24q-3 0 -5 2t-2 5v23q0 3 2 5t5 2h24q3 0 5 -2t2 -5v-23zM244 232q0 -3 -2 -5t-5 -2h-24q-3 0 -5 2t-2 5v23q0 3 2 5.5t5 2.5h24q3 0 5 -2.5t2 -5.5v-23z
M338 63q0 -3 -2.5 -5t-5.5 -2h-23q-3 0 -5 2t-2 5v24q0 3 2 5t5 2h23q3 0 5.5 -2t2.5 -5v-24zM338 120q0 -3 -2.5 -5t-5.5 -2h-23q-3 0 -5 2t-2 5v23q0 3 2 5t5 2h23q3 0 5.5 -2t2.5 -5v-23z`    
    },
    man: {
        key: 'man',
        value: '',
        name: 'Man',
        groupKey: 'people',
        cytoscapeShape: 'round-rectangle',
        width: 112,
        height: 300,
        viewBox: '0 0 112 300',
        path: 'M56 300q16 0 27 -11t11 -26.5t-11 -26.5t-26.5 -11t-26.5 11t-11 26.5t11 26.5t26 11zM84 216h-6q-10 -5 -21.5 -5t-21.5 5h-7q-12 0 -20 -8.5t-8 -19.5v-80q0 -6 4 -10t10 -4h9v-80q0 -6 4.5 -10t10.5 -4h37q6 0 10 4t4 10v80h9q6 0 10.5 4t4.5 10v80q0 11 -8.5 19.5 t-20.5 8.5z'    
    },
    woman: {
        key: 'woman',
        value: '',
        name: 'Woman',
        groupKey: 'people',
        cytoscapeShape: 'round-rectangle',
        width: 150,
        height: 300,
        viewBox: '0 0 150 300',
        path: 'M75 300q16 0 26.5 -11t11 -26.5t-10.5 -26.5t-27 -11t-27 11t-11 26.5t11 26.5t27 11zM145 92l-28 113q-1 5 -5 8t-9 3h-7q-10 -5 -21 -5t-21 5h-7q-5 0 -9 -3t-5 -8l-28 -113q-2 -6 2.5 -11.5t11.5 -5.5h33v-61q0 -6 4 -10t10 -4h18q6 0 10 4t4 10v61h33q7 0 11.5 5.5 t2.5 11.5z'    
    },
    person: {
        key: 'person',
        value: '',
        name: 'Person',
        groupKey: 'people',
        cytoscapeShape: 'round-rectangle',
        width: 262,
        height: 300,
        viewBox: '0 0 262 300',
        path: 'M131 150q21 0 38 10t27 27.5t10 37.5t-10 37.5t-27 27.5t-37.5 10t-38 -10t-27.5 -27.5t-10 -37.5t10 -37.5t27.5 -27.5t37.5 -10zM184 131h-10q-20 -9 -42.5 -9t-42.5 9h-10q-22 0 -40 -10.5t-28.5 -28.5t-10.5 -39v-25q0 -12 8 -20t20 -8h206q12 0 20.5 8t8.5 20v25 q0 21 -11 39t-29 28.5t-39 10.5z'    
    },
    virus: {
        key: 'virus',
        value: '',
        name: 'Virus',
        groupKey: 'vectors',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M283 167h-12q-15 0 -24 9.5t-9.5 23t9.5 24.5l9 9q5 4 4.5 11t-5 11.5t-11.5 5t-11 -4.5l-9 -9q-11 -10 -24.5 -9.5t-23 9.5t-9.5 24v12q0 7 -5 12t-12 5t-12 -5t-5 -12v-12q0 -15 -9.5 -24t-23 -9.5t-24.5 9.5l-8 9q-5 5 -12 4.5t-11.5 -5t-5 -11.5t4.5 -11l9 -9 q10 -11 9.5 -24.5t-9.5 -23t-24 -9.5h-12q-5 0 -9 -2.5t-6 -6t-2 -8.5t2 -8.5t6 -6t9 -2.5h12q15 0 24 -9.5t9.5 -23t-9.5 -24.5l-9 -8q-5 -5 -4.5 -12t5 -11.5t11.5 -5t12 4.5l8 9q11 10 24.5 9.5t23 -9.5t9.5 -24v-12q0 -7 5 -12t12 -5t12 5t5 12v12q0 15 9.5 24t23 9.5 t24.5 -9.5l9 -9q4 -5 11 -4.5t11.5 5t5 11.5t-4.5 12l-9 8q-10 11 -9.5 24.5t9.5 23t24 9.5h12q5 0 9 2.5t6 6t2 8.5t-2 8.5t-6 6t-9 2.5zM131 141q-11 0 -19.5 8t-8.5 19.5t8.5 20t20 8.5t19.5 -8.5t8 -20t-8 -19.5t-20 -8zM178 108q-6 0 -10 4t-4 10t4 10t10 4t10 -4 t4 -10t-4 -10t-10 -4z'
    },
    bacteria: {
        key: 'bacteria',
        value: '',
        name: 'Bacteria',
        groupKey: 'vectors',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M299 240q-1 5 -6 8t-11 1l-9 -3q-10 19 -28 28l2 9q1 5 -1.5 10t-8.5 6.5t-10.5 -1.5t-6.5 -8l-2 -9q-7 0 -13 -1q-13 -2 -26 -6l-3 7q-2 6 -7 8t-10.5 0.5t-8 -7t-0.5 -10.5l3 -7q-18 -8 -35 -19l-4 7q-4 4 -9.5 5t-10.5 -2.5t-5.5 -9t2.5 -10.5l5 -6q-15 -13 -27 -28l-7 5q-6 5 -13.5 1.5t-8.5 -11.5t6 -13l6 -4q-10 -17 -18 -35l-7 3q-8 2 -14 -3t-4.5 -13t8.5 -10l8 -3q-3 -12 -5 -24q-2 -7 -1 -15l-9 -2q-6 -2 -8.5 -7t-1 -10.5t6.5 -8.5t11 -1l9 3q9 -19 28 -28l-2 -9q-2 -5 1 -10t9 -7h3q5 0 9 3t5 7l2 9h2q20 0 36 11l7 -7q4 -4 9.5 -4t9.5 4t4.5 9.5t-3.5 9.5l-7 7q7 11 9 25q1 6 3 12l7 -4q7 -3 14 1.5t6 12.5t-8 11l-7 4l8 9q4 5 9 9l10 8l3 -7q3 -5 8 -7t10.5 0t7.5 7.5t0 10.5l-3 7l9 3q15 2 27 11l8 -7q5 -6 13 -3.5t10 10.5t-5 13l-7 7q10 17 9 38l9 2q6 2 8.5 7t0.5 11zM94 84q-12 0 -20 8.5t-8 20t8 20t19.5 8.5t20 -8.5t8.5 -20t-8.5 -20t-19.5 -8.5zM141 164q-6 0 -10 4t-4 10t4 10t9.5 4t10 -4t4.5 -10t-4.5 -10t-9.5 -4z'
    },
    tick: {
        key: 'tick',
        value: '',
        name: 'Tick',
        groupKey: 'vectors',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M225 160l1 1q19 6 31 23q4 6 2.5 17t-4.5 14v0q-1 1 -2.5 0t-1.5 -2q1 -13 -4 -24h-1q-12 -10 -25 -18v0q-2 1 -12.5 -1t-14.5 -2l6 -12q21 0 25 4zM220 184v1q10 5 16.5 14t9.5 20q0 1 -1 2v0q6 13 6 27q0 2 -2 3q0 14 -10 24v0q-1 1 -2 0t-1 -2l3 -22v-3q-3 -14 -8 -29 l-4 -1q-1 -1 -1 -3q-5 -11 -13 -21v0q-14 -6 -29 -10l8 -12q21 2 28 12zM213 106q4 -4 8 -7l7 -29q0 -2 1 -3v0q-2 -5 1 -17t6 -16q2 -2 4 -3v0q6 -10 26 -11q4 0 4 1v0q2 1 2 3q-6 5 -13 7t-10 8l-1 3q-3 8 -5 16v0q1 0 1 2q0 10 -5 26q-3 9 -7 17v0q0 2 -1 5 q-10 18 -25 32q5 -16 7 -33v-1zM278 77q1 2 1 4q-3 13 -10 24v1q0 14 -12 25q-8 6 -17 11v0q0 2 -3 4l-1 1q-16 11 -36 8l6 -13q13 -4 26 -9q13 -10 22 -23q1 -2 2 -3q7 -12 10 -25q-1 -3 1 -5q1 -7 10 -13t14 -6v0l1.5 1.5t-0.5 1.5zM79 171v0q-13 8 -25 18h-1q-5 12 -4 24 q0 2 -1.5 2.5t-2.5 -0.5v0q-3 -3 -4.5 -13.5t2.5 -17.5q12 -17 31 -23l1 -1q5 -4 25 -3l6 12q-13 2 -27 2zM87 194v0q-9 9 -13 21q0 2 -1 3l-4 1q-6 14 -8 29l-1 2l4 23q0 1 -1 2t-2 0v0q-10 -10 -11 -24q-1 -1 -1 -3q0 -14 6 -27v0q-1 -1 -1 -2q3 -11 9.5 -20t15.5 -14 l1 -1q7 -10 28 -12q5 9 7 12q-14 4 -28 10zM94 140q-16 -14 -25 -32q-1 -2 -2 -5q-3 -7 -6 -16q-6 -17 -5 -27q0 -1 1 -2v0l-6 -16v-2q-4 -6 -10.5 -8.5t-12.5 -7.5q-1 -2 1 -3h1h3q21 0 26 10v0q3 1 4 3q4 4 7 16t0 17v1q1 1 1 2l7 29q4 3 8 7v1q2 17 8 33zM64 147l-1 -1 q-3 -2 -4 -4v-1q-9 -4 -16 -10q-12 -11 -12 -25v-1q-7 -11 -10 -24q0 -2 1 -4q-8 -9 -14 -16q-1 -1 -0.5 -1.5l1.5 -1.5v0q5 0 14 5.5t10 13.5q2 2 1 5q3 13 10 25q1 1 2 3q9 13 22 23q12 5 26 9l5 13q-19 2 -35 -8zM119 181q-8 -12 -15 -27q-11 -26 -13 -48q-1 -12 3 -23 t12.5 -20t20 -14t23.5 -5v0q12 0 23.5 5t20 14t12 20.5t2.5 23.5q-2 32 -26 73l-1 2q1 3 0 7t-4 7q-2 19 -9 35q-3 6 -8 6t-7.5 -3t-2.5 -7l-1 -12v1v11q0 3 -2 6t-5.5 3.5t-6.5 -1t-4 -4.5q-8 -17 -9 -37v-1q-2 -2 -3 -5t0 -7zM177 115q-9 -11 -23 -11h-8q-14 0 -23.5 12 t-4.5 33q3 12 12 25q9 -3 20 -3v0q10 0 20 3q8 -12 12 -25q5 -21 -5 -34z'    
    },
    mosquito: {
        key: 'mosquito',
        value: '',
        name: 'Mosquito',
        groupKey: 'vectors',
        cytoscapeShape: 'round-rectangle',
        width: 344,
        height: 300,
        viewBox: '0 0 344 300',
        fillPath: `M139 130h-1q-17 -7 -31.5 -12t-30.5 -9q-9 -1 -17 -2t-17.5 -1t-18.5 3.5t-15 9t-7.5 15t5.5 17.5q6 6 14 8l120 22q1 0 1 1l3 10l-1 2q-7 3 -13 8q-9 7 -11 19l-1 10q-1 9 -4.5 18.5t-10.5 17.5t-15 14t-16 11q-2 1 -2.5 3t1.5 4t5 0v0q12 -8 24 -18q8 -7 15 -17t9 -23
l2 -12q1 -4 2 -9q2 -7 7.5 -11.5t11.5 -6.5v0l2 3l-1 2q-4 7 -3 15t6 13.5t12 7.5l4 1v48h9v-48h1q4 -1 7.5 -2.5t6.5 -4.5q7 -6 8 -15t-3 -16l1 -5h1q6 3 10.5 6.5t6.5 7.5t3 8l1 10q1 13 6 23t12 18t15 14t16 11q3 2 5 0.5t2 -3.5t-2 -3l-2 -2q-11 -7 -21 -15
q-8 -7 -14 -16t-8 -20l-1 -12q-1 -6 -2 -11q-3 -9 -9.5 -14.5t-13.5 -8.5h-2l3 -12q0 -1 1 -1l112 -21q5 0 10 -2q7 -2 12 -7.5t5.5 -13.5t-4 -14.5t-11 -10.5t-15 -5.5t-18.5 -1.5q-12 1 -25 4q-16 3 -31.5 8t-32.5 12h-1v0v-2v-1l5 -3q13 -11 20 -26q4 -9 7 -18l5 -18
q2 -7 5 -15q7 -13 18 -21q9 -7 20 -12q8 -3 14 -5h1q3 -2 2 -5.5t-5 -2.5l-4 2q-10 3 -20 8t-18.5 13t-13.5 17.5t-7 18.5l-5 17q-3 8 -6 15q-6 14 -18 25h-1l-3 -23q-2 -9 -5 -23t-8 -27q-2 -6 -5 -12l-4 -5l-6 -6v-1l-7 8q-3 4 -5 9q-4 8 -7 17q-5 14 -8 30l-4 20l-1 13
h-1q-10 -9 -15.5 -18.5t-8.5 -19.5l-5 -19q-3 -8 -6 -17q-8 -15 -21 -25q-10 -7 -21 -11q-7 -3 -15 -6h-2q-3 1 -3.5 4t2.5 4l5 2q12 4 24 11q6 4 12 9q7 8 11 17t7 17l5 18q3 10 8 20q8 14 20 23l2 2v1v1v1z`,
        path: `M139 130h-1q-17 -7 -31.5 -12t-30.5 -9q-9 -1 -17 -2t-17.5 -1t-18.5 3.5t-15 9t-7.5 15t5.5 17.5q6 6 14 8l120 22q1 0 1 1l3 10l-1 2q-7 3 -13 8q-9 7 -11 19l-1 10q-1 9 -4.5 18.5t-10.5 17.5t-15 14t-16 11q-2 1 -2.5 3t1.5 4t5 0v0q12 -8 24 -18q8 -7 15 -17t9 -23
l2 -12q1 -4 2 -9q2 -7 7.5 -11.5t11.5 -6.5v0l2 3l-1 2q-4 7 -3 15t6 13.5t12 7.5l4 1v48h9v-48h1q4 -1 7.5 -2.5t6.5 -4.5q7 -6 8 -15t-3 -16l1 -5h1q6 3 10.5 6.5t6.5 7.5t3 8l1 10q1 13 6 23t12 18t15 14t16 11q3 2 5 0.5t2 -3.5t-2 -3l-2 -2q-11 -7 -21 -15
q-8 -7 -14 -16t-8 -20l-1 -12q-1 -6 -2 -11q-3 -9 -9.5 -14.5t-13.5 -8.5h-2l3 -12q0 -1 1 -1l112 -21q5 0 10 -2q7 -2 12 -7.5t5.5 -13.5t-4 -14.5t-11 -10.5t-15 -5.5t-18.5 -1.5q-12 1 -25 4q-16 3 -31.5 8t-32.5 12h-1v0v-2v-1l5 -3q13 -11 20 -26q4 -9 7 -18l5 -18
q2 -7 5 -15q7 -13 18 -21q9 -7 20 -12q8 -3 14 -5h1q3 -2 2 -5.5t-5 -2.5l-4 2q-10 3 -20 8t-18.5 13t-13.5 17.5t-7 18.5l-5 17q-3 8 -6 15q-6 14 -18 25h-1l-3 -23q-2 -9 -5 -23t-8 -27q-2 -6 -5 -12l-4 -5l-6 -6v-1l-7 8q-3 4 -5 9q-4 8 -7 17q-5 14 -8 30l-4 20l-1 13
h-1q-10 -9 -15.5 -18.5t-8.5 -19.5l-5 -19q-3 -8 -6 -17q-8 -15 -21 -25q-10 -7 -21 -11q-7 -3 -15 -6h-2q-3 1 -3.5 4t2.5 4l5 2q12 4 24 11q6 4 12 9q7 8 11 17t7 17l5 18q3 10 8 20q8 14 20 23l2 2v1v1v1zM147 142v-1v-10q0 -5 2 -13l6 -35q3 -16 7 -28q2 -8 6 -16l3 -5
l1 -2q2 1 3 3l3 6l6 16q3 12 6 26l4 19l3 24l1 16l4 -2q24 -10 42 -15q14 -5 29 -8q9 -2 16 -3h12q7 0 14 1.5t12.5 5.5t7.5 9t1 9t-3 6t-5 4q-4 2 -9 3l-122 22l-0.5 1.5t-0.5 2.5l-4 15q-2 6 -6 11l-1 1l2 3q4 4 4.5 10t-4 11t-10.5 6.5t-13 -1t-10 -9.5t1 -14q2 -3 4 -5
l1 -1l-3 -4q-3 -5 -5 -11l-3 -15l-1 -1l-120 -22q-4 0 -8.5 -1.5t-8 -5.5t-3 -10t5 -10.5t9.5 -6.5q10 -4 20 -4t20.5 1.5t20.5 3.5q14 4 31 10q12 5 30 12z`    
    },
    bat: {
        key: 'bat',
        value: '',
        name: 'Bat',
        groupKey: 'animals',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M262 231q-14 4 -27 0q-8 0 -8 1t2 2t1.5 2t-3 1t-5.5 -1q-10 -10 -15 -23q-4 -10 -14.5 -17.5t-22.5 -10.5q-5 -2 -9 -2t-6 1.5t-2 2.5q1 4 1 7l2 12l-4 -2q-2 -2 -3 -6l-2 -4h-1l-6 2q-9 0 -17 -2l-4 3q-7 3 -15 5l1 -2q6 -5 10 -12q-1 -3 -1 -7t2 -8l-6 -4v-1 q-2 -2 -5 -2.5t-13.5 1.5t-17.5 7q-4 3 -5 5.5t-9 10t-10.5 8t-2 -1t3 -3.5t0.5 -5l-4 -4q-10 -6 -16 -11q-13 -14 -21 -31q-4 -18 -2 -35q3 -13 10 -25l-4 13q0 9 2 18q4 7 11 8q2 0 7 -4l4 -4q0 4 3 9q1 1 7 1t9 -1q9 -6 18 -10q7 0 14.5 -1.5t14.5 -4.5q2 -1 4.5 -1h3.5 l17 -7q3 -2 5.5 -5t1.5 -7q2 -9 8 -16q1 -1 2 0.5t1 2.5q-2 5 -2 10l1.5 1t3.5 1t13 -15l10 -14l-2 12q1 12 7 22q2 2 4.5 1.5t4.5 -2.5q3 -6 10 -8q2 0 0 3v0q-4 7 -7 14q0 5 3 10l8 14q11 16 25 30q10 7 21 11v5q0 4 2 10l3 8q5 12 17 17q2 0 6 -2l3 -2l1 4q1 4 3 4 q5 -1 10 -4l-9 17q-3 5 -21 11z'    
    },
    rodent: {
        key: 'rodent',
        value: '',
        name: 'Rodent',
        groupKey: 'animals',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M 236.625 234.156 229.779 226.716 227.415 219.695 224.048 226.327 220.388 231.277 217.018 233.687 214.521 232.696 210.194 223.882 207.788 214.847 207.287 206.332 208.672 199.079 205.771 197.578 202.942 195.99 195.872 200.187 188.005 204.146 179.439 207.786 170.272 211.025 160.599 213.782 150.519 215.975 140.128 217.523 129.523 218.343 118.802 218.355 108.061 217.477 97.397 215.627 88.464 212.958 80.093 209.151 72.386 204.353 65.442 198.716 59.362 192.39 54.246 185.523 50.195 178.267 47.307 170.77 45.685 163.183 45.427 155.656 46.635 148.338 49.409 141.38 44.9 140.454 35.737 137.84 28.268 134.885 21.137 131.033 14.479 126.076 8.74 119.638 4.895 111.503 4 102.5 4.672 98.147 10.567 86.448 16.54 80.984 23.159 77.067 40.469 70.78 51.026 68.419 61.396 66.878 71.546 66.055 81.443 65.844 91.054 66.142 100.349 66.845 109.293 67.85 117.855 69.051 138.877 72.371 150.854 74.172 161.892 75.701 171.948 76.911 180.982 77.754 188.953 78.182 198.785 78.127 205.907 77.382 210.304 76.663 211.961 76.682 199.225 81.653 189.032 82.832 180.799 83.103 171.511 82.925 161.222 82.349 149.982 81.422 137.842 80.194 124.852 78.715 114.576 77.488 103.972 76.469 92.981 75.847 81.547 75.812 72.177 76.271 62.594 77.203 52.93 78.752 43.316 81.063 33.881 84.28 23.208 90.085 16.634 98.036 15.471 103.29 16.061 108.318 22.276 117.333 29.851 122.392 38.636 126.321 48.234 129.071 58.251 130.594 59.22 129.793 65.957 122.861 73.366 116.749 81.418 111.533 90.083 107.289 99.33 104.096 103.133 103.638 106.541 104.283 109.332 105.832 111.284 108.082 114.3 106.945 122.444 110.525 124.633 118.502 124.053 120.731 133.125 120.811 142.243 121.028 151.303 121.372 160.204 121.828 165.382 116.079 171.091 110.83 177.322 106.122 184.065 101.992 188.665 100.543 192.93 100.938 196.304 102.871 198.227 106.038 198.609 108.594 198.364 111.074 197.561 113.395 196.268 115.474 201.922 113.814 207.705 112.565 213.607 111.737 219.614 111.346 224.371 112.15 227.987 114.442 230.106 117.697 230.37 121.392 228.984 124.842 226.585 127.506 223.479 129.244 219.969 129.923 216.937 130.08 222.404 133.234 227.609 136.88 232.708 140.74 237.855 144.541 247.105 149.647 256.763 152.973 266.714 155.565 276.844 158.469 284.507 161.06 291.385 165.098 296 171.183 295.744 173.91 293.189 176.453 285.79 181.535 278.592 186.893 271.366 192.178 263.881 197.045 255.908 201.148 249.641 203.461 248.779 212.672 245.538 222.012 241.095 229.75 236.625 234.156 Z'
    },
    pig: {
        key: 'pig',
        value: '',
        name: 'Pig',
        groupKey: 'animals',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M23 183v2q-3 -4 -7.5 -4t-7 4t-0.5 7.5t7 3.5t8 -4q0 5 -3.5 8t0 2t4.5 -4t1 -5v-4l1 -2v1q3 6 8 10q23 22 54 23q61 5 120 -9q43 -12 59 -33q7 1 11 7q3 3 4 1.5t0.5 -4.5t-1.5 -5t-4 -4l4 3l4 5l2 1h1q2 -1 3 -4l-1 -4q-1 -4 -4 -7l-1 -1q-5 -5 -12 -8q-1 -8 2 -15 q5 -7 13 -11l1 1q1 0 2 -0.5t1 -2.5v-3q-1 -4 -2.5 -6t-3 -3.5t-3.5 -1.5h-14l-6 1q-29 -8 -57 0v0q-4 -18 -1 -36l4 -5l1 -2v-2.5t-2 -1.5l-2 -1l-6 1q-2 0 -3 1t-2 3l-1 2h-1q-2 2 -2 4v4q1 7 -4 14l-1 2q-1 -8 -1 -17q4 -4 6 -9q0 -2 -1.5 -2.5t-5 -0.5t-6 2t-3.5 5 q-3 1 -2 8q1 16 -5 30l-7 1q-46 -12 -93 0q-2 -7 -2 -14q2 -11 8 -21q2 -1 4 -3t1.5 -5t-8 -2t-8.5 4t-2 4l-4 3q-2 2 -2 4l-2 9q-2 8 -5 15q-4 -3 -7 -7l-1 -2q-2 -12 2 -23l6 -4l1 -3q1 -1 0 -2l-1 -1l-2 -1q-5 -1 -10 0q-1 1 -3 2l-1 1l-2 3v1q-2 -1 -4 3v0q-2 5 -1 10v0 v5.5t-1.5 5.5t-1.5 7v1q0 5 3 10l5 9v1q-1 5 -3 10v1q-4 7 -5 15q-2 5 -2 11t1 11zM21 188q-2 4 -6 5q-2 0 -3 -2t0.5 -4t4 -1.5t4.5 2.5z'    
    },
    cow: {
        key: 'cow',
        value: '',
        name: 'Cow',
        groupKey: 'animals',
        cytoscapeShape: 'round-rectangle',
        width: 375,
        height: 300,
        viewBox: '0 0 375 300',
        path: `M371 138l-5 8v45q0 5 -4.5 8t-9.5 0q-9 -4 -15 -13l-39 53q-8 11 -20 17t-25 6h-187q-22 1 -37 -14.5t-15 -36.5v-51q-14 -11 -14 -29v-18h5q15 0 26 10.5t11 26.5v61q0 7 4 13t11 9q-1 -4 -1 -8v-178q0 -4 3 -6.5t7 -2.5h37q4 0 7 2.5t3 6.5v66q7 -8 18 -13v-16 q0 -4 3 -6.5t7 -2.5t6.5 2.5t2.5 6.5v11l2 -1q7 -1 17 1v-11q0 -4 2.5 -6.5t6.5 -2.5t7 2.5t3 6.5v16q10 5 18 12v-65q0 -4 3 -6.5t7 -2.5h37q4 0 6.5 2.5t2.5 6.5v103l19 -19v-24q0 -11 7 -21l24 -36q8 -13 23 -13q10 1 17.5 7t9.5 16l13 63q1 8 -4 15zM221 202l-13 -13 q-20 -20 -49 -20v0q-28 0 -48 20l-13 13q-7 7 -2.5 15t15.5 8h97q11 0 15.5 -8t-2.5 -15zM338 94q-4 0 -7 2.5t-3 6.5t3 7t6.5 3t6.5 -3t3 -7t-3 -6.5t-6 -2.5z`
    },
    chicken: {
        key: 'chicken',
        value: '',
        name: 'Chicken',
        groupKey: 'animals',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: `M 152.337 12.9568 C 155.282 13.5306 157.787 14.1108 160.292 14.6911 C 157.923 15.6649 155.63 16.9696 153.168 17.5307 C 149.94 18.2663 146.506 18.1323 143.305 18.9435 C 141.842 19.3143 139.708 20.9849 139.631 22.1786 C 139.334 26.8016 139.708 31.4717 139.935 36.1193 C 139.961 36.6481 140.527 37.309 141.023 37.6325 C 147.052 41.5658 153.114 45.4473 159.044 49.2623 C 162.594 47.6102 166.765 45.738 170.856 43.7045 C 171.633 43.3185 172.369 42.3873 172.652 41.5484 C 174.406 36.3584 176.301 31.186 177.521 25.8637 C 177.884 24.2776 176.542 21.9975 175.402 20.4653 C 174.481 19.2267 172.569 18.7744 171.34 17.695 C 170.733 17.1612 170.244 15.8331 170.499 15.1711 C 170.733 14.5632 172.397 13.8042 172.816 14.0725 C 181.185 19.4269 187.598 13.5315 194.496 10.4475 C 195.102 10.1765 195.738 9.72894 196.344 9.75281 C 197.499 9.79826 198.642 10.1251 199.791 10.3352 C 199.311 11.4273 199.079 12.7685 198.291 13.5495 C 197.271 14.5615 195.807 15.127 193.354 16.5874 C 197.555 16.5874 200.539 16.4007 203.479 16.6788 C 204.664 16.7908 205.752 17.921 206.884 18.5878 C 205.769 19.3675 204.733 20.6402 203.524 20.8352 C 199.75 21.4436 195.917 21.7369 192.095 21.9788 C 187.755 22.2536 185.115 24.2353 183.938 28.5726 C 182.505 33.851 180.65 39.0147 179.354 43.0566 C 182.62 48.4737 185.22 53.3768 188.42 57.8513 C 190.074 60.164 192.662 61.9008 195.051 63.5798 C 206.179 71.3989 218.513 77.9019 228.329 87.1023 C 249.635 107.073 255.867 133.083 253.433 161.444 C 252.124 176.695 250.092 191.883 248.496 207.111 C 248.207 209.867 248.455 212.679 248.455 216.102 C 252.819 212.223 257.154 211.497 261.575 215.071 C 267.016 219.47 268.448 225.029 265.548 233.02 C 271.463 231.739 276.468 230.655 281.996 229.457 C 282.379 235.914 278.446 239.997 274.02 243.703 C 277.39 249.675 276.487 259.124 272.008 263.19 C 271.24 263.887 269.462 263.473 267.693 263.608 C 267.51 264.791 267.418 266.438 266.968 267.981 C 266.577 269.318 265.781 270.536 264.834 272.484 C 263.184 270.527 262.065 269.2 260.79 267.688 C 259.59 270.526 258.584 273.339 257.202 275.953 C 256.667 276.965 255.279 277.527 254.281 278.294 C 253.568 277.274 252.66 276.336 252.194 275.214 C 251.648 273.898 251.486 272.422 251.124 270.868 C 247.391 274.705 243.953 278.239 240.515 281.772 C 239.909 281.422 239.302 281.071 238.695 280.72 C 239.059 277.774 239.423 274.827 239.837 271.478 C 237.26 272.832 234.961 274.292 232.477 275.291 C 227.766 277.185 225.665 275.911 224.803 270.98 C 223.628 264.257 225.662 259.983 232.2 256.219 C 214.188 248.075 207.483 231.398 200.033 215.232 C 197.047 208.753 193.92 202.306 190.351 196.137 C 181.409 180.682 167.427 174.229 149.868 177.316 C 144.661 178.232 139.429 179.382 134.439 181.095 C 115.201 187.697 105.017 201.873 103.342 221.61 C 102.463 231.965 103.94 242.522 104.399 252.986 C 104.501 255.309 104.955 257.622 104.972 259.941 C 105.035 268.559 100.471 271.989 92.8679 267.903 C 87.5465 265.043 83.3268 260.134 78.7643 256.266 C 75.0766 262.188 69.7119 263.256 64.0514 256.893 C 60.1231 252.477 57.8289 246.607 54.5628 240.97 C 49.7875 241.754 45.9623 240.467 43.6499 234.745 C 41.2142 228.717 40.1106 222.152 38.3072 215.379 C 33.1801 214.759 30.9078 212.433 29.9151 205.962 C 28.7769 198.543 29.2486 191.374 32.9188 184.668 C 22.9665 176.784 23.3631 170.417 34.7757 153.92 C 29.4842 149.984 28.149 147.034 31.0324 140.784 C 33.5176 135.397 37.4103 130.66 41.2073 124.826 C 36.7595 114.641 38.5047 109.472 49.9879 102.643 C 51.4111 101.797 52.8492 100.619 54.3958 100.396 C 62.9972 99.1579 66.5492 92.8988 70.4493 86.0937 C 81.8642 66.1766 98.715 52.9383 121.023 46.6369 C 124.218 45.7344 126.489 41.9282 129.647 40.4381 C 134.311 38.2369 132.81 34.516 132.898 31.0961 C 132.945 29.2665 132.715 27.4284 132.787 25.6011 C 132.974 20.8257 131.378 17.2897 126.76 15.1516 C 125.559 14.5953 125.056 12.5297 124.233 11.1574 C 125.731 11.1564 127.472 10.6565 128.682 11.246 C 132.628 13.1686 136.241 13.0439 140.026 10.8564 C 142.895 9.19857 145.899 7.70325 148.996 6.54635 C 150.218 6.08998 151.856 6.74788 153.304 6.8984 C 152.601 8.05681 152.043 9.34634 151.15 10.3326 C 150.423 11.1356 149.294 11.5755 147.099 12.9633 C 149.556 12.9633 150.726 12.9633 152.337 12.9568 Z`
    },
    bird: {
        key: 'bird',
        value: '',
        name: 'Bird',
        groupKey: 'animals',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: `M187 171q3 9 5.5 13.5t5.5 7.5l5 5q3 4 7 7l5 5q7 5 11.5 6t10 0.5t9.5 -3t7 -6t5 -3.5l6 -3q10 -5 14.5 -6t5.5 -2.5t-1.5 -2t-17.5 0.5l-14 2l-11 -3h-3q-8 -1 -13 -4l-5 -3q-4 -2 -5.5 -3.5t-2.5 -5t-1 -12.5l-1 -11q-1 -6 -3.5 -16t-5.5 -17.5t-9 -15.5t-13 -13q-13 -11 -29 -19q-21 -12 -31 -14q-5 -2 -14 -3l-9 -1l-4 -9q-2 -5 -8 -13l-11 -15l-1 -3q-4 -1 -5 -1l-1 1q-3 1 -3 2v10v3l3 3q10 12 12 14l3 4l-3 -1q-5 -1 -10 -1h-6q-10 1 -11 0l-6 -1l4 5l-1 1q-2 1 -3 2l-1 3l3 -1q3 -1 4.5 -0.5t2.5 1.5l1 1l-2 1q-3 1 -3.5 3t0.5 3v0l2 -1q2 -2 3 -2h2v3q1 3 4 6l5 6q7 7 11 13q12 16 22 23l12 6l5 3l-5 -2q-6 -1 -10 0q-8 0 -7 2l2 1h-4q-3 0 -3 1l6 10l-4 -1q-4 -1 -4 1v3l-2 1q-2 1 -2 2l1 3l-2 1l-2 1v4h-1h-1v2l-1 1q-1 0 -1 1l1 2l-1 1q-2 0 -2 1t1 1v1l-1 1q-1 2 -1 3l2 2l-1 1q-1 1 -1 2l2 2l-1 1l-1 2l2 4l-1 1q-1 0 -1 1l1 1l-2 1l-3 3t-1 2l1 1l-4 5v1h1l-5 7q-1 1 0 1h1l-3 5q-1 2 1 1h4l-3 3q-2 4 -1.5 4.5t2.5 -0.5l2 -1l-3 3q-2 3 -1.5 4t4.5 -1l4 -2l-3 4q-2 5 -1.5 5.5t4.5 -2.5l5 -3l-2 5q-2 6 -1 6.5t6 -6.5l3 -3l5 -5l-3 11l-1 5q1 1 2.5 -1t3.5 -8l2 -3l2 8q0 2 2 3.5t2 -1.5l-1 -4q0 -7 1 -10.5t3 -8.5l6 -11l1 5l1 2l-2 7q-1 2 -1 3.5t1 1.5l1 -1l-1 4q-1 4 -0.5 5t1.5 1v0v6q-1 5 -0.5 6t2.5 1l1 -1l-1 6q-1 6 1 6t4 -1l2 -1l-1 11q0 2 1 2.5t3 -0.5l4 -3v8q0 9 2.5 7t5.5 -5l3 -4v5q-1 4 0 7q1 11 4 7l2 -5l2 -2l3 -2l3 17q1 1 1 -1l2 -5q1 -4 1 -5l3 -2l1 7q2 6 4 6.5t3 -10.5l1 -4l3 8q3 7 4.5 6t1.5 -4t-1.5 -7t-2 -13t-0.5 -14t2 -18l1 -6q3 -17 2 -22q0 -2 1 -9t1 -11q-1 -9 0 -20l2 -13l4 3q4 4 5 7.5t3 6.5z`
    },
    pet: {
        key: 'pet',
        value: '',
        name: 'Pet',
        groupKey: 'animals',
        cytoscapeShape: 'round-rectangle',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: 'M150 169q-22 0 -49 -20t-45 -47.5t-18 -50.5q0 -15 11 -23.5t31 -8.5q10 0 20 2q7 2 19 6l15 4q9 2 16 2t16 -2l16 -4q11 -4 18 -6q11 -2 20 -2q20 0 31.5 8.5t11.5 23.5q0 23 -18.5 50.5t-45.5 47.5t-49 20zM64 176q-5 15 -17 24t-25 5.5t-19 -16t-1.5 -28t17 -24 t25.5 -5.5t18.5 16t1.5 28zM113 188q14 4 20 20t0.5 35t-18.5 30t-26.5 7.5t-19.5 -19.5t-1 -35t18.5 -30t26.5 -8zM278 206q-13 3 -25 -6t-16.5 -24t1 -28t18.5 -16t25.5 5.5t17 24t-1.5 28t-19 16.5zM187 188q13 -3 26.5 8t18.5 30t-1 35t-19.5 19.5t-26.5 -7.5t-18.5 -30 t0.5 -35t20 -20z'
    },
    food: {
        key: 'food',
        value: '',
        name: 'Food',
        groupKey: 'other',
        cytoscapeShape: 'square',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: `M287 34q5 -6 5 -14t-5.5 -13.5t-13.5 -6t-14 4.5l-107 108q-9 -9 -21.5 -9t-20.5 9l-50 49q-26 25 -39.5 58.5t-12.5 68.5q-1 4 1 6.5t4.5 3.5t5.5 0.5t5 -2.5zM226 297q3 3 7.5 3t7.5 -3t3 -7.5t-3 -6.5l-52 -52q-3 -3 -3 -7t3 -7t7 -3t7 3l52 51q4 5 10 3.5t7.5 -7.5
t-3.5 -10l-51 -51q-3 -3 -3 -7.5t3 -7t7 -2.5t7 2l51 52q4 4 9.5 2.5t7 -7t-2.5 -9.5l-66 -66q-8 -9 -20.5 -9t-21.5 9l-28 28q-9 9 -9 21.5t9 21.5zM34 5q-6 -5 -14 -4.5t-13.5 6t-5.5 13.5t5 14l77 77l12 -13q8 -8 19 -12z`    
    },
    apple: {
        key: 'apple',
        value: '',
        name: 'Apple',
        groupKey: 'other',
        cytoscapeShape: 'round-rectangle',
        width: 262,
        height: 300,
        viewBox: '0 0 262 300',
        path: `M206 224q22 -4 37 -24q13 -18 18 -46q4 -25 -1 -50q-7 -42 -28 -70q-25 -34 -63 -34q-10 0 -21 6q-7 5 -16.5 5t-17.5 -5q-11 -6 -20 -6q-38 0 -63 34q-21 28 -29 70q-4 25 0 50q5 28 17 46q15 20 38 24q14 3 39 -4q21 -6 35 -14q15 8 36 14q25 7 39 4zM173 248
q-8 -7 -21 -11q-10 -3 -21 -3l-9 1q-1 8 0 19q3 21 14 32q8 8 22 11q9 3 20 3l9 -1v-8q0 -11 -2 -21q-4 -13 -12 -22z`    
    },
    flask: {
        key: 'flask',
        value: '',
        name: 'Flask',
        groupKey: 'other',
        cytoscapeShape: 'round-rectangle',
        width: 262,
        height: 300,
        viewBox: '0 0 262 300',
        path: 'M256 64l-68 110v89h4q6 0 10 4t4 10v9q0 6 -4 10t-10 4h-122q-6 0 -10 -4t-4 -10v-9q0 -6 4 -10t10 -4h5v-89l-69 -110q-8 -14 -5.5 -29t14 -25t27.5 -10h179q16 0 27 10t14 25t-6 29zM81 113l28 45q3 5 3 11v94h38v-94q0 -6 3 -11l29 -45h-101z'    
    },
    syringe: {
        key: 'syringe',
        value: '',
        name: 'Syringe',
        groupKey: 'other',
        cytoscapeShape: 'square',
        width: 300,
        height: 300,
        viewBox: '0 0 300 300',
        path: `M118 198l33 -33q1 -1 1 -3t-1 -4l-7 -6q-1 -2 -3 -2t-4 2l-32 32l-27 -26l33 -33q1 -1 1 -3t-1 -4l-7 -6q-1 -2 -3 -2t-3 2l-33 33l-15 -16q-8 -7 -11.5 -17t-2.5 -21l4 -37l-39 -39q-1 -2 -1 -4t1 -3l7 -7q1 -1 3 -1t4 1l38 39l38 -4q10 -1 20 2.5t18 11.5l107 106
l-80 80zM299 252l-47 47q-1 1 -3 1t-3 -1l-7 -7q-1 -1 -1 -3t1 -4l17 -16l-27 -27l-43 43q-1 2 -3 2t-4 -2l-20 -19q-1 -2 -1 -4t1 -3l100 -100q1 -1 3 -1t3 1l20 20q2 2 2 4t-2 3l-43 43l27 27l16 -17q2 -1 4 -1t3 1l7 7q1 1 1 3t-1 3z`    
    },
};

export const CUSTOM_NODE_SYMBOL_OPTIONS: NodeShapeOption[] = Object.values(CUSTOM_NODE_SHAPE_DEFINITIONS)
    .map(({ key, value, name, groupKey }) => ({ key, value, name, groupKey }));

export const NODE_SYMBOL_OPTIONS: NodeShapeOption[] = [
    ...BASIC_NODE_SYMBOL_OPTIONS,
    ...CUSTOM_NODE_SYMBOL_OPTIONS,
];

const SUPPORTED_NODE_SHAPE_KEYS = new Set(NODE_SYMBOL_OPTIONS.map(({ key }) => key));

const LEGACY_NODE_SHAPE_KEY_MAP: Record<string, string> = {
    symbolCircle: 'ellipse',
    symbolTriangle: 'triangle',
    symbolTriangleDown: 'triangle',
    symbolSquare: 'rectangle',
    square: 'rectangle',
    symbolDiamond: 'rhomboid',
    symbolDiamondAlt: 'rhomboid',
    symbolDiamondSquare: 'diamond',
    symbolOctagonAlt: 'heptagon',
    symbolHexagonAlt: 'heptagon',
    symbolPentagon: 'pentagon',
    symbolHexagon: 'hexagon',
    symbolCross: 'barrel',
    symbolOctagon: 'octagon',
    symbolStar: 'star',
    symbolTriangleLeft: 'tag',
    symbolTriangleRight: 'tag',
    symbolX: 'vee',
    symbolWye: 'vee',
    mosiquito: 'mosquito',
};

interface NodeShapeStyleMapping {
    nodeSymbolsTable?: Record<string, any>;
    nodeSymbolsTableKeys?: Record<string, any>;
}

export function normalizeNodeShapeKey(shapeKey: string | null | undefined): string | null {
    if (!shapeKey) {
        return null;
    }

    if (SUPPORTED_NODE_SHAPE_KEYS.has(shapeKey)) {
        return shapeKey;
    }

    const legacyShapeKey = LEGACY_NODE_SHAPE_KEY_MAP[shapeKey];
    if (legacyShapeKey && SUPPORTED_NODE_SHAPE_KEYS.has(legacyShapeKey)) {
        return legacyShapeKey;
    }

    return null;
}

export function resolveNodeShapeKey(shapeKey: string | null | undefined, fallbackShapeKey: string = DEFAULT_NODE_SHAPE_KEY): string {
    return normalizeNodeShapeKey(shapeKey) ?? fallbackShapeKey;
}

export function resolveNodeShapeForNode(
    node: any,
    widgets: Record<string, any> | null | undefined,
    style: NodeShapeStyleMapping | null | undefined,
    nodeSymbolMap?: ((value: any) => string) | null
): string {
    const defaultShape = resolveNodeShapeKey(widgets?.['node-symbol']);
    const symbolVariable = widgets?.['node-symbol-variable'];

    if (!node || !symbolVariable || symbolVariable === 'None') {
        return defaultShape;
    }

    const nodeValue = node[symbolVariable];
    const tableKeys = style?.nodeSymbolsTableKeys?.[symbolVariable];
    const tableShapes = style?.nodeSymbolsTable?.[symbolVariable];

    if (Array.isArray(tableKeys) && Array.isArray(tableShapes)) {
        const tableIndex = tableKeys.findIndex(value => value === nodeValue || `${value}` === `${nodeValue}`);
        if (tableIndex >= 0 && tableIndex < tableShapes.length) {
            return resolveNodeShapeKey(tableShapes[tableIndex], defaultShape);
        }
    }

    if (nodeSymbolMap) {
        return resolveNodeShapeKey(nodeSymbolMap(nodeValue), defaultShape);
    }

    return defaultShape;
}

export function isCustomNodeShape(shapeKey: string | null | undefined): boolean {
    const normalizedShapeKey = normalizeNodeShapeKey(shapeKey);
    return normalizedShapeKey !== null && normalizedShapeKey in CUSTOM_NODE_SHAPE_DEFINITIONS;
}

export function resolveNodeShapeCytoscapeShape(shapeKey: string): string {
    const normalizedShapeKey = resolveNodeShapeKey(shapeKey);
    if (!isCustomNodeShape(normalizedShapeKey)) {
        return normalizedShapeKey;
    }

    return CUSTOM_NODE_SHAPE_DEFINITIONS[normalizedShapeKey].cytoscapeShape;
}

function sanitizeSvgColor(color: string | null | undefined): string {
    return (color || '#000000').replace(/"/g, '&quot;');
}

function buildPaddedViewBox(viewBox: string, padding: number): string {
    const dimensions = viewBox.trim().split(/\s+/).map(value => Number(value));
    if (dimensions.length !== 4 || dimensions.some(value => Number.isNaN(value))) {
        return viewBox;
    }

    const [minX, minY, width, height] = dimensions;
    return `${minX - padding} ${minY - padding} ${width + (padding * 2)} ${height + (padding * 2)}`;
}

function buildCustomNodeShapeDataUri(
    definition: CustomNodeShapeDefinition,
    fillColor: string,
    strokeColor: string,
    strokeWidth: number,
    viewBoxPadding: number = 0,
    intrinsicCanvasSize?: { width: number; height: number }
): string {
    const safeFill = sanitizeSvgColor(fillColor);
    const safeStroke = sanitizeSvgColor(strokeColor);
    const svgWidth = intrinsicCanvasSize?.width ?? definition.width;
    const svgHeight = intrinsicCanvasSize?.height ?? definition.height;
    const fillPath = `<path d="${definition.fillPath ?? definition.path}" fill="${safeFill}" stroke="none"/>`;
    const outlinePath = `<path d="${definition.path}" fill="none" stroke="${safeStroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const svg = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="${buildPaddedViewBox(definition.viewBox, viewBoxPadding)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g transform="translate(0,${definition.height}) scale(1,-1)">${fillPath}${outlinePath}</g></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildEllipseNodeShapeDataUri(
    fillColor: string,
    strokeColor: string,
    strokeWidth: number,
    viewBoxPadding: number = Math.max(20, strokeWidth)
): string {
    const safeFill = sanitizeSvgColor(fillColor);
    const safeStroke = sanitizeSvgColor(strokeColor);
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="${buildPaddedViewBox('0 0 300 300', viewBoxPadding)}" aria-hidden="true"><circle cx="150" cy="150" r="110" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function roundSvgCoordinate(value: number): number {
    return Number(value.toFixed(2));
}

function createNodeShapePoint(x: number, y: number): NodeShapePoint {
    return [roundSvgCoordinate(x), roundSvgCoordinate(y)];
}

function buildClosedPath(points: NodeShapePoint[]): string {
    if (!points.length) {
        return '';
    }

    const [firstPoint, ...remainingPoints] = points;
    const pathSegments = [`M ${firstPoint[0]} ${firstPoint[1]}`];
    for (const [x, y] of remainingPoints) {
        pathSegments.push(`L ${x} ${y}`);
    }

    pathSegments.push('Z');
    return pathSegments.join(' ');
}

function buildRegularPolygonPath(sides: number, radius: number = MAP_NODE_SHAPE_RADIUS, rotationRadians: number = -Math.PI / 2): string {
    const points: NodeShapePoint[] = [];
    for (let index = 0; index < sides; index++) {
        const angle = rotationRadians + ((Math.PI * 2 * index) / sides);
        points.push(createNodeShapePoint(
            MAP_NODE_SHAPE_CENTER + (radius * Math.cos(angle)),
            MAP_NODE_SHAPE_CENTER + (radius * Math.sin(angle))
        ));
    }

    return buildClosedPath(points);
}

function buildStarPath(points: number = 5, outerRadius: number = 112, innerRadius: number = 48, rotationRadians: number = -Math.PI / 2): string {
    const starPoints: NodeShapePoint[] = [];
    for (let index = 0; index < points * 2; index++) {
        const angle = rotationRadians + ((Math.PI * index) / points);
        const radius = index % 2 === 0 ? outerRadius : innerRadius;
        starPoints.push(createNodeShapePoint(
            MAP_NODE_SHAPE_CENTER + (radius * Math.cos(angle)),
            MAP_NODE_SHAPE_CENTER + (radius * Math.sin(angle))
        ));
    }

    return buildClosedPath(starPoints);
}

function buildBasicNodeShapePath(shapeKey: string): string | null {
    switch (shapeKey) {
        case 'triangle':
            return buildClosedPath([
                createNodeShapePoint(150, 35),
                createNodeShapePoint(262, 245),
                createNodeShapePoint(38, 245),
            ]);
        case 'rectangle':
            return buildClosedPath([
                createNodeShapePoint(50, 50),
                createNodeShapePoint(250, 50),
                createNodeShapePoint(250, 250),
                createNodeShapePoint(50, 250),
            ]);
        case 'rhomboid':
            return buildClosedPath([
                createNodeShapePoint(92, 45),
                createNodeShapePoint(255, 45),
                createNodeShapePoint(208, 255),
                createNodeShapePoint(45, 255),
            ]);
        case 'diamond':
            return buildClosedPath([
                createNodeShapePoint(150, 35),
                createNodeShapePoint(265, 150),
                createNodeShapePoint(150, 265),
                createNodeShapePoint(35, 150),
            ]);
        case 'pentagon':
            return buildRegularPolygonPath(5);
        case 'hexagon':
            return buildRegularPolygonPath(6);
        case 'heptagon':
            return buildRegularPolygonPath(7);
        case 'octagon':
            return buildRegularPolygonPath(8);
        case 'star':
            return buildStarPath();
        case 'tag':
            return buildClosedPath([
                createNodeShapePoint(40, 65),
                createNodeShapePoint(190, 65),
                createNodeShapePoint(260, 150),
                createNodeShapePoint(190, 235),
                createNodeShapePoint(40, 235),
            ]);
        case 'vee':
            return buildClosedPath([
                createNodeShapePoint(42, 60),
                createNodeShapePoint(105, 60),
                createNodeShapePoint(150, 155),
                createNodeShapePoint(195, 60),
                createNodeShapePoint(258, 60),
                createNodeShapePoint(173, 255),
                createNodeShapePoint(127, 255),
            ]);
        default:
            return null;
    }
}

function buildBarrelNodeShapeDataUri(
    fillColor: string,
    strokeColor: string,
    strokeWidth: number,
    viewBoxPadding: number = Math.max(20, strokeWidth)
): string {
    const safeFill = sanitizeSvgColor(fillColor);
    const safeStroke = sanitizeSvgColor(strokeColor);
    const barrelPath = 'M 90 45 C 60 45 45 82 45 150 C 45 218 60 255 90 255 L 210 255 C 240 255 255 218 255 150 C 255 82 240 45 210 45 Z';
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="${buildPaddedViewBox('0 0 300 300', viewBoxPadding)}" aria-hidden="true"><path d="${barrelPath}" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildBasicNodeShapeDataUri(
    shapeKey: string,
    fillColor: string,
    strokeColor: string,
    strokeWidth: number,
    viewBoxPadding: number = Math.max(20, strokeWidth)
): string | null {
    if (shapeKey === 'ellipse') {
        return buildEllipseNodeShapeDataUri(fillColor, strokeColor, strokeWidth, viewBoxPadding);
    }

    if (shapeKey === 'barrel') {
        return buildBarrelNodeShapeDataUri(fillColor, strokeColor, strokeWidth, viewBoxPadding);
    }

    const path = buildBasicNodeShapePath(shapeKey);
    if (!path) {
        return null;
    }

    const safeFill = sanitizeSvgColor(fillColor);
    const safeStroke = sanitizeSvgColor(strokeColor);
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="${buildPaddedViewBox('0 0 300 300', viewBoxPadding)}" aria-hidden="true"><path d="${path}" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function getMapNodeShapeDataUri(shapeKey: string, fillColor: string, strokeColor: string, strokeWidth: number): string {
    const normalizedShapeKey = resolveNodeShapeKey(shapeKey);
    if (isCustomNodeShape(normalizedShapeKey)) {
        const definition = CUSTOM_NODE_SHAPE_DEFINITIONS[normalizedShapeKey];
        const squareCanvasSize = Math.max(definition.width, definition.height);

        // Leaflet map markers are rendered into square icon boxes. Keeping the
        // intrinsic SVG canvas square prevents custom shapes from stretching in
        // raster export paths that rely on the marker image dimensions.
        return buildCustomNodeShapeDataUri(
            definition,
            fillColor,
            strokeColor,
            strokeWidth,
            Math.max(20, strokeWidth),
            { width: squareCanvasSize, height: squareCanvasSize }
        );
    }

    const basicShapeDataUri = buildBasicNodeShapeDataUri(normalizedShapeKey, fillColor, strokeColor, strokeWidth);
    if (basicShapeDataUri) {
        return basicShapeDataUri;
    }

    return buildEllipseNodeShapeDataUri(fillColor, strokeColor, strokeWidth);
}

export function getTreeNodeShapeDataUri(shapeKey: string, fillColor: string, strokeColor: string, strokeWidth: number): string {
    const normalizedShapeKey = resolveNodeShapeKey(shapeKey);
    if (isCustomNodeShape(normalizedShapeKey)) {
        return buildCustomNodeShapeDataUri(
            CUSTOM_NODE_SHAPE_DEFINITIONS[normalizedShapeKey],
            fillColor,
            strokeColor,
            strokeWidth
        );
    }

    const basicShapeDataUri = buildBasicNodeShapeDataUri(normalizedShapeKey, fillColor, strokeColor, strokeWidth, 0);
    if (basicShapeDataUri) {
        return basicShapeDataUri;
    }

    return buildEllipseNodeShapeDataUri(fillColor, strokeColor, strokeWidth, 0);
}

export function getTreeNodeShapeScale(shapeKey: string): number {
    const normalizedShapeKey = resolveNodeShapeKey(shapeKey);
    if (BASIC_NODE_SHAPE_KEYS.has(normalizedShapeKey)) {
        // Basic shapes are authored inside a ~220px footprint, so the tree overlay
        // needs a compensating scale factor to match the native leaf-circle size.
        return TREE_BASIC_NODE_SHAPE_SCALE;
    }

    return 1;
}

export function getCustomNodeShapeData(shapeKey: string, nodeColor: string): Record<string, string> {
    const normalizedShapeKey = normalizeNodeShapeKey(shapeKey);
    if (!normalizedShapeKey) {
        return {};
    }

    if (!isCustomNodeShape(normalizedShapeKey)) {
        return {};
    }

    const definition = CUSTOM_NODE_SHAPE_DEFINITIONS[normalizedShapeKey];
    return {
        customIconKey: normalizedShapeKey,
        iconBackgroundImage: buildCustomNodeShapeDataUri(definition, nodeColor, nodeColor, 4)
    };
}

import type { NetworkNodeVisualFeatures } from '@app/contactTraceCommonServices/network-node-features';
import { sdfCircle, type FragmentLayer } from 'sigma/rendering';
import type { NodePrimitives } from 'sigma/primitives';

export interface SigmaNetworkFeatureAttributes extends Record<string, unknown> {
  mtDonutCount: number;
  mtDonutStops: number[];
  mtDonutColor1: string;
  mtDonutColor2: string;
  mtDonutColor3: string;
  mtDonutColor4: string;
  mtUncertainty: number;
  mtQcVisible: number;
  mtQcColor: string;
  mtFeatureScale: number;
}

const TRANSPARENT = 'rgba(0,0,0,0)';
const FLOAT = 0x1406;
const UNSIGNED_BYTE = 0x1401;

/**
 * Converts MT's renderer-neutral feature model into the bounded attributes
 * used by Sigma's custom WebGL node program. The shader supports four visible
 * donut sectors; any remaining sectors are combined into the fourth sector.
 */
export function buildSigmaNetworkFeatureAttributes(
  features: NetworkNodeVisualFeatures,
): SigmaNetworkFeatureAttributes {
  const sourceSegments = features.donutSegments;
  const visibleSegments = sourceSegments.length > 4
    ? [
        ...sourceSegments.slice(0, 3),
        {
          ...sourceSegments[3],
          fraction: sourceSegments.slice(3).reduce((sum, segment) => sum + segment.fraction, 0),
        },
      ]
    : sourceSegments;
  const colors = visibleSegments.map(segment => segment.color);
  let cumulative = 0;
  const stops = visibleSegments.map(segment => {
    cumulative += segment.fraction;
    return Math.min(1, Math.round(cumulative * 1_000_000) / 1_000_000);
  });
  while (stops.length < 4) stops.push(1);

  const hasDonut = sourceSegments.length > 1;
  const hasQc = Boolean(features.qc);
  const hasUncertainty = features.uncertainty !== null && features.uncertainty > 0;

  return {
    mtDonutCount: hasDonut ? Math.min(4, visibleSegments.length) : 0,
    mtDonutStops: stops,
    mtDonutColor1: colors[0] || TRANSPARENT,
    mtDonutColor2: colors[1] || TRANSPARENT,
    mtDonutColor3: colors[2] || TRANSPARENT,
    mtDonutColor4: colors[3] || TRANSPARENT,
    mtUncertainty: features.uncertainty || 0,
    mtQcVisible: hasQc ? 1 : 0,
    mtQcColor: features.qc?.color || TRANSPARENT,
    // The larger quad preserves approximately the same central node radius
    // while making room for renderer-native rings and the QC badge.
    mtFeatureScale: hasDonut || hasQc || hasUncertainty ? 1.65 : 1,
  };
}

const microbeTraceFeatureLayer: FragmentLayer = {
  name: 'mt_features',
  uniforms: [],
  attributes: [
    { name: 'mtBaseColor', size: 4, type: UNSIGNED_BYTE, normalized: true, source: 'color' },
    { name: 'mtDonutColor1', size: 4, type: UNSIGNED_BYTE, normalized: true, source: 'mtDonutColor1', defaultValue: TRANSPARENT },
    { name: 'mtDonutColor2', size: 4, type: UNSIGNED_BYTE, normalized: true, source: 'mtDonutColor2', defaultValue: TRANSPARENT },
    { name: 'mtDonutColor3', size: 4, type: UNSIGNED_BYTE, normalized: true, source: 'mtDonutColor3', defaultValue: TRANSPARENT },
    { name: 'mtDonutColor4', size: 4, type: UNSIGNED_BYTE, normalized: true, source: 'mtDonutColor4', defaultValue: TRANSPARENT },
    { name: 'mtDonutStops', size: 4, type: FLOAT, source: 'mtDonutStops' },
    { name: 'mtDonutCount', size: 1, type: FLOAT, source: 'mtDonutCount' },
    { name: 'mtUncertainty', size: 1, type: FLOAT, source: 'mtUncertainty' },
    { name: 'mtQcVisible', size: 1, type: FLOAT, source: 'mtQcVisible' },
    { name: 'mtQcColor', size: 4, type: UNSIGNED_BYTE, normalized: true, source: 'mtQcColor', defaultValue: TRANSPARENT },
  ],
  glsl: `
vec4 mtMaskColor(vec4 sourceColor, float mask) {
  return vec4(sourceColor.rgb, sourceColor.a * clamp(mask, 0.0, 1.0));
}

float mtCircleMask(vec2 point, vec2 center, float radius) {
  float distanceFromCenter = length(point - center);
  return smoothstep(radius + context.aaWidth, radius - context.aaWidth, distanceFromCenter);
}

vec4 layer_mt_features(
  vec4 v_mtBaseColor,
  vec4 v_mtDonutColor1,
  vec4 v_mtDonutColor2,
  vec4 v_mtDonutColor3,
  vec4 v_mtDonutColor4,
  vec4 v_mtDonutStops,
  float v_mtDonutCount,
  float v_mtUncertainty,
  float v_mtQcVisible,
  vec4 v_mtQcColor
) {
  const float PI = 3.141592653589793;
  const float TWO_PI = 6.283185307179586;
  bool hasDonut = v_mtDonutCount > 1.5;
  bool hasFeatures = hasDonut || v_mtUncertainty > 0.0 || v_mtQcVisible > 0.5;
  float baseRadius = hasFeatures ? 0.57 : 0.96;
  float distanceFromCenter = length(context.uv);
  vec4 result = mtMaskColor(v_mtBaseColor, mtCircleMask(context.uv, vec2(0.0), baseRadius));

  if (hasDonut) {
    float outerMask = smoothstep(0.90 + context.aaWidth, 0.90 - context.aaWidth, distanceFromCenter);
    float innerMask = smoothstep(0.67 + context.aaWidth, 0.67 - context.aaWidth, distanceFromCenter);
    float ringMask = outerMask * (1.0 - innerMask);
    float angle = atan(context.uv.y, context.uv.x) + PI * 0.5;
    if (angle < 0.0) angle += TWO_PI;
    float fraction = angle / TWO_PI;
    vec4 donutColor = v_mtDonutColor1;
    if (fraction >= v_mtDonutStops.x) donutColor = v_mtDonutColor2;
    if (fraction >= v_mtDonutStops.y && v_mtDonutCount > 2.5) donutColor = v_mtDonutColor3;
    if (fraction >= v_mtDonutStops.z && v_mtDonutCount > 3.5) donutColor = v_mtDonutColor4;
    result = blendOver(result, mtMaskColor(donutColor, ringMask));
  }

  if (v_mtUncertainty > 0.0) {
    float outerMask = smoothstep(0.99, 0.99 - context.aaWidth * 1.5, distanceFromCenter);
    float innerMask = smoothstep(0.93 + context.aaWidth * 1.5, 0.93 - context.aaWidth * 1.5, distanceFromCenter);
    float angle = atan(context.uv.y, context.uv.x) + PI;
    float dashMask = step(0.30, fract(angle / TWO_PI * 12.0));
    float ringMask = outerMask * (1.0 - innerMask) * dashMask;
    vec4 uncertaintyColor = vec4(0.486, 0.227, 0.929, 0.30 + v_mtUncertainty * 0.60);
    result = blendOver(result, mtMaskColor(uncertaintyColor, ringMask));
  }

  if (v_mtQcVisible > 0.5) {
    vec2 badgeCenter = vec2(0.64, 0.64);
    float badgeMask = mtCircleMask(context.uv, badgeCenter, 0.21);
    float innerWhite = mtCircleMask(context.uv, badgeCenter, 0.145);
    result = blendOver(result, mtMaskColor(v_mtQcColor, badgeMask));
    result = blendOver(result, mtMaskColor(vec4(1.0), innerWhite));
    result = blendOver(result, mtMaskColor(v_mtQcColor, mtCircleMask(context.uv, badgeCenter, 0.09)));
  }

  return result;
}
`,
};

export const MICROBETRACE_SIGMA_NODE_PRIMITIVES: NodePrimitives = {
  shapes: [sdfCircle()],
  variables: {
    mtDonutCount: { type: 'number', default: 0 },
    mtDonutStops: { type: 'number', default: 0 },
    mtDonutColor1: { type: 'color', default: TRANSPARENT },
    mtDonutColor2: { type: 'color', default: TRANSPARENT },
    mtDonutColor3: { type: 'color', default: TRANSPARENT },
    mtDonutColor4: { type: 'color', default: TRANSPARENT },
    mtUncertainty: { type: 'number', default: 0 },
    mtQcVisible: { type: 'number', default: 0 },
    mtQcColor: { type: 'color', default: TRANSPARENT },
  },
  layers: [microbeTraceFeatureLayer],
};

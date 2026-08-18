/** Stable, procedural geometry used by the Mental Rotation task. */
export const mentalRotationShapePath = "M 12 12 H 46 V 28 H 30 V 68 H 12 Z";

/**
 * Both shapes rotate away from upright by ±angle/2, so the judged angular
 * difference is `angle` while neither side stays at a familiar 0° baseline.
 * The viewBox leaves headroom so rotated corners are never clipped.
 */
export function mentalRotationSvgMarkup(angle: number, same: boolean): string {
  const safeAngle = Number.isFinite(angle) ? angle : 0;
  const half = Math.round((safeAngle / 2) * 10) / 10;
  return `<svg class="mental-rotation-svg" viewBox="0 0 300 120" role="img" aria-label="两组程序化几何图形"><g transform="translate(34 26) rotate(${-half} 29 40)"><path d="${mentalRotationShapePath}"/></g><g transform="translate(230 26) ${same ? "" : "scale(-1 1)"}rotate(${half} 29 40)"><path d="${mentalRotationShapePath}"/></g></svg>`;
}

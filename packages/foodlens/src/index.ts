/**
 * @jessmove/foodlens
 *
 * FoodLens 360° — visual food intelligence.
 *
 * The module's defining constraint is honesty about uncertainty: a
 * photograph cannot resolve portion size, hidden ingredients or cooking
 * method exactly, so every value carries its evidence source, a
 * confidence level and — unless the source is verified — a range rather
 * than a figure.
 *
 * Child-safety note: for users under 18 this module must be driven in
 * its non-numeric framing. Charter rule C6 forbids surfacing calorie
 * figures to a minor, and `bodySurfacePolicy` in @jessmove/shared is
 * the gate that enforces it.
 */

export * from './confidence';
export * from './twin';
export * from './analysis';
export * from './composition';

import { settings } from "herdr";

// GPUI reports window-logical pixels: display scaling is already accounted for,
// but Herdr's app zoom is not. Compare against design sizes only after unzooming.
export function uiScale(): number {
  const zoom = settings().zoom;
  return typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

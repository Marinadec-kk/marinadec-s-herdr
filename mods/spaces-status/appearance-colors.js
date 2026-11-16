export const TONE_COUNT = 12;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const rgb = (hex) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
const hex = (values) => `#${values.map(n => Math.round(clamp(n) * 255).toString(16).padStart(2, "0")).join("")}`;
const linear = (n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
const srgb = (n) => n <= .0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - .055;
export function tint(color, background, amount) {
    const a = rgb(color), b = rgb(background);
    return hex(a.map((n, i) => n * amount + b[i] * (1 - amount)));
}
// OKLCH keeps a machine's hue while varying perceived lightness and chroma.
// Gamut mapping reduces chroma, rather than clipping channels and shifting hue.
export function tonePalette(base, dark) {
    const [r, g, b] = rgb(base).map(linear);
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
    const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
    const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    const L = .2104542553 * l + .793617785 * m - .0040720468 * s;
    const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
    const bb = .0259040371 * l + .7827717662 * m - .808675766 * s;
    const hue = Math.atan2(bb, a), chroma = Math.hypot(a, bb);
    const center = dark ? clamp(L, .67, .69) : clamp(L, .42, .45);
    const steps = [
        [-.02, 1], [.09, .7], [-.09, 1.15], [.03, .9], [.15, .55], [-.05, 1.35],
        [.06, 1.2], [-.07, .65], [.12, .95], [0, .55], [-.04, .8], [.045, .6],
    ];
    return steps.map(([offset, saturation]) => {
        const lightness = clamp(center + offset, dark ? .58 : .34, dark ? .84 : .60);
        const toRgb = (c) => {
            const aa = c * Math.cos(hue), ab = c * Math.sin(hue);
            const ll = (lightness + .3963377774 * aa + .2158037573 * ab) ** 3;
            const mm = (lightness - .1055613458 * aa - .0638541728 * ab) ** 3;
            const ss = (lightness - .0894841775 * aa - 1.291485548 * ab) ** 3;
            return [
                4.0767416621 * ll - 3.3077115913 * mm + .2309699292 * ss,
                -1.2684380046 * ll + 2.6097574011 * mm - .3413193965 * ss,
                -.0041960863 * ll - .7034186147 * mm + 1.707614701 * ss,
            ];
        };
        let low = 0, high = Math.min(chroma, .19) * saturation;
        for (let i = 0; i < 16; i++) {
            const mid = (low + high) / 2;
            if (toRgb(mid).every(n => n >= 0 && n <= 1))
                low = mid;
            else
                high = mid;
        }
        return hex(toRgb(low).map(srgb));
    });
}

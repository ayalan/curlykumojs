// Type definitions for curlykumo.js 2.3.0

export as namespace CurlyKumo;

/** Parameters of the generator. Every numeric parameter except `seed` can be animated. */
export interface Params {
  /** Integer. Selects which cloud. Do not animate. Default 34. */
  seed?: number;
  /** 0 = nothing, 1 = fully grown. Default 1. */
  growth?: number;
  /** Mean lobe radius in output units; every length scales with it. 8 to 48, default 26. */
  lobe?: number;
  /** Lobe size variation. 0 to 0.8, default 0.6. */
  sizeVar?: number;
  /** Overlap of neighbouring lobes. 0.15 to 0.4, default 0.28. */
  overlap?: number;
  /** Vertical squash; 1 gives round lobes. 0.45 to 1, default 0.7. */
  squash?: number;
  /** Half-thickness of a mass in lobe radii. 0.9 to 1.8, default 1.15. */
  thickness?: number;
  /** Lobe count of the first mass at full growth. 4 to 16, default 9. */
  length?: number;
  /** Masses at full growth; fractional values are valid. 1 to 5, default 4. */
  masses?: number;
  /** How far a new mass sits outside the mass it emerges from. 0 to 1.2, default 0.5. */
  spread?: number;
  /** Unevenness of each mass body. 0 to 0.3, default 0.12. */
  irregularity?: number;
  /** Share of eligible lobes that carry a curl. 0 to 1, default 1. */
  curl?: number;
  /** Mean curl length in turns. 0.3 to 1.8, default 1. */
  turns?: number;
  /** Curl decay per radian; higher gives a smaller spiral. 0.1 to 0.4, default 0.2. */
  tight?: number;
  /** Variation of curl length and tightness between lobes. 0 to 1, default 0.6. */
  curlVar?: number;
  /** Amount of idle variation; 0 turns it off. 0 to 1, default 0. */
  sway?: number;
  /** Position in the idle variation. Increase it over time. No effect while `sway` is 0. */
  phase?: number;
}

export interface Lobe { id: number; x: number; y: number; rx: number; ry: number; }

export interface Mass {
  /** Stable identity of this mass across frames. 0 is the first mass. */
  id: number;
  /** 0 to 1: how far this mass has emerged. */
  presence: number;
  /** SVG path data, one closed path. */
  outline: string;
  /** SVG path data, open paths. */
  curls: string[];
  /** For each entry of `curls`, the id of the lobe it belongs to. */
  curlLobes: number[];
  lobes: Lobe[];
}

export interface Bounds { x: number; y: number; width: number; height: number; }

export interface Frame {
  params: Required<Params>;
  /** Ordered back to front. Draw in this order. */
  masses: Mass[];
  /** Every mass outline in one path string. Empty at growth 0. */
  silhouette: string;
  bounds: Bounds;
}

export interface Style {
  fill?: string;
  stroke?: string;
  /** Line width in geometry units. Default 2.4. */
  strokeWidth?: number;
  /** How far the fill extends past the outline. Default 3.2. */
  margin?: number;
  /** `toSVG` only: keep line widths constant on screen when the SVG is scaled. */
  nonScalingStroke?: boolean;
}

export const DEFAULTS: Required<Params>;
export const version: string;

/** Pure function: the same parameters always return the same frame. */
export function generate(params?: Params): Frame;
/** SVG markup (one `<g>`) for a frame, drawn in the required order. Returns '' for an empty frame. */
export function toSVG(frame: Frame, style?: Style): string;
/** Draws a frame on a canvas 2D context in the required order. */
export function draw(ctx: CanvasRenderingContext2D, frame: Frame, style?: Style): void;
/** Registers the `<curly-kumo>` tag. Called automatically when the script loads in a browser. */
export function defineElement(): void;

export interface GrowOptions {
  /** Seconds, or a string such as '1.5s' or '400ms'. Time for a full 0 to 100 change. */
  duration?: number | string;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface GrowEventDetail { growth: number; target: number; }

/** The `<curly-kumo>` element. Growth on the element runs from 0 to 100. */
export interface CurlyKumoElement extends HTMLElement {
  /** Resolves true when the value is reached, false if another call replaced it. */
  growIn(options?: GrowOptions): Promise<boolean>;
  growOut(options?: GrowOptions): Promise<boolean>;
  growTo(value: number, options?: GrowOptions): Promise<boolean>;
  /** Target growth, 0 to 100. Assign to feed a new value; the cloud follows it. */
  growth: number;
  /** The growth currently drawn, 0 to 100. */
  readonly value: number;
  setParams(params: Params): void;
  setStyle(style: Style): void;
}

declare global {
  interface HTMLElementTagNameMap { 'curly-kumo': CurlyKumoElement; }
  interface HTMLElementEventMap {
    'curlykumo-enter': CustomEvent<GrowEventDetail>;
    'curlykumo-leave': CustomEvent<GrowEventDetail>;
    'curlykumo-growend': CustomEvent<GrowEventDetail>;
  }
}

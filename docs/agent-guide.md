# curlykumo.js: instructions for an agent

`curlykumo.js` generates one hanafuda-style cloud (kumo) as vector geometry. It has no dependencies. It returns path data only. You apply stroke width, colours and every other style rule.

## Load

```html
<script src="curlykumo.js"></script>   <!-- defines the global CurlyKumo and the <curly-kumo> tag -->
```

```js
const CurlyKumo = require('./curlykumo.js'); // Node
```

## Call

```js
const frame = CurlyKumo.generate({ seed: 34, growth: 0.6 });
```

`generate` is a pure function. The same parameters always return the same frame. Call it again for every animation frame. It took about 0.7 ms per call in Node on the test machine.

## Output

```js
frame = {
  masses: [            // ordered back to front
    {
      id,              // stable identity of this mass across frames (0 = first mass)
      presence,        // 0..1, how far this mass has emerged (information only)
      outline,         // SVG path data, one closed path
      curls,           // array of SVG path data, open paths
      curlLobes,       // for each curl path, the id of the lobe it belongs to
      lobes,           // [{ id, x, y, rx, ry }] ellipses that make up the mass
    },
  ],
  silhouette,          // all mass outlines in one path string: the whole cloud shape
  bounds,              // { x, y, width, height }
  params,              // the parameters used, with defaults filled in
}
```

- Coordinates: the centre of the first mass is at (0, 0). The y axis points down, as in SVG.
- Numbers in path data are rounded to 2 decimals (3 decimals when `lobe` is below 12). Do not round them further. Coarser rounding makes lobes twitch during slow motion, because a renderer rebuilds each arc from its end points.
- Units: all lengths scale with the `lobe` parameter. With `lobe: 26` and the other defaults, seed 34 at full growth is 282 units wide and 110 units high.
- `growth: 0` returns no masses and an empty `silhouette`.

## Render order (required)

Masses overlap. A mass in front must cover the lines of the masses behind it. Draw in this order:

1. Optional fill margin: draw `silhouette` with fill and a stroke of the fill colour.
2. For each mass in array order:
   1. Fill `outline` with the fill colour.
   2. Stroke `outline` with the line colour.
   3. Stroke each path in `curls` with the line colour.

If you stroke all lines first and fill afterwards, or draw masses in another order, hidden lines become visible.

Two helpers apply this order with a style you pass in:

```js
svgElement.innerHTML = CurlyKumo.toSVG(frame, { fill: '#dd3a2c', stroke: '#1a1210', strokeWidth: 2.4, margin: 3.2 });
CurlyKumo.draw(canvasContext, frame, { fill: '#dd3a2c', stroke: '#1a1210', strokeWidth: 2.4, margin: 3.2 });
```

You do not have to use them. If your other objects follow their own stroke rules, read `outline` and `curls` directly and apply those rules.

## Style notes

- The generator output contains no style.
- `strokeWidth` and `margin` are in the same units as the geometry. If the SVG is scaled through its `viewBox`, they scale with it.
- `margin` is the distance the fill colour extends past the outline. The reference cards have this: the red reaches slightly beyond the black line. Set it to 0 if your other objects do not use it.
- Line width is constant. The helpers use `strokeWidth` unchanged for every mass at every growth value. Do the same if you render the paths yourself.
- A mass that has just emerged is smaller than the line width, so it first appears as a dot of the line colour and then opens into a shape.
- `CurlyKumo.toSVG` accepts `nonScalingStroke: true`. It adds `vector-effect="non-scaling-stroke"` to every stroked path, so line widths stay constant on screen when the SVG is scaled through its `viewBox` or a transform.
- Use round line caps and round line joins.

## Parameters

Every numeric parameter except `seed` can be animated. A small change in a value gives a small change in the shape.

| Name | Range | Default | Effect |
|---|---|---|---|
| `seed` | integer | 34 | Selects which cloud. Changing it gives an unrelated cloud. Do not animate it. |
| `growth` | 0 to 1 | 1 | 0 is nothing. 1 is the full cloud. Size and detail both rise with it. |
| `lobe` | 8 to 48 | 26 | Mean lobe radius. Scales the whole cloud. |
| `sizeVar` | 0 to 0.8 | 0.6 | Variation of lobe size. |
| `overlap` | 0.15 to 0.4 | 0.28 | Overlap of neighbouring lobes. Higher gives shallower cusps. |
| `squash` | 0.45 to 1 | 0.7 | Vertical squash. 1 gives round lobes. |
| `thickness` | 0.9 to 1.8 | 1.15 | Half-thickness of a mass, in lobe radii. Higher values leave the middle of a mass without curls. |
| `length` | 4 to 16 | 9 | Lobe count of the first mass at full growth. Sets how long the cloud is. |
| `masses` | 1 to 5 | 4 | Number of masses at full growth. Fractional values are valid: 3.5 gives a fourth mass at partial size. |
| `spread` | 0 to 1.2 | 0.5 | How far a new mass sits outside the mass it emerges from. |
| `irregularity` | 0 to 0.3 | 0.12 | Unevenness of each mass body. |
| `curl` | 0 to 1 | 1 | Share of eligible lobes that carry a curl. Two lobes per mass never carry one. |
| `turns` | 0.3 to 1.8 | 1 | Mean curl length, in turns. |
| `tight` | 0.1 to 0.4 | 0.2 | Curl decay. Higher gives a smaller spiral. |
| `curlVar` | 0 to 1 | 0.6 | Variation of curl length and tightness between lobes. |
| `sway` | 0 to 1 | 0 | Amount of idle variation. 0 turns it off. |
| `phase` | any number | 0 | Position in the idle variation. Has no effect while `sway` is 0. |

Values outside a range are clamped where the model would otherwise break (`growth`, `masses`, `overlap`, `sizeVar`, `squash`, `thickness`, `irregularity`, `curlVar`, `sway`).

## What growth does

1. The first mass appears at zero size and enlarges.
2. It gains lobes at two fixed points on its ring. Existing lobes move apart to make room.
3. Each curl lengthens as its lobe matures.
4. Further masses emerge from the edge of an existing mass, in front of it, starting at zero size. With the default `masses: 4` they start at growth 0.18, 0.39 and 0.59.
5. The rule is reversible. Lowering `growth` shrinks the same cloud back.

## Animation patterns

Drive `growth` with one progress number from 0 to 1.

Load progress:

```js
function onProgress(fraction) {            // fraction: 0 to 1
  const frame = CurlyKumo.generate({ seed: 34, growth: fraction });
  sky.innerHTML = CurlyKumo.toSVG(frame, style);
}
```

Pointer position with smoothing:

```js
let target = 0, shown = 0;
area.addEventListener('pointermove', (e) => {
  const r = area.getBoundingClientRect();
  target = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
});
function tick() {
  shown += (target - shown) * 0.1;         // ease toward the pointer
  sky.innerHTML = CurlyKumo.toSVG(CurlyKumo.generate({ seed: 34, growth: shown }), style);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

Idle motion on a finished cloud:

```js
function tick(ms) {
  const frame = CurlyKumo.generate({ seed: 34, growth: 1, sway: 0.6, phase: ms / 1000 * 0.9 });
  sky.innerHTML = CurlyKumo.toSVG(frame, style);
  requestAnimationFrame(tick);
}
```

Several clouds: call `generate` once per cloud with different seeds and place each result with a `transform` on its group.

## The `<curly-kumo>` tag

Loading the script in a browser also defines an HTML tag. It places one cloud, reserves its space, and animates its growth.

```html
<curly-kumo seed="34" enter="grow-in" leave="grow-out" duration="1.5s"></curly-kumo>
```

- Growth on the tag runs from 0 to 100. `CurlyKumo.generate` still takes 0 to 1.
- The tag draws with `CurlyKumo.toSVG`, so the render order is already correct.
- Use the tag when fill, line colour, line width and fill margin are all the style you need. Call `CurlyKumo.generate` yourself when you need other stroke rules.

### Ways to drive growth

| Driver | How | Behaviour |
|---|---|---|
| Timed | `grow="in"`, `grow="out"`, or `cloud.growIn()`, `cloud.growOut()`, `cloud.growTo(60)` | Animates from the current value to the new one over `duration`. |
| Fed from JavaScript | `cloud.growth = 37`, or the `growth` attribute | The cloud follows each new value. Assign as often as the number changes. |
| Scroll trigger | `enter="grow-in"`, `leave="grow-out"` | Timed grow-in when the tag scrolls into view, timed grow-out when it scrolls out. |
| Scroll-linked | `scroll-link` | Growth follows the scroll position. It stops when scrolling stops. |

Every driver only sets a target value. The cloud moves toward the target from the value it currently shows, so a change of direction does not cause a jump.

Feeding a progress value, for example entropy collection, with no progress bar on the page:

```js
const cloud = document.querySelector('curly-kumo');   // <curly-kumo seed="21" growth="0">
collector.onProgress = (fraction) => { cloud.growth = fraction * 100; };
cloud.addEventListener('curlykumo-growend', (e) => {
  if (e.detail.growth === 100) onCloudFull();
});
```

### Attributes

Generator parameters use the names from the parameter table, written with hyphens: `seed`, `lobe`, `size-var`, `overlap`, `squash`, `thickness`, `length`, `masses`, `spread`, `irregularity`, `curl`, `turns`, `tight`, `curl-var`, `sway`.

| Attribute | Default | Meaning |
|---|---|---|
| `fill`, `stroke` | `#dd3a2c`, `#1a1210` | Fill colour and line colour. |
| `stroke-width`, `margin` | 2.4, 3.2 | Line width and fill margin, in geometry units. |
| `non-scaling-stroke` | off | Keeps line widths constant in screen pixels when the tag is scaled. |
| `growth` | 100 | Target growth, 0 to 100. The first value is shown without animation. |
| `grow` | none | `in` or `out`. Starts a timed change when the tag is placed or the attribute changes. |
| `enter`, `leave` | none | `grow-in` or `grow-out`. Action when the tag scrolls into or out of view. |
| `threshold` | 0.5 | Share of the tag's box that must be visible to count as in view. |
| `once` | off | After the first grow-in from `enter`, later enter and leave actions are ignored. |
| `scroll-link` | off | Growth follows the scroll position. |
| `scroll-from`, `scroll-to` | 1, 0.5 | Position of the tag's centre where growth is 0 and where it is 100, as a fraction of the scroll area's height measured from its top. |
| `duration` | `1.5s` | Time for a full 0 to 100 timed change. A shorter distance takes proportionally less. Accepts `1.5s`, `400ms` or a number of seconds. |
| `easing` | `ease-in-out` | `linear`, `ease-in`, `ease-out` or `ease-in-out`. Timed changes only. |
| `smoothing` | `0.25s` (`0.12s` with `scroll-link`) | How quickly the cloud catches up with a fed or scroll-linked value. 0 follows at once. |
| `sway-speed` | 0.9 | Speed of the idle variation when `sway` is above 0. |

### Methods, properties and events

| Member | Meaning |
|---|---|
| `growIn(options)`, `growOut(options)`, `growTo(value, options)` | Timed change. `options` may hold `duration` and `easing`. Returns a promise: `true` when the value is reached, `false` if another call replaced it. |
| `growth` (read and write) | The target, 0 to 100. Writing it feeds a new value. |
| `value` (read) | The growth currently drawn, 0 to 100. |
| `setParams(object)` | Generator parameters, with the names used by `CurlyKumo.generate`. These take priority over attributes. |
| `setStyle(object)` | Style, with the names used by `CurlyKumo.toSVG`. These take priority over attributes. |

| Event | Fired when |
|---|---|
| `curlykumo-enter` | The tag scrolls into view. |
| `curlykumo-leave` | The tag scrolls out of view. |
| `curlykumo-growend` | The drawn value reaches the target. With fed values this can fire many times, so check `event.detail.growth`. |

All three events bubble. `event.detail` holds `growth` (drawn value) and `target`.

### Behaviour to rely on

- **Space:** the tag is a block element. Set its width with CSS. Its height follows the shape of the fully grown cloud, so the layout does not shift while the cloud grows.
- **Starting value:** 0 when the tag has `grow="in"`, `enter="grow-in"` or `scroll-link`. Otherwise the `growth` attribute, or 100.
- **Scroll area:** the nearest ancestor with `overflow-y: auto` or `scroll`. If there is none, the window.
- **Off screen:** the tag does not redraw while no part of it is visible. Values still advance, and it draws again when it becomes visible.
- **Reduced motion:** if the visitor's system asks for reduced motion, timed changes complete at once, fed values are shown at once, and `sway` is off. Tags with `enter="grow-in"` or `scroll-link` are shown fully grown, and enter and leave actions do not run. The events still fire.
- **Line width:** `stroke-width` is in geometry units and the tag scales its drawing to its width. Two tags of different widths therefore show different line widths. Add `non-scaling-stroke` to both to give them the same width in pixels.

## Rules for correct use

- Regenerate the frame for every animation step. Do not interpolate between two `outline` strings or two `curls` strings. The number of path commands changes between frames, so path interpolation gives wrong shapes.
- Do not animate `seed`.
- Keep the render order given above.
- For a fixed layout, size the container from the bounds at full growth: `CurlyKumo.generate({ ...params, growth: 1 }).bounds`. The bounds at lower growth differ in size and are not centred on the same point.
- Match a curl to the previous frame with `masses[i].id` and `curlLobes[j]`, not by array index. A curl can be split into two paths where a younger lobe hides its middle.

## Tested behaviour

Measured with the default lobe radius of 26 units.

| Check | Result |
|---|---|
| Same parameters, two calls | Identical output |
| Invalid numbers in output | 0 in 33,600 frames (200 seeds, 21 growth values, 8 parameter sets including range extremes) |
| Outlines not closed | 0 in the same 33,600 frames |
| Sudden jumps while one parameter moves | 0 in 384,000 steps (8 parameters, 12 seeds, 4,000 steps across each range). A jump was defined as the total curl length of a mass changing by more than 6.5 units in one step. The largest change seen was 5.6 units. |
| Curls crossing each other inside a mass | 0 of 3,400 masses |
| Outline arcs drawn away from the true lobe edge | 0 of 4,252,173 arcs were more than 0.25 units off while `phase` moved with `sway: 1`. The largest offset was 0.015 units. |
| `<curly-kumo>` tag in headless Chromium | 10 of 10 tests passed: reserved space, timed growth, reversal without a jump, fed values, enter and leave in a scroll box and in the window, scroll-linked growth, no drawing off screen, attributes and style, reduced motion |

## Known limits

- A curl is hidden where it passes under a younger lobe of its own mass. This prevents crossings. It can leave a curl with a gap or a short separate piece.
- Curl pieces shorter than 6% of the lobe radius are omitted. A piece of that size can appear or disappear between two frames.
- Line width is uniform. The reference cards have slightly uneven printed lines. Apply any such effect in your own style step.
- The cloud is free-standing. To crop it against an edge, as on the cards, clip it in your own layout.

# Changelog

Versions before 2.3.0 were working versions and were not published.

## 2.3.0 (2026-10-07)

First public release.

- Renamed the file to `curlykumo.js`, the global to `CurlyKumo`, the tag to `<curly-kumo>`, and the events to `curlykumo-enter`, `curlykumo-leave` and `curlykumo-growend`.
- SVG class names from `toSVG` are now `curlykumo`, `curlykumo-margin` and `curlykumo-mass`.
- Added type definitions.

## 2.2.0

- Added the HTML tag: timed growth, growth fed from JavaScript, scroll trigger, scroll-linked growth.

## 2.1.0

- Fixed lobes twitching in slow motion. Outline arcs are written in pieces of at most a quarter turn, with coordinates rounded to 0.01 units.
- Line width no longer changes while a mass emerges.
- Added the `nonScalingStroke` option to `toSVG`.

## 2.0.0

- One free-standing cloud made of one to five overlapping masses, with a `growth` parameter.
- Geometry-only output. Every numeric parameter can be animated.

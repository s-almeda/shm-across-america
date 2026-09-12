# Notes

## The map edge shape

**In use:** an alpha mask, `public/assets/textures/map_clipping_mask.png`,
applied in `src/components/MapFrame/MapFrame.css`. Opaque pixels are the
paper, transparent ones are cut away; `mask-size: 100% 100%` stretches it to
the frame at any size. Replace the file to change the shape.

The previous approach was a `clip-path` polygon in percentages. It's gone, but
recorded below along with the SVG option, in case a hard-edged vector shape is
wanted again.

### 1. Vector, crisp edges — an SVG clipPath in normalised coordinates

In Figma: draw the shape, right-click → Copy/Paste as → Copy as SVG. Paste into
`index.html` and convert the path to a 0–1 coordinate space (divide every x by
the shape's width, every y by its height):

```html
<svg width="0" height="0" style="position:absolute">
  <clipPath id="mapShape" clipPathUnits="objectBoundingBox">
    <path d="M0.02,0.01 L0.98,0.01 ... Z" />
  </clipPath>
</svg>
```

then `.map-frame { clip-path: url(#mapShape); }`.

`clipPathUnits="objectBoundingBox"` is the load-bearing part — without it the
shape is fixed pixels and won't scale with the frame.

### 2. Raster, soft/deckled/fibrous edges — an alpha mask

Better for a real torn-paper look, since `clip-path` can only do hard edges.
Export a PNG from Figma where the paper area is opaque and outside is
transparent, then:

```css
.map-frame {
  clip-path: none;
  -webkit-mask-image: url("/assets/textures/map_shape.png");
  mask-image: url("/assets/textures/map_shape.png");
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
```

`mask-size: 100% 100%` stretches the mask to the frame so it stays responsive.
Masks don't clip the box-shadow the way `clip-path` does, so with a mask the
shadow could move back onto `.map-frame` itself instead of
`.map-frame__shell`.

## Why the shadow is on the shell, not the frame

`clip-path` is applied *after* an element's own box-shadow, so a shadow
declared on the clipped element gets clipped away with everything else. A
`filter: drop-shadow()` on the parent operates on the already-clipped child, so
the shadow traces the torn edge.

## Pixel art sizing

All marker art renders with `image-rendering: pixelated` (nearest neighbour),
which is crisp at exact ratios and crunchy at arbitrary ones. Keep the sizes in
`src/map/config.js` as clean fractions of the source files:

- `car.png` 461×288
- `tack_1.png` 51×61 → 1/2
- `pin_1.png` 44×48 → 1/2
- `writing_hand.png` 244×202 → 1/3 desktop, 1/4 mobile

## CSS conventions

One CSS file per component, co-located. **Every selector in
`<Name>/<Name>.css` starts with `.<name>`** — no bare shared class names, no
cross-component selectors. That's the structural guarantee against the
collisions that used to silently restyle one card type when another was
edited. At most one `@media` block per file, at the bottom; shared responsive
sizes live as token overrides in `src/tokens.css` instead.

`pieces.css` in this directory is reference material, not loaded by the app.

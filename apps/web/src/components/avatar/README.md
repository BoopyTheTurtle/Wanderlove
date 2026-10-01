# Avatar parts

`<Avatar appearance={...} size={px} />` draws an avatar as one inline SVG. The appearance record, its catalog, and
`randomAppearance` and `parseAppearance` live in `@wannadoo/core` (`packages/core/src/avatar`). The review gallery is
`docs/design/avatar-gallery.html`, rebuilt with `npx vite-node tools/avatar-gallery.ts`.

## Layer contract

The contract lets painted raster parts replace the hand-drawn SVG one layer at a time.

**Frame.** Every layer draws in one 512 by 512 frame (`viewBox="0 0 512 512"`), clipped to the circle mask. A raster
part is a 512 by 512 image placed full-frame, with no offset or scaling.

**Order.** Layers draw back to front in the fixed `LAYER_ORDER`: background, back hair, body (neck and top), head, ears,
face features (eyes, brows, nose, cheeks, mouth, age lines), facial hair, front hair, accessories.

**Anchors.** Painted parts line up on `ANCHORS` in `frame.ts`, in frame pixels:

| Anchor          | Frame position                          |
| --------------- | --------------------------------------- |
| Head centre     | (256, 211)                              |
| Crown, chin     | y 81 and y 339                          |
| Head half-width | 114 (the skull, ears outside it)        |
| Eye line        | y 232; pupils at x 206 and 306          |
| Shoulder line   | y 428                                   |
| Hat line        | y 129 (hair above it hides under a hat) |
| Circle mask     | centre (256, 256), radius 256           |

**Art.** Each layer resolves through a function `(appearance) => LayerArt`:

- `{ svg }`: SVG content in the frame. The hand-drawn parts are authored in an art space at a convenient size and placed
  by `ART_TRANSFORM`, so the anchors above hold for them too.
- `{ href, tint? }`: a raster image placed full-frame. With `tint`, a colour matrix multiplies each channel by the tint,
  like a multiply blend, so a greyscale painted part takes the avatar's skin, hair or top colour.
- `null`: the layer is empty, as back hair is for most short styles.

**Tints.** Everything an appearance can vary resolves once in `tintsOf` (`tints.ts`): skin, eyes, hair, brows, top,
accent (beanie and scarf) and background, each as a main tone and a darker shade. SVG parts paint with these tones;
a raster part passes the main tone as its `tint`.

To try painted parts, pass resolvers for the layers you replace and keep the rest:

```tsx
<Avatar
  appearance={a}
  size={160}
  layers={{ frontHair: (a) => ({ href: hairPng[a.hair], tint: tintsOf(a).hair.colour }) }}
/>
```

## Rules the parts keep

- No outlines: flat rounded shapes, with shading from a second, darker tone. Strokes are only for features such as the
  mouth, nose, brows, lines of age, and glasses.
- Faces stay symmetric. Face and age change shapes within the anchors, never the anchors themselves.
- A beanie clips hair above the hat line, and a bun gives way to it. Beards follow each face's jaw and leave the mouth
  clear.
- A faint paper grain covers avatars drawn at 120 px and up; smaller ones skip it.

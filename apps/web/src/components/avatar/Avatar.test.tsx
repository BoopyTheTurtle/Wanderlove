import { DEFAULT_APPEARANCE, avatarCatalog, type Appearance } from "@wannadoo/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { ANCHORS } from "./frame";
import { LAYER_ORDER } from "./layers";

const render = (appearance: Appearance, extra: Partial<Parameters<typeof Avatar>[0]> = {}) =>
  renderToStaticMarkup(<Avatar appearance={appearance} size={64} {...extra} />);

const layersIn = (html: string) => [...html.matchAll(/data-layer="(\w+)"/g)].map((m) => m[1]);

describe("Avatar", () => {
  it("draws one SVG in the shared frame, its layers in the fixed order", () => {
    const html = render({ ...DEFAULT_APPEARANCE, hair: "long", facialHair: "beard", accessories: ["glasses"] });
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain('viewBox="0 0 512 512"');
    expect(layersIn(html)).toEqual([...LAYER_ORDER]);
  });

  it("leaves out empty layers", () => {
    const layers = layersIn(render({ ...DEFAULT_APPEARANCE, hair: "bald", facialHair: "none", accessories: [] }));
    expect(layers).not.toContain("backHair");
    expect(layers).not.toContain("frontHair");
    expect(layers).not.toContain("facialHair");
    expect(layers).not.toContain("accessories");
  });

  it("places a raster layer full-frame and tints it by multiplying", () => {
    const href = "data:image/png;base64,iVBORw0KGgo=";
    const html = render(DEFAULT_APPEARANCE, { layers: { head: () => ({ href, tint: "#ff8000" }) } });
    expect(layersIn(html)).toEqual(LAYER_ORDER.filter((id) => !["backHair", "facialHair", "accessories"].includes(id)));
    expect(html).toMatch(/<image href="data:image\/png;base64,iVBORw0KGgo=" x="0" y="0" width="512" height="512"/);
    expect(html).toContain('values="1.0000 0 0 0 0  0 0.5020 0 0 0  0 0 0.0000 0 0  0 0 0 1 0"');
    expect(html).toMatch(/<image[^>]+filter="url\(#av\w+-tint-head\)"/);
  });

  it("keeps the anchors the README documents", () => {
    expect(ANCHORS).toEqual({
      headCentre: { x: 256, y: 211 },
      crown: { y: 81 },
      chin: { y: 339 },
      headHalfWidth: 114,
      eyeLine: { y: 232, left: 206, right: 306 },
      shoulderLine: { y: 428 },
      hatLine: { y: 129 },
      mask: { cx: 256, cy: 256, r: 256 },
    });
  });

  it("renders every part combination without a broken value", () => {
    const { hair, top, facialHair, face, age } = avatarCatalog;
    const all = avatarCatalog.accessories.map((a) => a.id);
    for (const h of hair)
      for (const t of top)
        for (const f of facialHair)
          for (const fc of face)
            for (const ag of age) {
              const html = render({
                ...DEFAULT_APPEARANCE,
                hair: h.id,
                top: t.id,
                facialHair: f.id,
                face: fc.id,
                age: ag.id,
                accessories: (fc.id + ag.id) % 2 === 0 ? all : [],
              });
              expect(html).not.toMatch(/NaN|undefined|null|Infinity/);
            }
  });
});

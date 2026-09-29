import { describe, expect, it } from "vitest";
import {
  amountToward,
  clampAmount,
  kindOf,
  latestAmount,
  leafSegments,
  readConfig,
  rotate,
  type Kind,
} from "../src/core/door";

// A wall from (0, 0) to (100, 0): A on the left, B on the right. Scene y points down, positive angles turn clockwise.
const C = [0, 0, 100, 0] as const;
const door = (kind: Kind, direction: 1 | -1 = 1, max = 90, double = false) => ({ kind, direction, max, double });
const at = (x: number, y: number) => ({ x, y });
const noGrab = { pointer: at(0, 0), amount: 0 };

describe("kindOf", () => {
  it("makes Foundry's swing, swivel and slide solid, nothing else", () => {
    expect(kindOf("swing")).toBe("swing");
    expect(kindOf("swivel")).toBe("swivel");
    expect(kindOf("slide")).toBe("slide");
    for (const plain of ["ascend", "descend", "", null, undefined, "toString", "beaversSolidSwing"]) {
      expect(kindOf(plain)).toBeUndefined();
    }
  });
});

describe("clampAmount", () => {
  it("keeps amounts between 0 and max", () => {
    expect(clampAmount(45, 90)).toBe(45);
    expect(clampAmount(120, 90)).toBe(90);
    expect(Object.is(clampAmount(-10, 90), 0)).toBe(true);
  });
});

describe("readConfig", () => {
  it("takes direction and double from Foundry's animation", () => {
    expect(readConfig(undefined, "swing")).toEqual({ kind: "swing", direction: 1, double: false, max: 90, amount: 90 });
    expect(readConfig({}, "slide", { direction: -1, double: true })).toEqual({
      kind: "slide",
      direction: -1,
      double: true,
      max: 100,
      amount: 100,
    });
  });
  it("derives the maximum from Foundry's strength until it is set", () => {
    expect(readConfig({}, "swing", { strength: 2 }).max).toBe(180);
    expect(readConfig({}, "swing", { strength: 0.5 }).max).toBe(45);
    expect(readConfig({}, "swivel", { strength: 2 }).max).toBe(90);
    expect(readConfig({}, "slide", { strength: 2 }).max).toBe(100);
    expect(readConfig({}, "swing", { strength: 0 }).max).toBe(5);
    expect(readConfig({ max: 120 }, "swing", { strength: 2 }).max).toBe(120);
  });
  it("fits the maximum to the kind and ignores broken values", () => {
    expect(readConfig({ max: 400 }, "swing").max).toBe(180);
    expect(readConfig({ max: 120 }, "swivel").max).toBe(90);
    expect(readConfig({ max: 150 }, "slide").max).toBe(100);
    expect(readConfig({ max: 0 }, "swing").max).toBe(90);
    expect(readConfig({ max: -50 }, "swing").max).toBe(90);
    expect(readConfig({ max: "60" }, "swing").max).toBe(90);
  });
  it("clamps the amount to max, and opens fully when the amount is (almost) closed", () => {
    expect(readConfig({ max: 120, amount: 60 }, "swing").amount).toBe(60);
    expect(readConfig({ max: 50, amount: 80 }, "slide").amount).toBe(50);
    expect(readConfig({ max: 90, amount: 2 }, "swing").amount).toBe(90);
    expect(readConfig({ max: 90, amount: NaN }, "swing").amount).toBe(90);
  });
});

describe("rotate", () => {
  it("turns clockwise on the screen for positive angles", () => {
    const p = rotate(at(10, 0), at(0, 0), 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });
});

describe("leafSegments", () => {
  describe("single door", () => {
    it("swing turns around A, Open Direction picks the side", () => {
      expect(leafSegments(C, door("swing"), 90)).toEqual([[0, 0, 0, 100]]);
      expect(leafSegments(C, door("swing", -1), 90)).toEqual([[0, 0, 0, -100]]);
      expect(leafSegments(C, door("swing"), 0)).toEqual([[0, 0, 100, 0]]);
      expect(leafSegments(C, door("swing", 1, 180), 180)).toEqual([[0, 0, -100, 0]]);
    });
    it("swing rounds to whole pixels", () => {
      expect(leafSegments(C, door("swing"), 45)).toEqual([[0, 0, 71, 71]]);
    });
    it("swivel turns around the middle", () => {
      expect(leafSegments(C, door("swivel"), 90)).toEqual([[50, -50, 50, 50]]);
      expect(leafSegments(C, door("swivel", -1), 90)).toEqual([[50, 50, 50, -50]]);
    });
    it("slide moves towards A, or towards B with the reverse direction", () => {
      expect(leafSegments(C, door("slide", 1, 100), 100)).toEqual([[-100, 0, 0, 0]]);
      expect(leafSegments(C, door("slide", 1, 100), 40)).toEqual([[-40, 0, 60, 0]]);
      expect(leafSegments(C, door("slide", -1, 100), 25)).toEqual([[25, 0, 125, 0]]);
    });
    it("slide works along a diagonal wall", () => {
      expect(leafSegments([0, 0, 100, 100], door("slide", -1, 100), 50)).toEqual([[50, 50, 150, 150]]);
    });
  });

  describe("double door", () => {
    it("swing: both halves turn to the same side, around A and B", () => {
      expect(leafSegments(C, door("swing", 1, 90, true), 90)).toEqual([
        [0, 0, 0, 50],
        [100, 0, 100, 50],
      ]);
      expect(leafSegments(C, door("swing", -1, 90, true), 90)).toEqual([
        [0, 0, 0, -50],
        [100, 0, 100, -50],
      ]);
    });
    it("swivel: each half turns around its own middle, mirrored", () => {
      expect(leafSegments(C, door("swivel", 1, 90, true), 90)).toEqual([
        [25, -25, 25, 25],
        [75, -25, 75, 25],
      ]);
    });
    it("slide: the halves move apart, each by a share of its own length", () => {
      expect(leafSegments(C, door("slide", 1, 100, true), 100)).toEqual([
        [-50, 0, 0, 0],
        [150, 0, 100, 0],
      ]);
      expect(leafSegments(C, door("slide", 1, 100, true), 50)).toEqual([
        [-25, 0, 25, 0],
        [125, 0, 75, 0],
      ]);
    });
  });
});

describe("amountToward", () => {
  describe("swing", () => {
    it("follows the pointer on the side of the Open Direction", () => {
      expect(amountToward(C, door("swing"), at(50, 50), noGrab)).toBe(45);
      expect(amountToward(C, door("swing", -1), at(50, -50), noGrab)).toBe(45);
    });
    it("clamps to 0 and max", () => {
      expect(amountToward(C, door("swing"), at(50, -50), noGrab)).toBe(0);
      expect(amountToward(C, door("swing"), at(-50, 50), noGrab)).toBe(90);
    });
    it("wraps around ±180 so a 180° door follows the pointer all the way", () => {
      // Just past straight back: the raw angle is about -179, one turn later it is 181, clamped 180
      expect(amountToward(C, door("swing", 1, 180), at(-100, -1), noGrab)).toBe(180);
      expect(amountToward(C, door("swing", -1, 180), at(-100, 1), noGrab)).toBe(180);
      expect(amountToward(C, door("swing", 1, 170), at(-100, 30), noGrab)).toBe(163);
    });
    it("a double door follows the half on the pointer's side", () => {
      expect(amountToward(C, door("swing", 1, 90, true), at(0, 50), noGrab)).toBe(90);
      expect(amountToward(C, door("swing", 1, 90, true), at(100, 50), noGrab)).toBe(90);
      expect(amountToward(C, door("swing", 1, 90, true), at(80, 30), noGrab)).toBe(56);
    });
  });

  describe("swivel", () => {
    it("follows the pointer on either end of the door", () => {
      expect(amountToward(C, door("swivel"), at(100, 50), noGrab)).toBe(45);
      expect(amountToward(C, door("swivel"), at(0, -50), noGrab)).toBe(45);
      expect(amountToward(C, door("swivel", -1), at(100, -50), noGrab)).toBe(45);
    });
    it("clamps to 0 and max, and wraps at ±90", () => {
      expect(amountToward(C, door("swivel"), at(100, -10), noGrab)).toBe(0);
      // Just past a quarter turn: the raw angle flips to about -89, the next half turn gives 91, clamped 90
      expect(amountToward(C, door("swivel"), at(49, 100), noGrab)).toBe(90);
    });
    it("a double door follows the half on the pointer's side", () => {
      expect(amountToward(C, door("swivel", 1, 90, true), at(55, 20), noGrab)).toBe(45);
    });
  });

  describe("slide", () => {
    const grab = { pointer: at(50, 0), amount: 0 };
    it("a single door opens by as much as the pointer moved the way it slides", () => {
      expect(amountToward(C, door("slide", 1, 100), at(20, 0), grab)).toBe(30);
      expect(amountToward(C, door("slide", -1, 100), at(80, 0), grab)).toBe(30);
      expect(amountToward(C, door("slide", 1, 100), at(20, 70), grab)).toBe(30);
    });
    it("a single door starts from how far it was open and clamps to 0 and max", () => {
      const open = { pointer: at(50, 0), amount: 40 };
      expect(amountToward(C, door("slide", 1, 60), at(80, 0), open)).toBe(10);
      expect(amountToward(C, door("slide", 1, 60), at(0, 0), open)).toBe(60);
      expect(amountToward(C, door("slide", 1, 60), at(100, 0), open)).toBe(0);
    });
    it("a double door opens as far as the pointer is from the middle, either way", () => {
      expect(amountToward(C, door("slide", 1, 100, true), at(30, 0), grab)).toBe(40);
      expect(amountToward(C, door("slide", 1, 100, true), at(70, 0), grab)).toBe(40);
      expect(amountToward(C, door("slide", 1, 100, true), at(50, 20), grab)).toBe(0);
      expect(amountToward(C, door("slide", -1, 100, true), at(30, 0), grab)).toBe(40);
    });
  });
});

describe("latestAmount", () => {
  it("takes the wall's amount when no user stored a newer one", () => {
    expect(latestAmount({ amount: 40, time: 100 }, [])).toBe(40);
    expect(latestAmount({ amount: 40, time: 100 }, [{ amount: 70, time: 50 }])).toBe(40);
    expect(latestAmount(undefined, [])).toBeUndefined();
  });
  it("takes the newest amount a user stored", () => {
    const users = [
      { amount: 70, time: 150 },
      { amount: 20, time: 300 },
      { amount: 55, time: 200 },
    ];
    expect(latestAmount({ amount: 40, time: 100 }, users)).toBe(20);
  });
  it("a wall amount without time (stored before times existed) loses to any user amount", () => {
    expect(latestAmount({ amount: 40 }, [{ amount: 70, time: 1 }])).toBe(70);
  });
  it("ignores broken user entries", () => {
    expect(latestAmount({ amount: 40, time: 100 }, [null, { amount: "x", time: 500 }, { amount: 70 }])).toBe(40);
  });
});

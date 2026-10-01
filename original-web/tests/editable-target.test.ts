import { describe, expect, it } from "vitest";
import { isEditableTarget } from "../src/editable-target";

describe("isEditableTarget", () => {
  it("ignores null and non-element targets", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined as unknown as null)).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });

  it("treats text-entry elements as editable so global shortcuts stand down", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isEditableTarget({ tagName } as unknown as EventTarget)).toBe(true);
    }
  });

  it("treats contenteditable regions as editable", () => {
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  it("leaves ordinary chrome (buttons, canvas, body) as valid shortcut targets", () => {
    expect(isEditableTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: "CANVAS" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(false);
  });
});

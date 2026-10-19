import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { setSafe } from "../safe-html.ts";
import { buildHtml } from "../build.ts";
import { readFileSync } from "node:fs";

test("shared sanitizer discards executable markup and attributes while retaining allowed prose", () => {
  const window = new Window({ url: "http://127.0.0.1:4177/" });
  const names = ["document", "location", "DOMParser", "Node", "Element"] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  try {
    for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: window[name] });
    const target = window.document.createElement("div");
    setSafe(target as unknown as Element, '<p class="t-body-sm evil" style="color:red" onclick="alert(1)"><strong>safe</strong><img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><a href="javascript:alert(1)">bad</a><a href="https://example.invalid/">good</a></p>');
    expect(target.querySelector("strong")?.textContent).toBe("safe");
    expect(target.querySelector("img,svg,script,[onclick],[onerror],[onload],[style],a[href^=javascript]")).toBeNull();
    expect(target.querySelector("p")?.className).toBe("t-body-sm");
    expect(target.querySelector('a[href="https://example.invalid/"]')?.getAttribute("rel")).toBe("noreferrer");
  } finally {
    names.forEach((name, i) => { const descriptor = previous[i]; if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
    window.happyDOM.abort();
  }
});

test("root artifact embeds the shared sanitizer and closes no comment with an untrusted label", () => {
  const html = buildHtml({}, { specLabel: '--><img src=x onerror="alert(1)"><!--' });
  expect(html).toContain("allowedTags");
  expect(html).not.toContain("/*__ISOSCOPE_SAFE_HTML__*/");
  expect(html).not.toContain('--><img src=x');
  const template = readFileSync(new URL("../template.html", import.meta.url), "utf8");
  expect(template).not.toContain("document.adoptNode");
});

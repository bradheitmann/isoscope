/** Shared allowlist for graph-supplied prose in both viewer entry points. */
function setSafe(elm: Element, html: string): void {
  const allowedTags = new Set(["A", "B", "BR", "CODE", "DD", "DIV", "DL", "DT", "EM", "H2", "H3", "LI", "OL", "P", "SPAN", "STRONG", "UL"]);
  const allowedClasses = new Set(["dp-type-body-sm", "dp-type-body-xs", "dp-type-label", "dp-type-label-sm", "dp-type-code", "t-body-sm", "t-label", "t-label-sm", "t-fine", "refs", "cond", "good", "pip", "red", "amber", "you", "info", "risk", "sensor"]);
  // Template contents are inert: images cannot fetch while we inspect them.
  // Only newly created, allowlisted nodes ever enter the active document.
  const template = document.createElement("template");
  template.innerHTML = html;
  const root = template.content;
  const copy = (source: Node): Node => {
    if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent ?? "");
    if (!(source instanceof Element)) return document.createDocumentFragment();
    if (!allowedTags.has(source.tagName)) return document.createTextNode(source.textContent ?? "");
    const target = document.createElement(source.tagName.toLowerCase());
    const classes = [...source.classList].filter(name => allowedClasses.has(name));
    if (classes.length) target.className = classes.join(" ");
    if (source.tagName === "A") {
      const raw = source.getAttribute("href");
      if (raw) {
        try {
          const url = new URL(raw, location.href);
          if (url.protocol === "https:" || url.protocol === "http:") {
            target.setAttribute("href", url.href);
            target.setAttribute("rel", "noreferrer");
          }
        } catch { /* Invalid links are rendered without a destination. */ }
      }
    }
    for (const child of [...source.childNodes]) target.append(copy(child));
    return target;
  };
  const fragment = document.createDocumentFragment();
  if (root) for (const child of [...root.childNodes]) fragment.append(copy(child));
  elm.replaceChildren(fragment);
}

export { setSafe };

// Runs inside the recorded page. Draws a pointer that follows mouse events and
// a ripple on every click. In screen mode only the ripple is drawn, since the
// real pointer is already in the recording.
//
// The layer lives in the browser's top layer (a manual popover), so it stays
// above modal dialogs and popovers, and it re-raises itself whenever one opens.

export function cursorScript({ arrow = true, redact = [] } = {}) {
  return `(() => {
  if (window.__nsrCursor) return;
  window.__nsrCursor = true;
  const ARROW = ${JSON.stringify(arrow)};
  const REDACT = ${JSON.stringify(redact)};
  const KEY = "__nsr_pos";
  const mount = () => {
    if (REDACT.length) {
      const st = document.createElement("style");
      st.textContent = REDACT.join(",") + "{filter:blur(9px)!important}";
      document.documentElement.appendChild(st);
    }
    const root = document.createElement("div");
    root.setAttribute("popover", "manual");
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = "all:initial;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;";
    const css = document.createElement("style");
    css.textContent = \`
      .nsr-arrow{position:absolute;left:0;top:0;width:26px;height:26px;transform-origin:3px 2px;transition:scale .12s ease;will-change:transform;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))}
      .nsr-arrow.down{scale:.82}
      .nsr-ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid rgba(47,91,234,.85);background:rgba(47,91,234,.14);animation:nsr-ring .5s ease-out forwards}
      @keyframes nsr-ring{from{scale:.3;opacity:1}to{scale:1.35;opacity:0}}
    \`;
    root.appendChild(css);
    let arrow = null;
    if (ARROW) {
      arrow = document.createElement("div");
      arrow.className = "nsr-arrow";
      arrow.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26"><path d="M3 2 L3 21 L8 16.5 L11.6 24 L15 22.4 L11.5 15 L18 15 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      arrow.style.opacity = "0";
      root.appendChild(arrow);
    }
    document.documentElement.appendChild(root);
    const raise = () => { try { if (root.matches(":popover-open")) root.hidePopover(); root.showPopover(); } catch {} };
    raise();
    const place = (x, y) => {
      if (!arrow) return;
      arrow.style.opacity = "1";
      arrow.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)";
    };
    try { const p = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (p) place(p.x, p.y); } catch {}
    addEventListener("mousemove", (e) => { place(e.clientX, e.clientY); try { sessionStorage.setItem(KEY, JSON.stringify({ x: e.clientX, y: e.clientY })); } catch {} }, true);
    addEventListener("mousedown", (e) => {
      arrow && arrow.classList.add("down");
      const r = document.createElement("div");
      r.className = "nsr-ring";
      r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      root.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener("mouseup", () => { arrow && arrow.classList.remove("down"); setTimeout(raise, 0); setTimeout(raise, 60); }, true);
    addEventListener("toggle", () => setTimeout(raise, 0), true);
    new MutationObserver((list) => {
      if (list.some((m) => m.target !== root && !root.contains(m.target))) raise();
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["open", "popover"] });
  };
  if (document.documentElement) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();`;
}

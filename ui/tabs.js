// Phone layout: every panel section becomes a tab in a bar directly under the
// viewer (beside it in landscape). Desktop keeps the stacked, collapsible
// sections unchanged.
//
// body.tabbed turns the layout on; the active section carries .tabon. Sections
// that the current view hides (style.display = "none", set by Panel.refresh)
// also hide their tab, and if the open tab disappears the first visible one opens.

const KEY = "inversion.tab";
const QUERY = "(max-width: 820px), (max-height: 500px) and (orientation: landscape)";

export function initPanelTabs(panelEl, controlsEl) {
  const mq = window.matchMedia(QUERY);
  const bar = document.createElement("nav");
  bar.id = "tabbar";
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Panel sections");
  panelEl.insertBefore(bar, controlsEl);

  let tabs = [];
  let cur = null;
  try { cur = localStorage.getItem(KEY); } catch { /* storage unavailable */ }

  const visible = (t) => t.node.style.display !== "none";

  function select(id, scroll = true) {
    const t = tabs.find((x) => x.id === id && visible(x)) || tabs.find(visible);
    if (!t) return;
    cur = t.id;
    for (const x of tabs) {
      const on = x === t;
      x.btn.classList.toggle("sel", on);
      x.btn.setAttribute("aria-selected", on ? "true" : "false");
      x.node.classList.toggle("tabon", on);
    }
    if (document.body.classList.contains("tabbed")) {
      t.node.classList.remove("closed"); // a folded section would show an empty tab
      panelEl.scrollTop = 0;
      if (scroll) t.btn.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
    try { localStorage.setItem(KEY, t.id); } catch { /* storage unavailable */ }
  }

  function sync() {
    for (const t of tabs) t.btn.hidden = !visible(t);
    const active = tabs.find((t) => t.id === cur);
    if (!active || !visible(active)) select(cur, false);
  }

  // (Re)build the tab list from the sections Panel.build() produced.
  function rebuild() {
    bar.innerHTML = "";
    tabs = [...controlsEl.querySelectorAll(":scope > .sec")].map((node) => {
      const hd = node.querySelector(":scope > .hd");
      const name = (hd && hd.textContent.trim()) || "Actions";
      const id = node.id || name;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      btn.textContent = name;
      btn.setAttribute("role", "tab");
      btn.addEventListener("click", () => select(id));
      bar.appendChild(btn);
      return { id, node, btn };
    });
    for (const t of tabs) styleWatch.observe(t.node, { attributes: true, attributeFilter: ["style"] });
    sync();
    select(cur, false);
  }

  const styleWatch = new MutationObserver(sync);
  new MutationObserver(rebuild).observe(controlsEl, { childList: true });

  const apply = () => {
    document.body.classList.toggle("tabbed", mq.matches);
    panelEl.classList.remove("open");
    if (mq.matches) select(cur, false);
  };
  if (mq.addEventListener) mq.addEventListener("change", apply); else mq.addListener(apply);
  rebuild();
  apply();
  return { select };
}

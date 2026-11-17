/* Schema-driven control panel. Every bound control knows its state path
   and default, so double-clicking a label resets it and changed values
   are marked. */
import { getPath, setPath, DEFAULTS } from "../engine/state.js";

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class Panel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.items = [];
    this.sections = [];
  }
  path(it) { return typeof it.path === "function" ? it.path() : it.path; }
  read(it) {
    const v = getPath(this.app.S, this.path(it));
    return it.from ? it.from(v) : v;
  }
  write(it, v, commit) {
    const val = it.to ? it.to(v) : v;
    setPath(this.app.S, this.path(it), val);
    if (it.onChange) it.onChange(val);
    this.app.changed({ commit, path: this.path(it) });
    this.refreshItem(it);
    if (it.refreshAll) this.refresh();
  }
  defaultOf(it) {
    const v = getPath(DEFAULTS, this.path(it));
    return v === undefined ? undefined : (it.from ? it.from(v) : v);
  }
  reset(it) {
    const d = getPath(DEFAULTS, this.path(it));
    if (d === undefined) return;
    setPath(this.app.S, this.path(it), JSON.parse(JSON.stringify(d)));
    if (it.onChange) it.onChange(d);
    this.app.changed({ commit: true, path: this.path(it) });
    this.refresh();
  }

  build(sections) {
    this.root.innerHTML = "";
    for (const sec of sections) {
      const s = el("section", "sec");
      if (sec.id) s.id = "sec-" + sec.id;
      if (sec.title) {
        const hd = el("div", "hd", sec.title);
        if (sec.collapsible) {
          hd.classList.add("fold");
          hd.addEventListener("click", () => { s.classList.toggle("closed"); });
          if (sec.closed) s.classList.add("closed");
        }
        s.appendChild(hd);
      }
      const body = el("div", "body");
      s.appendChild(body);
      for (const it of sec.items) this.make(it, body);
      this.root.appendChild(s);
      this.sections.push({ sec, node: s });
    }
    this.refresh();
  }

  label(it, wrap, valueEl) {
    const lab = el("div", "lab");
    const sp = el("span", null, it.label);
    if (it.tip) sp.title = it.tip;
    lab.appendChild(sp);
    if (valueEl) lab.appendChild(valueEl);
    if (it.path) {
      sp.classList.add("rst");
      sp.title = (it.tip ? it.tip + "\n" : "") + "Double-click to reset";
      sp.addEventListener("dblclick", () => this.reset(it));
    }
    wrap.appendChild(lab);
    it._lab = sp;
  }

  make(it, parent) {
    let node;
    switch (it.type) {
      case "range": {
        node = el("div", "row");
        const b = el("b");
        this.label(it, node, b);
        const r = el("input");
        r.type = "range"; r.min = it.min; r.max = it.max; r.step = it.step ?? 0.01;
        r.addEventListener("input", () => this.write(it, parseFloat(r.value), false));
        r.addEventListener("change", () => this.app.commit());
        node.appendChild(r);
        it._in = r; it._out = b;
        break;
      }
      case "check": {
        node = el("label", "chk");
        const c = el("input");
        c.type = "checkbox";
        c.addEventListener("change", () => this.write(it, c.checked, true));
        node.appendChild(c);
        const sp = el("span", null, it.label);
        node.appendChild(sp);
        if (it.tip) node.title = it.tip;
        it._in = c; it._lab = sp;
        node.addEventListener("dblclick", (e) => { e.preventDefault(); this.reset(it); });
        break;
      }
      case "select": {
        node = el("div", "row");
        if (it.label) this.label(it, node);
        const s = el("select");
        for (const [v, l] of it.options) { const o = el("option", null, l); o.value = v; s.appendChild(o); }
        s.addEventListener("change", () => this.write(it, it.num ? +s.value : s.value, true));
        node.appendChild(s);
        it._in = s;
        break;
      }
      case "seg": {
        node = el("div", "row");
        if (it.label) this.label(it, node);
        const g = el("div", "seg");
        it._btns = it.options.map(([v, l]) => {
          const b = el("button", null, l);
          b.type = "button";
          b.addEventListener("click", () => this.write(it, v, true));
          g.appendChild(b);
          return [v, b];
        });
        node.appendChild(g);
        break;
      }
      case "buttons": {
        node = el("div", "btns");
        it._btns = it.buttons.map((bt) => {
          const b = el("button", "act" + (bt.wide ? " wide" : ""), bt.label);
          b.type = "button";
          if (bt.id) b.id = bt.id;
          if (bt.tip) b.title = bt.tip;
          b.addEventListener("click", () => bt.onClick(b));
          node.appendChild(b);
          return b;
        });
        break;
      }
      case "hint": {
        node = el("div", "hint");
        break;
      }
      case "html": {
        node = el("div", it.cls || "");
        if (it.render) it.render(node);
        break;
      }
    }
    it._node = node;
    parent.appendChild(node);
    this.items.push(it);
  }

  refreshItem(it) {
    const show = it.show ? !!it.show() : true;
    it._node.style.display = show ? "" : "none";
    if (!show) return;
    if (it.path) {
      const v = this.read(it);
      const d = this.defaultOf(it);
      const mod = d !== undefined && JSON.stringify(v) !== JSON.stringify(d);
      if (it._lab) it._lab.classList.toggle("mod", mod);
      if (it.type === "range") {
        if (document.activeElement !== it._in) it._in.value = v;
        it._out.innerHTML = it.fmt ? it.fmt(v) : (+v).toFixed(2);
      } else if (it.type === "check") it._in.checked = !!v;
      else if (it.type === "select") it._in.value = String(v);
      else if (it.type === "seg") for (const [val, b] of it._btns) b.classList.toggle("on", val === v);
    }
    if (it.type === "hint") it._node.innerHTML = typeof it.html === "function" ? it.html() : it.html;
    if (it.type === "html" && it.update) it.update(it._node);
    if (it.type === "buttons" && it.update) it.update(it._btns);
  }
  refresh() {
    for (const { sec, node } of this.sections) node.style.display = sec.show && !sec.show() ? "none" : "";
    for (const it of this.items) this.refreshItem(it);
  }
  /* cheap refresh for readouts only */
  refreshLive() {
    for (const it of this.items) if (it.live && it._node.style.display !== "none") this.refreshItem(it);
  }
}

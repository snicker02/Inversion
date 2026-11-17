/* Off-thread limit-set search so the interface stays responsive. */
import { buildRecipe, commutatorTrace } from "../math/recipes.js";
import { limitSet, limitBounds } from "../math/dfs.js";

self.onmessage = (e) => {
  const { id, kind, params, view, opt } = e.data;
  try {
    const g = buildRecipe(params);
    if (kind === "bounds") {
      self.postMessage({ id, kind, bounds: limitBounds(g) });
      return;
    }
    const t0 = performance.now();
    const r = limitSet(g, view, opt);
    const data = r.data.slice();
    const ct = commutatorTrace(g);
    self.postMessage({
      id, kind, data, segs: r.segs, nodes: r.nodes, truncated: r.truncated, cx: r.cx, cy: r.cy,
      ms: performance.now() - t0, comm: ct,
    }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id, kind, error: String(err && err.message || err) });
  }
};

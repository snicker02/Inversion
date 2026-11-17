/* Compile every shader variant with glslangValidator as GLSL ES 1.00.
   Run: node tests/shaders.test.mjs */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { planeFS, planeKey } from "../engine/shaders/plane.js";
import { spaceFS, spaceKey } from "../engine/shaders/space.js";
import { VS } from "../engine/shaders/common.js";
import { PRESENT_FS, LS_VS, LS_FS, LS_PRESENT_FS } from "../engine/shaders/present.js";

const dir = "/tmp/inversion-glsl";
mkdirSync(dir, { recursive: true });
let fails = 0, n = 0, maxVec = 0, maxName = "";

/* rough fragment uniform-vector count, as WebGL1 packs them */
function uniformVectors(src) {
  let total = 0;
  const re = /uniform\s+(\w+)\s+([^;]+);/g;
  let m;
  while ((m = re.exec(src))) {
    const type = m[1];
    for (const decl of m[2].split(",")) {
      const arr = /\[(\w+)\]/.exec(decl);
      let count = 1;
      if (arr) {
        const def = new RegExp("#define\\s+" + arr[1] + "\\s+(\\d+)").exec(src);
        count = def ? +def[1] : +arr[1];
      }
      const per = type === "mat4" ? 4 : type === "mat3" ? 3 : 1;
      total += count * per;
    }
  }
  return total;
}

function check(name, src, stage) {
  n++;
  const file = `${dir}/${name}.${stage}`;
  const lines = src.split("\n");
  /* #version must be first; keep #extension right after it */
  writeFileSync(file, "#version 100\n" + lines.join("\n"));
  try {
    execFileSync("glslangValidator", [file], { stdio: "pipe" });
  } catch (e) {
    fails++;
    console.log(`FAIL ${name}\n${e.stdout}`);
  }
  if (stage === "frag") {
    const v = uniformVectors(src);
    if (v > maxVec) { maxVec = v; maxName = name; }
  }
}

check("vs", VS, "vert");
check("ls_vs", LS_VS, "vert");
check("present", PRESENT_FS, "frag");
check("ls_fs", LS_FS, "frag");
check("ls_present", LS_PRESENT_FS, "frag");

const variants = [];
for (const ginv of [0, 1]) for (const relief of [0, 1]) {
  for (const deep of [0, 1]) for (const dual of [0, 1]) {
    const shapes = deep || dual ? [-1] : [-1, 0, 1, 2];
    for (const shape of shapes) variants.push({ form: 0, deep, dual, shape, ginv, relief });
  }
  variants.push({ form: 1, deep: 0, dual: 0, shape: -1, ginv, relief });
  variants.push({ form: 2, deep: 0, dual: 0, shape: -1, ginv, relief });
}
for (const o of variants) check("plane_" + planeKey(o).replace(/\|/g, "_"), planeFS(o), "frag");
for (let form = 0; form < 4; form++) for (const ginv of [0, 1]) {
  const o = { form, ginv };
  check("space_" + spaceKey(o).replace(/\|/g, "_"), spaceFS(o), "frag");
}

console.log(`${n - fails}/${n} shaders compile; max fragment uniform vectors ${maxVec} (${maxName})`);
process.exit(fails ? 1 : 0);

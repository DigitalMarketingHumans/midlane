// Draw-call optimiser for hero models. Rig nodes carry many small static parts
// (each with an outline child). We merge parts that share a node + material into
// one mesh (and their outlines into one outline mesh). To stay safe with hero code
// that animates individual parts, the model is first exercised through every move
// and reaction; any part whose transform, visibility, material or geometry changes
// is left untouched.
import * as THREE from 'three';

function sig(m) {
  const p = m.position, r = m.rotation, s = m.scale;
  const pa = m.geometry && m.geometry.attributes.position;
  return `${m.visible}|${m.material && m.material.uuid}|${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}|${r.x.toFixed(4)},${r.y.toFixed(4)},${r.z.toFixed(4)}|${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)}|${m.geometry && m.geometry.uuid}|${pa ? pa.version : 0}|${m.children.length}`;
}

function mergeGeos(list) {
  // list: [{ geo, matrix }] → merged BufferGeometry with position/normal(/uv)
  const hasUv = list.every((x) => x.geo.attributes.uv);
  let vcount = 0, icount = 0;
  for (const { geo } of list) {
    vcount += geo.attributes.position.count;
    icount += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const pos = new Float32Array(vcount * 3), nrm = new Float32Array(vcount * 3);
  const uv = hasUv ? new Float32Array(vcount * 2) : null;
  const idx = vcount > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const { geo, matrix } of list) {
    nm.getNormalMatrix(matrix);
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      if (N) { n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nrm[(vo + i) * 3] = n.x; nrm[(vo + i) * 3 + 1] = n.y; nrm[(vo + i) * 3 + 2] = n.z; }
      if (uv) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
    }
    if (geo.index) { const I = geo.index; for (let k = 0; k < I.count; k++) idx[io + k] = I.getX(k) + vo; io += I.count; }
    else { for (let k = 0; k < P.count; k++) idx[io + k] = vo + k; io += P.count; }
    vo += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// fakes: array of fighter-like states to exercise the model with.
export function optimizeView(view, fakes) {
  const rig = view.rig;
  const ms = view.ms;
  const mergeable = new Set([...ms.mats, ...ms.glows.filter((g) => !g.transparent && g.blending === THREE.NormalBlending)]);
  const nodes = [rig.hips, rig.chest, rig.head, ...Object.values(rig.seg), rig.hand.L, rig.hand.R, rig.foot.L, rig.foot.R];
  const nodeSet = new Set(nodes);
  // Candidates: meshes under a rig node (possibly inside plain sub-groups), with a
  // mergeable material and only an outline child. Ancestors up to the node are tracked
  // so any animated sub-group disqualifies its contents.
  const cands = [];
  const visit = (node, obj, chain) => {
    for (const m of obj.children) {
      if (nodeSet.has(m)) continue;
      if (m.isMesh) {
        if (!m.geometry || !mergeable.has(m.material)) continue;
        if (m.material.map && !m.geometry.attributes.uv) continue;
        if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) continue;
        if (m.children.some((c) => !(c.isMesh && c.material === ms.outline && c.children.length === 0))) continue;
        if (m.userData.noMerge || m.isSkinnedMesh || m.isInstancedMesh) continue;
        cands.push({ m, node, chain, s: sig(m), cs: chain.map(sig) });
      } else if ((m.type === 'Group' || m.type === 'Object3D') && m.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && !m.userData.noMerge) {
        visit(node, m, [...chain, m]);
      }
    }
  };
  for (const node of nodes) visit(node, node, []);
  // Exercise the model; drop anything that changes.
  const G = { lock: null, frame: 1, fighters: [] };
  let t = 0;
  for (const f of fakes) {
    for (let k = 0; k < 2; k++) {
      t += 1 / 30;
      try { view.update(f, G, 1 / 30, t); } catch (e) { /* ignore */ }
      for (const c of cands) if (!c.bad && (sig(c.m) !== c.s || c.chain.some((g, i) => sig(g) !== c.cs[i]))) c.bad = true;
    }
  }
  const groups = new Map();
  for (const c of cands) {
    if (c.bad) continue;
    const key = c.node.uuid + '|' + c.m.material.uuid;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const node = list[0].node;
    const mat = list[0].m.material;
    const body = [], lines = [];
    let shadow = false;
    for (const { m, chain } of list) {
      const rel = new THREE.Matrix4();
      for (const g of chain) { g.updateMatrix(); rel.multiply(g.matrix); }
      m.updateMatrix();
      rel.multiply(m.matrix);
      body.push({ geo: m.geometry, matrix: rel.clone() });
      const o = m.children[0];
      if (o) { o.updateMatrix(); lines.push({ geo: o.geometry, matrix: rel.clone().multiply(o.matrix) }); }
      if (m.castShadow) shadow = true;
    }
    const merged = new THREE.Mesh(mergeGeos(body), mat);
    merged.castShadow = shadow;
    merged.frustumCulled = false;
    if (lines.length) {
      const ol = new THREE.Mesh(mergeGeos(lines), ms.outline);
      ol.frustumCulled = false;
      merged.add(ol);
    }
    for (const { m } of list) { m.parent.remove(m); removed++; }
    node.add(merged);
  }
  // Tiny details don't need to cast shadows.
  let noShadow = 0;
  view.group.traverse((o) => {
    if (!o.isMesh || !o.castShadow || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const s = o.getWorldScale(new THREE.Vector3());
    if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.05) { o.castShadow = false; noShadow++; }
  });
  return { candidates: cands.length, dynamic: cands.filter((c) => c.bad).length, merged: removed, noShadow };
}

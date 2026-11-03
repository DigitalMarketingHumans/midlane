// Minimal fallback stage used for development.
import * as THREE from 'three';

export default {
  id: 'debug', name: 'Training Grounds', sub: 'A quiet yard for practice', music: 'stage_river',
  build() {
    const group = new THREE.Group();
    const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.95 }));
    g.rotation.x = -Math.PI / 2; g.position.z = -20; g.receiveShadow = true;
    group.add(g);
    const grid = new THREE.GridHelper(40, 40, 0x556070, 0x464c58);
    grid.position.y = 0.002; group.add(grid);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 a = vec3(0.08,0.1,0.16), b = vec3(0.25,0.3,0.42); gl_FragColor = vec4(mix(b, a, clamp(h*2.0,0.0,1.0)), 1.0); }',
    }));
    group.add(sky);
    return {
      group,
      lighting: {
        hemiSky: 0xbfd0ff, hemiGround: 0x3a3028, hemiIntensity: 1.3,
        key: { color: 0xfff0dc, intensity: 2.4, dir: [3, 7, 6] },
        rim: { color: 0x7fa0ff, intensity: 1.6, dir: [-5, 3, -6] },
        rim2: { color: 0xffb070, intensity: 0.9, dir: [6, 2, -5] },
      },
      fog: { color: 0x1c2130, near: 25, far: 90 },
      background: null, exposure: 1.0,
      bloom: { strength: 0.8, radius: 0.45, threshold: 0.82 },
      update() {},
      dispose() {},
    };
  },
};

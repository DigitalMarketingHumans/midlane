// Post-processing chain: render → bloom → grade (vignette, chromatic aberration,
// saturation, flash) → output (ACES tone mapping + sRGB).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.32 },
    chroma: { value: 0.0 },
    sat: { value: 1.0 },
    contrast: { value: 1.04 },
    flashCol: { value: new THREE.Color(1, 1, 1) },
    flash: { value: 0.0 },
    tint: { value: new THREE.Color(1, 1, 1) },
    aspect: { value: 1.6 },
    time: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float vignette; uniform float chroma; uniform float sat; uniform float contrast;
    uniform vec3 flashCol; uniform float flash; uniform vec3 tint; uniform float aspect; uniform float time;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
      vec2 off = c * chroma * 0.02;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      col = (col - 0.5 * 0.18) * contrast + 0.5 * 0.18;
      col *= tint;
      col *= 1.0 - vignette * smoothstep(0.08, 0.9, r2);
      col = mix(col, flashCol * 2.0, flash);
      // subtle film grain to kill banding
      float n = fract(sin(dot(vUv * 1000.0 + time, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.008;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    const size = renderer.getSize(new THREE.Vector2());
    const bs = quality === 'low' ? 0.35 : 0.5;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * bs, size.y * bs), 0.85, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.u = this.grade.uniforms;
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
    this.u.aspect.value = w / h;
  }
  setBloom(o) {
    if (!o) return;
    if (o.strength != null) this.bloom.strength = o.strength;
    if (o.radius != null) this.bloom.radius = o.radius;
    if (o.threshold != null) this.bloom.threshold = o.threshold;
  }
  draw(dt) {
    this.u.time.value = (this.u.time.value + dt) % 100;
    this.composer.render(dt);
  }
}

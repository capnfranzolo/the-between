'use client';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function CosmosScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ─── SETUP ───
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.5, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    scene.fog = new THREE.FogExp2(0x2A1B3D, 0.0012);

    // ─── LIGHTING ───
    scene.add(new THREE.AmbientLight(0x6B4D8A, 0.8));
    const dirLight = new THREE.DirectionalLight(0xF0C080, 0.4);
    dirLight.position.set(0, 5, -200);
    scene.add(dirLight);
    scene.add(new THREE.HemisphereLight(0x5A3D78, 0x1E1030, 0.3));

    // ─── SKY DOME ───
    const skyGeo = new THREE.SphereGeometry(900, 64, 64);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vLocalPos;
        vec3 hex(float r, float g, float b) { return vec3(r, g, b) / 255.0; }
        void main() {
          float y = vLocalPos.y;
          float breathe = sin(uTime * 0.02) * 0.002;
          vec3 zenith    = hex(30.0, 24.0, 64.0);
          vec3 upper     = hex(61.0, 45.0, 101.0);
          vec3 mid       = hex(110.0, 70.0, 125.0);
          vec3 low       = hex(155.0, 100.0, 135.0);
          vec3 rose      = hex(180.0, 120.0, 130.0);
          vec3 horizPeak = hex(210.0, 150.0, 110.0);
          vec3 color;
          if (y < -0.15) { color = rose; }
          else if (y < 0.0) { color = mix(rose, horizPeak, smoothstep(-0.15, 0.0, y)); }
          else if (y < 0.008 + breathe) { color = mix(horizPeak, rose, smoothstep(0.0, 0.008 + breathe, y)); }
          else if (y < 0.04) { color = mix(rose, low, smoothstep(0.008 + breathe, 0.04, y)); }
          else if (y < 0.12) { color = mix(low, mid, smoothstep(0.04, 0.12, y)); }
          else if (y < 0.4) { color = mix(mid, upper, smoothstep(0.12, 0.4, y)); }
          else { color = mix(upper, zenith, smoothstep(0.4, 1.0, y)); }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.rotation.x = -8 * Math.PI / 180;
    scene.add(skyDome);

    // ─── STARS ───
    const starCount = 300;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;
      const r = 880;
      starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      starSizes[i] = 1.5 + Math.random() * 2.5;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
    const starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float size;
        varying float vSize;
        void main() {
          vSize = size;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vSize;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, d) * 0.7;
          alpha *= 0.6 + 0.4 * sin(uTime * (1.0 + vSize * 0.5) + vSize * 10.0);
          gl_FragColor = vec4(0.9, 0.85, 1.0, alpha);
        }
      `,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ─── TERRAIN ───
    const TERRAIN_SIZE = 3200;
    const TERRAIN_SEGS = 300;
    const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
    const terrainMat = new THREE.MeshLambertMaterial({ color: 0x503868 });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    scene.add(terrain);

    let terrainOffsetX = 0;
    let terrainOffsetZ = 0;

    function getHeight(wx: number, wz: number): number {
      return Math.sin(wx * 0.004) * 24 + Math.sin(wz * 0.005) * 20
           + Math.sin(wx * 0.01 + wz * 0.008) * 12 + Math.sin(wx * 0.02 - wz * 0.015) * 6
           + Math.sin(wx * 0.035 + wz * 0.03) * 3 + Math.sin(wx * 0.06 - wz * 0.05) * 1.5;
    }

    function updateTerrainGeometry() {
      const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
      const half = TERRAIN_SIZE / 2;
      const step = TERRAIN_SIZE / TERRAIN_SEGS;
      for (let i = 0; i <= TERRAIN_SEGS; i++) {
        for (let j = 0; j <= TERRAIN_SEGS; j++) {
          const idx = i * (TERRAIN_SEGS + 1) + j;
          const lx = -half + j * step;
          const lz = -half + i * step;
          pos.setZ(idx, getHeight(lx + terrainOffsetX, lz + terrainOffsetZ));
        }
      }
      pos.needsUpdate = true;
      terrainGeo.computeVertexNormals();
    }
    updateTerrainGeometry();

    // ─── CLOUDS ───
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 30; i++) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const ctx = c.getContext('2d')!;
      const blobs = 6 + Math.floor(Math.random() * 7);
      for (let j = 0; j < blobs; j++) {
        const x = 40 + Math.random() * 176;
        const y = 20 + Math.random() * 88;
        const r = 20 + Math.random() * 40;
        const a = 0.06 + Math.random() * 0.09;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(140,100,170,${a})`);
        grad.addColorStop(1, 'rgba(140,100,170,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 128);
      }
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 });
      const sprite = new THREE.Sprite(mat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 280;
      sprite.position.set(Math.cos(angle) * dist, 25 + Math.random() * 50, Math.sin(angle) * dist);
      sprite.scale.set(30 + Math.random() * 50, 15 + Math.random() * 20, 1);
      sprite.userData = { dx: (Math.random() - 0.5) * 0.3, dz: (Math.random() - 0.5) * 0.3 };
      scene.add(sprite);
      clouds.push(sprite);
    }

    // ─── CAMERA STATE ───
    let heading = 0;
    let targetHeading: number | null = null;
    let speed = 4;
    let clickBoostTime = 0;
    camera.position.set(0, 80, 0);
    let lastSnapX = 0;
    let lastSnapZ = 0;
    let disposed = false;

    // ─── INPUT ───
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ─── ANIMATION ───
    const clock = new THREE.Clock();

    function animate() {
      if (disposed) return;
      requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.getElapsedTime();

      skyMat.uniforms.uTime.value = time;
      skyDome.position.copy(camera.position);
      stars.position.copy(camera.position);
      starMat.uniforms.uTime.value = time;

      const targetSpeed = keys['Space'] ? 25 : (clickBoostTime > 0 ? 18 : 4);
      speed += (targetSpeed - speed) * dt * 3;
      if (clickBoostTime > 0) clickBoostTime -= dt;

      if (targetHeading !== null) {
        let diff = targetHeading - heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        heading += diff * dt * 1.5;
        if (Math.abs(diff) < 0.05) targetHeading = null;
      }

      const fwdX = Math.sin(heading);
      const fwdZ = -Math.cos(heading);
      camera.position.x += fwdX * speed * dt;
      camera.position.z += fwdZ * speed * dt;
      camera.position.y = Math.max(getHeight(camera.position.x, camera.position.z) + 40, 80 + Math.sin(time * 0.3) * 0.4);

      const lookDist = 200;
      camera.lookAt(new THREE.Vector3(
        camera.position.x + fwdX * lookDist,
        camera.position.y + Math.tan(17 * Math.PI / 180) * lookDist,
        camera.position.z + fwdZ * lookDist,
      ));

      // Terrain snap
      if (Math.abs(camera.position.x - lastSnapX) > 300 || Math.abs(camera.position.z - lastSnapZ) > 300) {
        lastSnapX = Math.round(camera.position.x / 300) * 300;
        lastSnapZ = Math.round(camera.position.z / 300) * 300;
        terrainOffsetX = lastSnapX;
        terrainOffsetZ = lastSnapZ;
        terrain.position.set(lastSnapX, 0, lastSnapZ);
        updateTerrainGeometry();
      }

      // Clouds
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.dx * dt;
        cloud.position.z += cloud.userData.dz * dt;
        const dx = cloud.position.x - camera.position.x;
        const dz = cloud.position.z - camera.position.z;
        if (dx * dx + dz * dz > 320 * 320) {
          const a = Math.random() * Math.PI * 2;
          const d = 100 + Math.random() * 180;
          cloud.position.set(
            camera.position.x + Math.cos(a) * d,
            25 + Math.random() * 50,
            camera.position.z + Math.sin(a) * d,
          );
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      clouds.forEach(c => { (c.material as THREE.SpriteMaterial).map?.dispose(); c.material.dispose(); });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
    />
  );
}

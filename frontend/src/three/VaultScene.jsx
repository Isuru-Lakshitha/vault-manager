import { useThreeScene, lightAndRender } from './useThreeScene';

/*
 * Sign-in hero: a floating glass-and-metal vault door with coins orbiting it,
 * in the app's accent colours. Turns gently toward the pointer.
 * Falls back to `fallback` when WebGL isn't available.
 */
export default function VaultScene({ fallback = null, className = '' }) {
  const { canvasRef, status } = useThreeScene((ctx) => {
    const { THREE, scene, camera, colors, pointer } = ctx;
    camera.position.set(0, 0.2, 10.8);
    lightAndRender(ctx);

    const accent = new THREE.Color(colors.accent);
    const accent2 = new THREE.Color(colors.accent2);
    scene.add(new THREE.HemisphereLight(0xffffff, colors.light ? 0xdde3ee : 0x0b0f1a, colors.light ? 1.1 : 0.7));
    const key = new THREE.PointLight(accent, 60, 30); key.position.set(-4, 3, 5); scene.add(key);
    const rim = new THREE.PointLight(accent2, 50, 30); rim.position.set(4, -2, 4); scene.add(rim);

    const vault = new THREE.Group();
    scene.add(vault);

    // Door ring
    const metal = new THREE.MeshPhysicalMaterial({ color: colors.light ? 0xc9d3e6 : 0x9aa7c2, metalness: 1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.32, 48, 128), metal);
    vault.add(ring);

    // Glass face
    // Radial accent glow painted onto the glass face (centre → edge).
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const g2d = glowCanvas.getContext('2d');
    const grad = g2d.createRadialGradient(128, 110, 10, 128, 128, 128);
    grad.addColorStop(0, `#${accent.clone().lerp(new THREE.Color(0xffffff), 0.35).getHexString()}`);
    grad.addColorStop(0.55, `#${accent.getHexString()}`);
    grad.addColorStop(1, `#${accent2.clone().multiplyScalar(0.55).getHexString()}`);
    g2d.fillStyle = grad; g2d.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const glass = new THREE.MeshPhysicalMaterial({
      map: glowTex, emissive: accent.clone().multiplyScalar(colors.light ? 0.05 : 0.18), metalness: 0.1, roughness: 0.18,
      clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.5, iridescenceIOR: 1.3, transparent: true, opacity: 0.95,
    });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.22, 96), glass);
    face.rotation.x = Math.PI / 2;
    vault.add(face);
    // Inner ring for depth
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 24, 96), metal);
    inner.position.z = 0.13;
    vault.add(inner);

    // Dial + spokes
    const dialMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.18, clearcoat: 1 });
    const hubMat = new THREE.MeshPhysicalMaterial({ color: accent.clone().lerp(new THREE.Color(0xffffff), 0.45), metalness: 1, roughness: 0.25, clearcoat: 1 });
    const dial = new THREE.Group();
    dial.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 64).rotateX(Math.PI / 2).translate(0, 0, 0.2), hubMat));
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 2.2, 8, 16), dialMat);
      spoke.rotation.z = (i / 3) * Math.PI; spoke.position.z = 0.28;
      dial.add(spoke);
    }
    vault.add(dial);

    // Bolts around the ring
    const boltGeo = new THREE.SphereGeometry(0.09, 16, 16);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const b = new THREE.Mesh(boltGeo, dialMat);
      b.position.set(Math.cos(a) * 2, Math.sin(a) * 2, 0.33);
      vault.add(b);
    }

    // Orbiting coins
    const coinMat = new THREE.MeshPhysicalMaterial({ color: 0xe0a83e, metalness: 1, roughness: 0.32, clearcoat: 0.6 });
    const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 48);
    const coins = Array.from({ length: 7 }, (_, i) => {
      const m = new THREE.Mesh(coinGeo, coinMat);
      m.userData = { a: (i / 7) * Math.PI * 2, r: 2.55 + (i % 2) * 0.25, y: (i % 3 - 1) * 0.55, s: 0.35 + (i % 3) * 0.08 };
      scene.add(m);
      return m;
    });

    return {
      update(t) {
        vault.position.y = Math.sin(t * 0.8) * 0.12;
        vault.rotation.y = -0.35 + pointer.x * 0.35 + Math.sin(t * 0.3) * 0.08;
        vault.rotation.x = 0.12 + pointer.y * 0.2;
        dial.rotation.z = Math.sin(t * 0.6) * 0.6;
        coins.forEach((c) => {
          const { a, r, y, s } = c.userData;
          const ang = a + t * s;
          c.position.set(Math.cos(ang) * r, y + Math.sin(ang * 2) * 0.25, Math.sin(ang) * r * 0.55);
          c.rotation.set(Math.PI / 2 + Math.sin(t + a) * 0.4, ang * 2, 0);
        });
      },
    };
  });

  return (
    <div className={`three-stage ${className}`} data-status={status}>
      <canvas ref={canvasRef} className="three-canvas" aria-hidden="true" />
      {status === 'unsupported' && fallback}
    </div>
  );
}

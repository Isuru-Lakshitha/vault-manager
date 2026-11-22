import { useThreeScene, lightAndRender } from './useThreeScene';
import { stackCounts } from './stackCounts';


/*
 * Dashboard net-worth visual: two stacks of coins on a glass plate, green for
 * assets and red for debt, sized by their share. Coins drop in one by one.
 * Purely decorative (the card shows the exact figures).
 */
export default function CoinStacksScene({ assets = 0, debt = 0, className = '' }) {
  const counts = stackCounts(assets, debt);
  const { canvasRef, status } = useThreeScene((ctx) => {
    const { THREE, scene, camera, colors, pointer } = ctx;
    camera.position.set(0, 3.2, 8.2);
    camera.lookAt(0, 1.1, 0);
    lightAndRender(ctx);
    scene.add(new THREE.HemisphereLight(0xffffff, colors.light ? 0xdde3ee : 0x0b0f1a, colors.light ? 1.0 : 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 6, 4); scene.add(key);

    const stage = new THREE.Group();
    scene.add(stage);

    // Glass plate
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.5, 0.16, 96),
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colors.accent), metalness: 0.2, roughness: 0.15, clearcoat: 1, transparent: true, opacity: colors.light ? 0.35 : 0.45, iridescence: 0.5 }),
    );
    plate.position.y = -0.08;
    stage.add(plate);

    const coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.2, 64);
    const mat = (hex) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), metalness: 0.85, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.2 });
    const coins = [];
    const build = (n, x, material, delay0) => {
      for (let i = 0; i < n; i++) {
        const c = new THREE.Mesh(coinGeo, material);
        const restY = 0.1 + i * 0.21;
        c.userData = { restY, delay: delay0 + i * 0.07, x, wobble: (i % 2 ? 1 : -1) * 0.04 };
        c.position.set(x, restY + 6, 0);
        stage.add(c);
        coins.push(c);
      }
    };
    const both = counts.a > 0 && counts.d > 0;
    build(counts.a, both ? -0.85 : 0, mat(colors.success), 0);
    build(counts.d, both ? 0.85 : 0, mat(colors.danger), 0.15);

    const easeOutBack = (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
    return {
      update(t) {
        stage.rotation.y = Math.sin(t * 0.35) * 0.35 + pointer.x * 0.25;
        coins.forEach((c) => {
          const { restY, delay, x, wobble } = c.userData;
          const p = Math.min(1, Math.max(0, (t - delay) / 0.55));
          c.position.y = restY + (1 - easeOutBack(p)) * 6;
          c.position.x = x + Math.sin(t * 1.2 + restY * 3) * wobble;
          c.rotation.y = t * 0.2 + restY;
        });
      },
    };
  }, [counts.a, counts.d]);

  if (counts.a + counts.d === 0) return null;
  return (
    <div className={`three-stage ${className}`} data-status={status} aria-hidden="true">
      <canvas ref={canvasRef} className="three-canvas" />
    </div>
  );
}

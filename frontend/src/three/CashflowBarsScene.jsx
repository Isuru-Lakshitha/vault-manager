import { useThreeScene, lightAndRender } from './useThreeScene';
import { useLang } from '../i18n';

/*
 * Analytics: last months of income (green) vs spending (red) as 3D bars on a
 * glass floor. Bars rise in one month at a time; month labels sit in front.
 * `months` = [{ month: 'YYYY-MM', Income, Expense }], oldest first.
 */
export default function CashflowBarsScene({ months = [], className = '' }) {
  const lang = useLang();
  const locale = lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : undefined;
  const key = months.map((m) => `${m.month}:${Math.round(m.Income || 0)}:${Math.round(m.Expense || 0)}`).join('|');
  const { canvasRef, status } = useThreeScene((ctx) => {
    const { THREE, scene, camera, colors, pointer } = ctx;
    const n = Math.max(1, months.length);
    const spacing = 1.6;
    const width = (n - 1) * spacing;
    camera.position.set(0, 3.4, 5.2 + n * 0.55);
    camera.lookAt(0, 1.35, 0);
    lightAndRender(ctx);
    scene.add(new THREE.HemisphereLight(0xffffff, colors.light ? 0xdde3ee : 0x0b0f1a, colors.light ? 1.0 : 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(4, 8, 6); scene.add(sun);

    const stage = new THREE.Group();
    scene.add(stage);

    // Glass floor with a faint grid
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width + 2.4, 0.08, 3),
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colors.accent), metalness: 0.1, roughness: 0.2, clearcoat: 1, transparent: true, opacity: colors.light ? 0.25 : 0.35 }),
    );
    floor.position.y = -0.04;
    stage.add(floor);
    const grid = new THREE.GridHelper(width + 2.4, n * 2 + 2, colors.accent, colors.accent);
    grid.material.transparent = true; grid.material.opacity = colors.light ? 0.15 : 0.12;
    grid.scale.z = 3 / (width + 2.4);
    stage.add(grid);

    const max = Math.max(1, ...months.flatMap((m) => [Number(m.Income) || 0, Number(m.Expense) || 0]));
    const H = 3.2;
    const barMat = (hex) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), metalness: 0.35, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
    const incomeMat = barMat(colors.success);
    const expenseMat = barMat(colors.danger);
    const geo = new THREE.BoxGeometry(0.52, 1, 0.52);
    geo.translate(0, 0.5, 0); // grow from the floor
    const bars = [];

    const label = (text) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 96;
      const g = c.getContext('2d');
      g.font = '600 44px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = colors.text2; g.fillText(text, 128, 48);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(1.35, 0.5, 1);
      return sp;
    };

    months.forEach((m, i) => {
      const x = -width / 2 + i * spacing;
      [[Number(m.Income) || 0, incomeMat, -0.3], [Number(m.Expense) || 0, expenseMat, 0.3]].forEach(([v, mat, dx], k) => {
        const b = new THREE.Mesh(geo, mat);
        b.position.set(x + dx, 0, 0);
        b.userData = { h: Math.max(0.04, (v / max) * H), delay: i * 0.12 + k * 0.05 };
        b.scale.y = 0.001;
        stage.add(b);
        bars.push(b);
      });
      const [y, mo] = String(m.month).split('-').map(Number);
      const name = y && mo ? new Date(y, mo - 1, 1).toLocaleDateString(locale, { month: 'short' }) : String(m.month);
      const sp = label(name);
      sp.position.set(x, 0.05, 1.55);
      stage.add(sp);
    });

    const ease = (x) => 1 - (1 - x) ** 3;
    return {
      update(t) {
        stage.rotation.y = -0.18 + Math.sin(t * 0.25) * 0.08 + pointer.x * 0.12;
        bars.forEach((b) => {
          const p = Math.min(1, Math.max(0, (t - b.userData.delay) / 0.9));
          b.scale.y = Math.max(0.001, ease(p) * b.userData.h);
        });
      },
    };
  }, [key, lang]);

  if (!months.length) return null;
  return (
    <div className={`three-stage ${className}`} data-status={status} aria-hidden="true">
      <canvas ref={canvasRef} className="three-canvas" />
    </div>
  );
}

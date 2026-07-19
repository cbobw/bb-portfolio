import gsap from 'gsap';

type GeoEl = HTMLElement & { _vx?: number; _vy?: number };

/**
 * Hero 幾何物件：輕量物理微動（彈簧阻尼 + 指標/觸控擾動）
 * 同時支援 mousemove 與 touchmove
 */
export function initHeroGeometry(root: HTMLElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shapes = Array.from(root.querySelectorAll<GeoEl>('[data-geo]'));
  if (!shapes.length) return () => {};

  if (reduce) {
    gsap.set(shapes, { opacity: 0.55 });
    return () => {};
  }

  const state = { px: 0, py: 0, tx: 0, ty: 0 };
  const bounds = () => root.getBoundingClientRect();

  shapes.forEach((el, i) => {
    el._vx = 0;
    el._vy = 0;
    gsap.set(el, {
      x: gsap.utils.random(-24, 24),
      y: gsap.utils.random(-18, 18),
      rotation: gsap.utils.random(-12, 12),
      transformOrigin: '50% 50%',
    });
    // 緩速自轉（工業件微顫）
    gsap.to(el, {
      rotation: `+=${gsap.utils.random(8, 18) * (i % 2 === 0 ? 1 : -1)}`,
      duration: gsap.utils.random(6, 10),
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  });

  const onPointer = (clientX: number, clientY: number) => {
    const r = bounds();
    state.tx = ((clientX - r.left) / r.width - 0.5) * 2;
    state.ty = ((clientY - r.top) / r.height - 0.5) * 2;
  };

  const onMouseMove = (e: MouseEvent) => onPointer(e.clientX, e.clientY);
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY);
  };

  root.addEventListener('mousemove', onMouseMove, { passive: true });
  root.addEventListener('touchmove', onTouchMove, { passive: true });

  const ticker = () => {
    state.px += (state.tx - state.px) * 0.06;
    state.py += (state.ty - state.py) * 0.06;

    shapes.forEach((el, i) => {
      const depth = 0.35 + (i % 4) * 0.18;
      const forceX = state.px * 18 * depth;
      const forceY = state.py * 14 * depth;
      // 簡易彈簧：朝目標位移收斂
      const curX = (gsap.getProperty(el, 'x') as number) || 0;
      const curY = (gsap.getProperty(el, 'y') as number) || 0;
      const ax = (forceX - curX) * 0.04;
      const ay = (forceY - curY) * 0.04 + Math.sin(performance.now() * 0.001 + i) * 0.12;
      el._vx = (el._vx ?? 0) * 0.92 + ax;
      el._vy = (el._vy ?? 0) * 0.92 + ay;
      gsap.set(el, { x: curX + (el._vx ?? 0), y: curY + (el._vy ?? 0) });
    });
  };

  gsap.ticker.add(ticker);

  return () => {
    gsap.ticker.remove(ticker);
    root.removeEventListener('mousemove', onMouseMove);
    root.removeEventListener('touchmove', onTouchMove);
    gsap.killTweensOf(shapes);
  };
}

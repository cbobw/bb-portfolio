import gsap from 'gsap';

type BoatState = {
  el: HTMLElement;
  /** 水平位置（px，可為負，超出右側後從左側循環） */
  xPos: number;
  /** 水平漂流速（px / 秒） */
  sailSpeed: number;
  phase: number;
  bobSpeed: number;
  amp: number;
  tilt: number;
  grabbed: boolean;
  returning: boolean;
  dragX: number;
  dragY: number;
};

/**
 * 互動海浪小船：
 * - 小船由左至右無限循環漂流，並隨浪上下搖晃
 * - Pointer Events 支援滑鼠／觸控抓取
 * - 抓起暫停漂流、放大並顯示經歷細節；放開落回海面繼續漂
 */
export function initWaveBoats(section: HTMLElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sea = section.querySelector<HTMLElement>('[data-sea]');
  const boats = Array.from(section.querySelectorAll<HTMLElement>('[data-boat]'));
  const detail = section.querySelector<HTMLElement>('[data-boat-detail]');
  const detailKicker = detail?.querySelector<HTMLElement>('[data-boat-detail-kicker]');
  const detailTitle = detail?.querySelector<HTMLElement>('[data-boat-detail-title]');
  const detailBody = detail?.querySelector<HTMLElement>('[data-boat-detail-body]');
  const detailMeta = detail?.querySelector<HTMLElement>('[data-boat-detail-meta]');
  if (!sea || !boats.length) return () => {};

  let seaRect = sea.getBoundingClientRect();
  const loopSpan = () => {
    const boatW = boats[0]?.offsetWidth || 80;
    return (seaRect.width || 1) + boatW + 40;
  };

  const states: BoatState[] = boats.map((el, i) => {
    const n = boats.length;
    const span = loopSpan();
    // 均勻分布在循環軌道上，從左側外側起漂
    const xPos = (i / n) * span - (el.offsetWidth || 80);
    return {
      el,
      xPos,
      sailSpeed: 38 + (i % 3) * 10, // 由左往右緩漂
      phase: (i / n) * Math.PI * 2 + i * 0.35,
      bobSpeed: 0.9 + (i % 3) * 0.15,
      amp: 14 + (i % 2) * 5,
      tilt: 6 + (i % 3) * 1.5,
      grabbed: false,
      returning: false,
      dragX: 0,
      dragY: 0,
    };
  });

  let active: BoatState | null = null;
  let pointerId: number | null = null;
  let grabOffsetX = 0;
  let grabOffsetY = 0;
  let lastT = performance.now() * 0.001;

  const refreshSea = () => {
    seaRect = sea.getBoundingClientRect();
  };

  const waveY = () => (seaRect.height || 1) * 0.5;

  const wrapX = (boat: BoatState) => {
    const boatW = boat.el.offsetWidth || 80;
    const span = (seaRect.width || 1) + boatW + 40;
    // 完全漂出右側後，從左側外側接回
    while (boat.xPos > seaRect.width + 20) {
      boat.xPos -= span;
    }
    while (boat.xPos < -boatW - 20) {
      boat.xPos += span;
    }
  };

  const showDetail = (boat: BoatState) => {
    if (!detail) return;
    detailKicker && (detailKicker.textContent = boat.el.dataset.kicker ?? '');
    detailTitle && (detailTitle.textContent = boat.el.dataset.title ?? '');
    detailBody && (detailBody.textContent = boat.el.dataset.body ?? '');
    detailMeta && (detailMeta.textContent = boat.el.dataset.meta ?? '');
    detail.hidden = false;
    detail.setAttribute('aria-hidden', 'false');
    gsap.fromTo(
      detail,
      { autoAlpha: 0, y: 12, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out' },
    );
  };

  const hideDetail = () => {
    if (!detail || detail.hidden) return;
    gsap.to(detail, {
      autoAlpha: 0,
      y: 8,
      scale: 0.98,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => {
        detail.hidden = true;
        detail.setAttribute('aria-hidden', 'true');
      },
    });
  };

  const placeBoat = (boat: BoatState, t: number) => {
    if (boat.returning) return;

    if (boat.grabbed) {
      gsap.set(boat.el, {
        x: boat.dragX,
        y: boat.dragY,
        rotation: 0,
        scale: 1.12,
        zIndex: 30,
      });
      return;
    }

    const bob = Math.sin(t * boat.bobSpeed + boat.phase);
    const sway = Math.cos(t * boat.bobSpeed * 0.85 + boat.phase);
    const y = waveY() - boat.el.offsetHeight * 0.7 + bob * boat.amp;
    const rot = sway * boat.tilt;

    gsap.set(boat.el, {
      x: boat.xPos,
      y,
      rotation: rot,
      scale: 1,
      zIndex: 10 + Math.round((bob + 1) * 2),
    });
  };

  const releaseBoat = (boat: BoatState) => {
    boat.grabbed = false;
    boat.returning = true;
    boat.el.classList.remove('is-grabbed');
    boat.el.setAttribute('aria-pressed', 'false');

    // 從放開處落回當前水平位置的海面，繼續向右漂
    boat.xPos = boat.dragX;
    wrapX(boat);
    const targetY = waveY() - boat.el.offsetHeight * 0.7;

    gsap.to(boat.el, {
      x: boat.xPos,
      y: targetY,
      rotation: 0,
      scale: 1,
      duration: 0.5,
      ease: 'power3.out',
      onComplete: () => {
        boat.returning = false;
        if (active === boat) {
          active = null;
          hideDetail();
        }
      },
    });
  };

  const onPointerDown = (e: PointerEvent, boat: BoatState) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    refreshSea();

    if (active && active !== boat) {
      releaseBoat(active);
    }

    active = boat;
    boat.grabbed = true;
    boat.returning = false;
    pointerId = e.pointerId;
    boat.el.classList.add('is-grabbed');
    boat.el.setAttribute('aria-pressed', 'true');
    boat.el.setPointerCapture(e.pointerId);

    const curX = (gsap.getProperty(boat.el, 'x') as number) || 0;
    const curY = (gsap.getProperty(boat.el, 'y') as number) || 0;
    grabOffsetX = e.clientX - seaRect.left - curX;
    grabOffsetY = e.clientY - seaRect.top - curY;
    boat.dragX = curX;
    boat.dragY = curY;

    gsap.killTweensOf(boat.el);
    gsap.to(boat.el, { scale: 1.12, rotation: 0, duration: 0.2, ease: 'power2.out' });
    showDetail(boat);

    try {
      navigator.vibrate?.(8);
    } catch {
      /* noop */
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!active?.grabbed || e.pointerId !== pointerId) return;
    e.preventDefault();
    const maxX = seaRect.width - active.el.offsetWidth;
    const maxY = seaRect.height - active.el.offsetHeight;
    active.dragX = Math.min(maxX, Math.max(0, e.clientX - seaRect.left - grabOffsetX));
    active.dragY = Math.min(maxY, Math.max(0, e.clientY - seaRect.top - grabOffsetY));
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!active?.grabbed || e.pointerId !== pointerId) return;
    try {
      active.el.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    pointerId = null;
    releaseBoat(active);
  };

  const listeners: Array<() => void> = [];

  states.forEach((boat) => {
    gsap.set(boat.el, { x: 0, y: 0, transformOrigin: '50% 80%' });
    const down = (e: PointerEvent) => onPointerDown(e, boat);
    boat.el.addEventListener('pointerdown', down);
    listeners.push(() => boat.el.removeEventListener('pointerdown', down));
  });

  sea.addEventListener('pointermove', onPointerMove, { passive: false });
  sea.addEventListener('pointerup', onPointerUp);
  sea.addEventListener('pointercancel', onPointerUp);
  listeners.push(() => {
    sea.removeEventListener('pointermove', onPointerMove);
    sea.removeEventListener('pointerup', onPointerUp);
    sea.removeEventListener('pointercancel', onPointerUp);
  });

  const redistribute = () => {
    refreshSea();
    const n = states.length;
    const span = loopSpan();
    states.forEach((boat, i) => {
      if (boat.grabbed || boat.returning) return;
      boat.xPos = (i / n) * span - boat.el.offsetWidth;
    });
  };

  const onResize = () => redistribute();
  window.addEventListener('resize', onResize, { passive: true });
  listeners.push(() => window.removeEventListener('resize', onResize));

  refreshSea();
  // 等 layout 後再均勻分布
  redistribute();

  if (reduce) {
    states.forEach((boat, i) => {
      const w = seaRect.width || 1;
      const x = ((i + 0.5) / states.length) * w - boat.el.offsetWidth / 2;
      const y = waveY() - boat.el.offsetHeight * 0.7 + (i % 2) * 6;
      boat.xPos = x;
      gsap.set(boat.el, { x, y, rotation: 0, scale: 1 });
    });
    return () => {
      listeners.forEach((fn) => fn());
      gsap.killTweensOf(boats);
      gsap.killTweensOf(detail);
    };
  }

  const ticker = () => {
    const t = performance.now() * 0.001;
    const dt = Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;

    states.forEach((boat) => {
      if (!boat.grabbed && !boat.returning) {
        boat.xPos += boat.sailSpeed * dt;
        wrapX(boat);
      }
      placeBoat(boat, t);
    });
  };
  gsap.ticker.add(ticker);
  ticker();

  return () => {
    gsap.ticker.remove(ticker);
    listeners.forEach((fn) => fn());
    gsap.killTweensOf(boats);
    gsap.killTweensOf(detail);
  };
}

type Point = { x: number; y: number };

/**
 * X 時間 / Y 分類無限畫布
 * - 手機：touch-pan + 捏合縮放（原生順滑慣性）
 * - 桌面：滑鼠拖曳平移 + 滾輪縮放
 * - 卡片可個別拖拽重排
 */
export function initInfiniteCanvas(root: HTMLElement) {
  const viewport = root.querySelector<HTMLElement>('[data-canvas-viewport]');
  const world = root.querySelector<HTMLElement>('[data-canvas-world]');
  if (!viewport || !world) return () => {};

  const cards = Array.from(world.querySelectorAll<HTMLElement>('[data-canvas-card]'));

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let vx = 0;
  let vy = 0;
  let raf = 0;
  let panning = false;
  let moved = false;
  let last: Point = { x: 0, y: 0 };
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  const minScale = 0.45;
  const maxScale = 2.4;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;

  const apply = () => {
    world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  };

  const clampScale = (s: number) => Math.min(maxScale, Math.max(minScale, s));

  // 初始置中
  const bounds = () => {
    const rects = cards.map((c) => ({
      l: parseFloat(c.dataset.x || '0'),
      t: parseFloat(c.dataset.y || '0'),
      w: c.offsetWidth,
      h: c.offsetHeight,
    }));
    if (!rects.length) return { cx: 0, cy: 0 };
    const minX = Math.min(...rects.map((r) => r.l));
    const maxX = Math.max(...rects.map((r) => r.l + r.w));
    const minY = Math.min(...rects.map((r) => r.t));
    const maxY = Math.max(...rects.map((r) => r.t + r.h));
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  };

  const center = () => {
    const { cx, cy } = bounds();
    const vr = viewport.getBoundingClientRect();
    tx = vr.width / 2 - cx * scale;
    ty = vr.height / 2 - cy * scale;
    apply();
  };

  cards.forEach((card) => {
    const x = parseFloat(card.dataset.x || '0');
    const y = parseFloat(card.dataset.y || '0');
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  });

  requestAnimationFrame(center);

  const momentum = () => {
    if (panning) return;
    vx *= 0.92;
    vy *= 0.92;
    if (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) {
      vx = 0;
      vy = 0;
      return;
    }
    tx += vx;
    ty += vy;
    apply();
    raf = requestAnimationFrame(momentum);
  };

  const startMomentum = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(momentum);
  };

  // —— 畫布平移 ——
  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-card-drag]')) return;
    panning = true;
    moved = false;
    vx = 0;
    vy = 0;
    last = { x: e.clientX, y: e.clientY };
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('is-panning');
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!panning) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    tx += dx;
    ty += dy;
    vx = dx;
    vy = dy;
    last = { x: e.clientX, y: e.clientY };
    apply();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!panning) return;
    panning = false;
    viewport.classList.remove('is-panning');
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (isCoarse || Math.abs(vx) + Math.abs(vy) > 2) startMomentum();
    // 下一幀重置，避免平移手勢誤擋卡片點擊
    requestAnimationFrame(() => {
      moved = false;
    });
  };

  // —— 滾輪縮放（桌面） ——
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const prev = scale;
    const next = clampScale(scale * (e.deltaY < 0 ? 1.08 : 0.92));
    // 以指標為縮放錨點
    tx = mx - ((mx - tx) / prev) * next;
    ty = my - ((my - ty) / prev) * next;
    scale = next;
    apply();
  };

  // —— 雙指捏合 ——
  const touchDist = (touches: TouchList) => {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      panning = false;
      pinchStartDist = touchDist(e.touches);
      pinchStartScale = scale;
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = touchDist(e.touches);
      const next = clampScale(pinchStartScale * (d / pinchStartDist));
      const rect = viewport.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const prev = scale;
      tx = mx - ((mx - tx) / prev) * next;
      ty = my - ((my - ty) / prev) * next;
      scale = next;
      apply();
    }
  };

  // —— 卡片個別拖拽 ——
  cards.forEach((card) => {
    const handle = card.querySelector<HTMLElement>('[data-card-drag]') || card;
    let dragging = false;
    let start: Point = { x: 0, y: 0 };
    let origin: Point = { x: 0, y: 0 };
    let cardMoved = false;

    const down = (e: PointerEvent) => {
      e.stopPropagation();
      dragging = true;
      cardMoved = false;
      start = { x: e.clientX, y: e.clientY };
      origin = {
        x: parseFloat(card.dataset.x || '0'),
        y: parseFloat(card.dataset.y || '0'),
      };
      handle.setPointerCapture(e.pointerId);
      card.classList.add('is-dragging');
    };

    const move = (e: PointerEvent) => {
      if (!dragging) return;
      e.stopPropagation();
      const dx = (e.clientX - start.x) / scale;
      const dy = (e.clientY - start.y) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 3) cardMoved = true;
      const nx = origin.x + dx;
      const ny = origin.y + dy;
      card.dataset.x = String(nx);
      card.dataset.y = String(ny);
      card.style.left = `${nx}px`;
      card.style.top = `${ny}px`;
    };

    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('is-dragging');
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      // 拖過則抑制點擊導航
      if (cardMoved) {
        card.dataset.suppressClick = '1';
        setTimeout(() => delete card.dataset.suppressClick, 80);
      }
    };

    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);

    card.addEventListener('click', (e) => {
      if (card.dataset.suppressClick || moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  });

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerUp);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('touchstart', onTouchStart, { passive: true });
  viewport.addEventListener('touchmove', onTouchMove, { passive: false });

  const onResize = () => center();
  window.addEventListener('resize', onResize);

  const zoomBtns = root.querySelectorAll<HTMLButtonElement>('[data-zoom]');
  const onZoomClick = (e: Event) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const dir = btn.dataset.zoom;
    const rect = viewport.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    const prev = scale;
    const next = clampScale(scale * (dir === 'in' ? 1.15 : 0.87));
    tx = mx - ((mx - tx) / prev) * next;
    ty = my - ((my - ty) / prev) * next;
    scale = next;
    apply();
  };
  zoomBtns.forEach((b) => b.addEventListener('click', onZoomClick));

  return () => {
    cancelAnimationFrame(raf);
    viewport.removeEventListener('pointerdown', onPointerDown);
    viewport.removeEventListener('pointermove', onPointerMove);
    viewport.removeEventListener('pointerup', onPointerUp);
    viewport.removeEventListener('pointercancel', onPointerUp);
    viewport.removeEventListener('wheel', onWheel);
    viewport.removeEventListener('touchstart', onTouchStart);
    viewport.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('resize', onResize);
    zoomBtns.forEach((b) => b.removeEventListener('click', onZoomClick));
  };
}

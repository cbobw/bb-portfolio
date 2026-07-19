/**
 * 擬物旋鈕：Pointer Events 同時支援滑鼠拖曳與觸控畫圓旋轉
 * 順時針轉滿解鎖角度後顯示信箱
 */
export function initContactKnob(root: HTMLElement) {
  const knob = root.querySelector<HTMLElement>('[data-knob]');
  const dial = root.querySelector<HTMLElement>('[data-knob-dial]');
  const reveal = root.querySelector<HTMLElement>('[data-knob-reveal]');
  const progress = root.querySelector<HTMLElement>('[data-knob-progress]');
  const hint = root.querySelector<HTMLElement>('[data-knob-hint]');
  if (!knob || !dial || !reveal) return () => {};

  const UNLOCK_DEG = 300;
  let rotation = 0;
  let dragging = false;
  let startPointerAngle = 0;
  let startRotation = 0;
  let unlocked = false;

  const centerOf = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const angleAt = (clientX: number, clientY: number) => {
    const c = centerOf(knob);
    return (Math.atan2(clientY - c.y, clientX - c.x) * 180) / Math.PI;
  };

  const normalizeDelta = (delta: number) => {
    // 取最短角差，允許連續多圈累積由 caller 處理
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  };

  const apply = () => {
    dial.style.transform = `rotate(${rotation}deg)`;
    const pct = Math.min(100, Math.max(0, (rotation / UNLOCK_DEG) * 100));
    if (progress) {
      progress.style.setProperty('--knob-pct', `${pct}%`);
      progress.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    if (!unlocked && rotation >= UNLOCK_DEG) {
      unlocked = true;
      reveal.hidden = false;
      reveal.classList.add('is-revealed');
      knob.classList.add('is-unlocked');
      if (hint) hint.textContent = '已解鎖';
      // 輕微震動（若支援）
      try {
        navigator.vibrate?.(12);
      } catch {
        /* noop */
      }
    }
  };

  const onDown = (e: PointerEvent) => {
    if (unlocked) return;
    dragging = true;
    knob.setPointerCapture(e.pointerId);
    startPointerAngle = angleAt(e.clientX, e.clientY);
    startRotation = rotation;
    knob.classList.add('is-dragging');
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging || unlocked) return;
    const now = angleAt(e.clientX, e.clientY);
    let delta = normalizeDelta(now - startPointerAngle);
    // 僅累積順時針（正方向）；逆時針可微調回退
    const next = Math.max(0, Math.min(UNLOCK_DEG + 20, startRotation + delta));
    rotation = next;
    apply();
  };

  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    knob.classList.remove('is-dragging');
    try {
      knob.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    // 未解鎖時輕彈回最近手感檔位
    if (!unlocked && rotation < UNLOCK_DEG) {
      // 保持當前進度，不強制歸零
    }
  };

  knob.addEventListener('pointerdown', onDown);
  knob.addEventListener('pointermove', onMove);
  knob.addEventListener('pointerup', onUp);
  knob.addEventListener('pointercancel', onUp);

  // 鍵盤無障礙：方向鍵旋轉
  knob.tabIndex = 0;
  const onKey = (e: KeyboardEvent) => {
    if (unlocked) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      rotation = Math.min(UNLOCK_DEG + 20, rotation + 12);
      apply();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      rotation = Math.max(0, rotation - 12);
      apply();
    }
  };
  knob.addEventListener('keydown', onKey);

  apply();

  return () => {
    knob.removeEventListener('pointerdown', onDown);
    knob.removeEventListener('pointermove', onMove);
    knob.removeEventListener('pointerup', onUp);
    knob.removeEventListener('pointercancel', onUp);
    knob.removeEventListener('keydown', onKey);
  };
}

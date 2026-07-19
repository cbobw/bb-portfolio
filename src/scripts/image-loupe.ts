/**
 * 圖片高倍率局部放大：
 * - 桌面：游標跟隨放大鏡
 * - 手機：雙擊切換放大 / 捏合縮放平移
 */
export function initImageLoupe(root: HTMLElement) {
  const frames = Array.from(root.querySelectorAll<HTMLElement>('[data-loupe-frame]'));
  if (!frames.length) return () => {};

  const cleanups: Array<() => void> = [];
  const isFine = window.matchMedia('(pointer: fine)').matches;

  frames.forEach((frame) => {
    const img = frame.querySelector<HTMLImageElement>('img');
    if (!img) return;

    const lens = document.createElement('div');
    lens.className = 'loupe-lens';
    lens.setAttribute('aria-hidden', 'true');
    frame.appendChild(lens);

    const mobileLayer = document.createElement('div');
    mobileLayer.className = 'loupe-mobile-layer';
    mobileLayer.setAttribute('aria-hidden', 'true');
    frame.appendChild(mobileLayer);

    let active = false;
    let scale = 1;
    let ox = 0;
    let oy = 0;
    let pinchDist = 0;
    let pinchScale = 1;
    let lastTap = 0;

    const src = img.currentSrc || img.src;
    lens.style.backgroundImage = `url("${src}")`;
    mobileLayer.style.backgroundImage = `url("${src}")`;

    const updateLensBg = () => {
      const s = img.currentSrc || img.src;
      lens.style.backgroundImage = `url("${s}")`;
      mobileLayer.style.backgroundImage = `url("${s}")`;
    };
    img.addEventListener('load', updateLensBg);

    // —— 桌面放大鏡 ——
    const onEnter = () => {
      if (!isFine) return;
      active = true;
      lens.classList.add('is-visible');
      frame.classList.add('is-loupe-active');
    };

    const onLeave = () => {
      active = false;
      lens.classList.remove('is-visible');
      frame.classList.remove('is-loupe-active');
    };

    const onMove = (e: MouseEvent) => {
      if (!isFine || !active) return;
      const rect = frame.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const px = (x / rect.width) * 100;
      const py = (y / rect.height) * 100;
      const size = Math.min(rect.width, rect.height) * 0.36;

      lens.style.width = `${size}px`;
      lens.style.height = `${size}px`;
      lens.style.left = `${x - size / 2}px`;
      lens.style.top = `${y - size / 2}px`;
      // 高倍率（約 2.8x）背景定位
      lens.style.backgroundSize = `${rect.width * 2.8}px ${rect.height * 2.8}px`;
      lens.style.backgroundPosition = `${px}% ${py}%`;
    };

    // —— 手機雙擊 / 捏合 ——
    const applyMobile = () => {
      if (scale <= 1.01) {
        mobileLayer.classList.remove('is-active');
        frame.classList.remove('is-zoomed');
        scale = 1;
        ox = 0;
        oy = 0;
        return;
      }
      mobileLayer.classList.add('is-active');
      frame.classList.add('is-zoomed');
      mobileLayer.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${scale})`;
    };

    const onDblTap = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      const now = Date.now();
      if (now - lastTap < 280) {
        e.preventDefault();
        if (scale > 1) {
          scale = 1;
          ox = 0;
          oy = 0;
        } else {
          scale = 2.4;
          const rect = frame.getBoundingClientRect();
          const t = e.changedTouches[0];
          const cx = t.clientX - rect.left - rect.width / 2;
          const cy = t.clientY - rect.top - rect.height / 2;
          ox = -cx * 0.6;
          oy = -cy * 0.6;
        }
        applyMobile();
      }
      lastTap = now;
    };

    let panStart = { x: 0, y: 0, ox: 0, oy: 0 };
    let panning = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        pinchScale = scale;
      } else if (e.touches.length === 1 && scale > 1) {
        panning = true;
        panStart = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          ox,
          oy,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        scale = Math.min(4, Math.max(1, pinchScale * (d / pinchDist)));
        applyMobile();
      } else if (panning && e.touches.length === 1 && scale > 1) {
        e.preventDefault();
        ox = panStart.ox + (e.touches[0].clientX - panStart.x);
        oy = panStart.oy + (e.touches[0].clientY - panStart.y);
        applyMobile();
      }
    };

    const onTouchEnd = () => {
      panning = false;
      if (scale < 1.15) {
        scale = 1;
        ox = 0;
        oy = 0;
        applyMobile();
      }
    };

    if (isFine) {
      frame.addEventListener('mouseenter', onEnter);
      frame.addEventListener('mouseleave', onLeave);
      frame.addEventListener('mousemove', onMove);
    } else {
      frame.addEventListener('touchend', onDblTap, { passive: false });
      frame.addEventListener('touchstart', onTouchStart, { passive: true });
      frame.addEventListener('touchmove', onTouchMove, { passive: false });
      frame.addEventListener('touchend', onTouchEnd);
      frame.addEventListener('touchcancel', onTouchEnd);
    }

    cleanups.push(() => {
      img.removeEventListener('load', updateLensBg);
      frame.removeEventListener('mouseenter', onEnter);
      frame.removeEventListener('mouseleave', onLeave);
      frame.removeEventListener('mousemove', onMove);
      frame.removeEventListener('touchend', onDblTap);
      frame.removeEventListener('touchstart', onTouchStart);
      frame.removeEventListener('touchmove', onTouchMove);
      frame.removeEventListener('touchend', onTouchEnd);
      frame.removeEventListener('touchcancel', onTouchEnd);
      lens.remove();
      mobileLayer.remove();
    });
  });

  return () => cleanups.forEach((fn) => fn());
}

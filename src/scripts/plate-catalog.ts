import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * 作品集圖板目錄：
 * - 入場 stagger
 * - 圖片視差
 * - 分類篩選（無刷新）
 * - 桌面磁吸 hover（quickTo）
 * - 觸控友善（無 hover 依賴）
 */
export function initPlateCatalog(root: HTMLElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plates = Array.from(root.querySelectorAll<HTMLElement>('[data-catalog-plate]'));
  const filters = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const countEl = root.querySelector<HTMLElement>('[data-filter-count]');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const setCount = (n: number) => {
    if (countEl) countEl.textContent = String(n).padStart(2, '0');
  };

  setCount(plates.length);

  if (!reduce) {
    gsap.from(plates, {
      opacity: 0,
      y: 36,
      duration: 0.65,
      stagger: { each: 0.09, from: 'start' },
      ease: 'power2.out',
      delay: 0.15,
    });

    plates.forEach((plate) => {
      const img = plate.querySelector<HTMLElement>('[data-catalog-img]');
      if (!img) return;
      gsap.to(img, {
        yPercent: -10,
        ease: 'none',
        scrollTrigger: {
          trigger: plate,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.55,
        },
      });
    });
  }

  // —— 分類篩選 ——
  const applyFilter = (key: string) => {
    filters.forEach((btn) => {
      const active = btn.dataset.filter === key;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('is-active', active);
    });

    let visible = 0;
    plates.forEach((plate) => {
      const cat = plate.dataset.category || '';
      const show = key === 'all' || cat === key;
      plate.hidden = !show;
      plate.classList.toggle('is-hidden', !show);
      if (show) visible += 1;

      if (!reduce && show) {
        gsap.fromTo(
          plate,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
        );
      }
    });

    setCount(visible);
    ScrollTrigger.refresh();
  };

  filters.forEach((btn) => {
    btn.addEventListener('click', () => applyFilter(btn.dataset.filter || 'all'));
  });

  // —— 桌面磁吸 ——
  const magnetCleanups: Array<() => void> = [];

  if (finePointer && !reduce) {
    plates.forEach((plate) => {
      const frame = plate.querySelector<HTMLElement>('[data-magnet]');
      if (!frame) return;

      const xTo = gsap.quickTo(frame, 'x', { duration: 0.4, ease: 'power3.out' });
      const yTo = gsap.quickTo(frame, 'y', { duration: 0.4, ease: 'power3.out' });

      const onMove = (e: MouseEvent) => {
        const r = frame.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.06);
        yTo((e.clientY - r.top - r.height / 2) * 0.06);
      };
      const onLeave = () => {
        xTo(0);
        yTo(0);
      };

      frame.addEventListener('mousemove', onMove);
      frame.addEventListener('mouseleave', onLeave);
      magnetCleanups.push(() => {
        frame.removeEventListener('mousemove', onMove);
        frame.removeEventListener('mouseleave', onLeave);
      });
    });
  }

  return () => {
    magnetCleanups.forEach((fn) => fn());
    ScrollTrigger.getAll().forEach((st) => {
      if (root.contains(st.trigger as Node)) st.kill();
    });
  };
}

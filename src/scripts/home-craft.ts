import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * 主頁工藝動效：
 * - Hero 字元錯落入場 + 指標／觸控視差
 * - 哲學區塊 pin scrub（桌面）
 * - 精選圖板 stagger reveal + 圖片視差
 * - prefers-reduced-motion 全數降級
 */
export function initHomeCraft(root: HTMLElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mm = gsap.matchMedia();
  const cleanups: Array<() => void> = [];

  const letters = root.querySelectorAll<HTMLElement>('[data-hero-letter]');
  const annotations = root.querySelectorAll<HTMLElement>('[data-anno]');
  const hero = root.querySelector<HTMLElement>('[data-craft-hero]');
  const manifesto = root.querySelector<HTMLElement>('[data-manifesto]');
  const plates = root.querySelectorAll<HTMLElement>('[data-plate]');
  const reveals = root.querySelectorAll<HTMLElement>('[data-reveal]');

  if (reduce) {
    gsap.set([letters, annotations, plates, reveals], {
      clearProps: 'all',
      opacity: 1,
      y: 0,
      x: 0,
    });
    return () => {};
  }

  // —— Hero 入場 ——
  if (letters.length) {
    gsap.from(letters, {
      yPercent: 110,
      opacity: 0,
      rotateX: -55,
      duration: 1.05,
      stagger: 0.045,
      ease: 'expo.out',
      delay: 0.12,
    });
  }

  if (annotations.length) {
    gsap.from(annotations, {
      opacity: 0,
      y: 14,
      duration: 0.55,
      stagger: 0.08,
      ease: 'power2.out',
      delay: 0.55,
    });
  }

  // —— Hero 指標／觸控視差（3 層） ——
  if (hero) {
    const layers = Array.from(hero.querySelectorAll<HTMLElement>('[data-parallax]'));
    const state = { px: 0, py: 0, tx: 0, ty: 0 };

    const onPointer = (cx: number, cy: number) => {
      const r = hero.getBoundingClientRect();
      state.tx = ((cx - r.left) / r.width - 0.5) * 2;
      state.ty = ((cy - r.top) / r.height - 0.5) * 2;
    };

    const onMouse = (e: MouseEvent) => onPointer(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY);
    };

    hero.addEventListener('mousemove', onMouse, { passive: true });
    hero.addEventListener('touchmove', onTouch, { passive: true });

    const ticker = () => {
      state.px += (state.tx - state.px) * 0.07;
      state.py += (state.ty - state.py) * 0.07;
      layers.forEach((el) => {
        const depth = Number(el.dataset.parallax) || 1;
        gsap.set(el, {
          x: state.px * 18 * depth,
          y: state.py * 12 * depth,
        });
      });
    };
    gsap.ticker.add(ticker);

    cleanups.push(() => {
      gsap.ticker.remove(ticker);
      hero.removeEventListener('mousemove', onMouse);
      hero.removeEventListener('touchmove', onTouch);
    });
  }

  // —— Scroll reveals ——
  reveals.forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y: 28,
      duration: 0.7,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        toggleActions: 'play none none reverse',
      },
    });
  });

  // —— 精選圖板 ——
  plates.forEach((plate) => {
    const media = plate.querySelector<HTMLElement>('[data-plate-media]');
    const meta = plate.querySelectorAll<HTMLElement>('[data-plate-meta]');

    gsap.from(meta, {
      opacity: 0,
      y: 20,
      duration: 0.55,
      stagger: 0.06,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: plate,
        start: 'top 82%',
      },
    });

    if (media) {
      gsap.from(media, {
        scale: 1.08,
        opacity: 0.55,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: plate,
          start: 'top 85%',
        },
      });

      gsap.to(media, {
        yPercent: -8,
        ease: 'none',
        scrollTrigger: {
          trigger: plate,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
        },
      });
    }
  });

  // —— 哲學區塊：桌面 pin scrub ——
  mm.add('(min-width: 768px)', () => {
    if (!manifesto) return;

    const quote = manifesto.querySelector<HTMLElement>('[data-quote]');
    const lines = manifesto.querySelectorAll<HTMLElement>('[data-spec-line]');

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: manifesto,
        start: 'top top',
        end: '+=120%',
        scrub: 0.85,
        pin: true,
        anticipatePin: 1,
      },
    });

    if (quote) {
      tl.fromTo(quote, { opacity: 0.25, y: 40 }, { opacity: 1, y: 0, ease: 'none' }, 0);
    }
    if (lines.length) {
      tl.fromTo(
        lines,
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, stagger: 0.08, ease: 'none' },
        0.15,
      );
    }

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  });

  mm.add('(max-width: 767px)', () => {
    if (!manifesto) return;
    const quote = manifesto.querySelector<HTMLElement>('[data-quote]');
    const lines = manifesto.querySelectorAll<HTMLElement>('[data-spec-line]');

    if (quote) {
      gsap.from(quote, {
        opacity: 0,
        y: 24,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: quote, start: 'top 90%' },
      });
    }
    if (lines.length) {
      gsap.from(lines, {
        scaleX: 0,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: manifesto, start: 'top 80%' },
      });
    }
  });

  // —— 十字準星輕微呼吸 ——
  const crosshair = root.querySelector<HTMLElement>('[data-crosshair]');
  if (crosshair) {
    gsap.to(crosshair, {
      rotation: 90,
      duration: 12,
      ease: 'none',
      repeat: -1,
    });
  }

  return () => {
    cleanups.forEach((fn) => fn());
    mm.revert();
    ScrollTrigger.getAll().forEach((st) => {
      if (root.contains(st.trigger as Node)) st.kill();
    });
  };
}

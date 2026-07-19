import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * 拆解圖滾動組裝：
 * - md+：水平/放射爆炸 → 滾動組裝為一體
 * - 手機：垂直堆疊 + 層級視差
 */
export function initExplodedView(section: HTMLElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = section.querySelector<HTMLElement>('[data-explode-stage]');
  const layers = Array.from(section.querySelectorAll<HTMLElement>('[data-explode-layer]'));
  if (!stage || !layers.length) return () => {};

  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: reduce)', () => {
    gsap.set(layers, { clearProps: 'all', opacity: 1, x: 0, y: 0, scale: 1 });
  });

  if (reduce) {
    return () => mm.revert();
  }

  // 桌面／平板：爆炸組裝
  mm.add('(min-width: 768px)', () => {
    const offsets = layers.map((_, i) => {
      const angle = (i / layers.length) * Math.PI * 2 - Math.PI / 2;
      const dist = 80 + i * 28;
      return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, rot: (i - 1.5) * 6 };
    });

    // yPercent:-50 取代 CSS translate，避免與 GSAP transform 衝突
    gsap.set(layers, {
      x: (i) => offsets[i].x,
      y: (i) => offsets[i].y,
      yPercent: -50,
      rotation: (i) => offsets[i].rot,
      opacity: 0.85,
    });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=160%',
        scrub: 0.85,
        pin: true,
        anticipatePin: 1,
      },
    });

    tl.to(
      layers,
      {
        x: 0,
        y: 0,
        yPercent: -50,
        rotation: 0,
        opacity: 1,
        stagger: { each: 0.06, from: 'edges' },
        ease: 'none',
        duration: 1,
      },
      0,
    ).to(
      stage,
      {
        scale: 1.02,
        ease: 'none',
        duration: 0.35,
      },
      0.65,
    );

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  });

  // 手機：垂直堆疊視差
  mm.add('(max-width: 767px)', () => {
    gsap.set(layers, { clearProps: 'transform', opacity: 1 });

    const triggers = layers.map((layer, i) =>
      gsap.to(layer, {
        y: (i + 1) * -18,
        ease: 'none',
        scrollTrigger: {
          trigger: layer,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
        },
      }),
    );

    return () => {
      triggers.forEach((t) => {
        t.scrollTrigger?.kill();
        t.kill();
      });
    };
  });

  return () => mm.revert();
}

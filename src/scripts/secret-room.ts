/**
 * Secret Base — CCTV 角落房間
 * - 監視器時間戳
 * - 時鐘／控制鈕切換晝夜
 * - 真實物件 Modal
 */
import gsap from 'gsap';

export type RoomMode = 'day' | 'night';

type InitOptions = {
  initialMode?: RoomMode;
};

const TRANSITION = 0.5;

export function initSecretRoom(root: HTMLElement, options: InitOptions = {}) {
  const scene = root.querySelector<HTMLElement>('[data-room-scene]');
  const clock = root.querySelector<HTMLElement>('[data-room-clock]');
  const modeBtn = root.querySelector<HTMLElement>('[data-mode-toggle]');
  const hourHand = root.querySelector<HTMLElement>('[data-clock-hour]');
  const minuteHand = root.querySelector<HTMLElement>('[data-clock-minute]');
  const lamp = root.querySelector<HTMLElement>('[data-room-lamp]');
  const modeLabel = root.querySelector<HTMLElement>('[data-mode-label]');
  const timestampEl = root.querySelector<HTMLElement>('[data-cctv-time]');
  const modal = root.querySelector<HTMLElement>('[data-room-modal]');
  const modalClose = root.querySelectorAll<HTMLElement>('[data-modal-close]');
  const modalTitle = root.querySelector<HTMLElement>('[data-modal-title]');
  const modalSubtitle = root.querySelector<HTMLElement>('[data-modal-subtitle]');
  const modalDetail = root.querySelector<HTMLElement>('[data-modal-detail]');
  const modalTags = root.querySelector<HTMLElement>('[data-modal-tags]');
  const modalName = root.querySelector<HTMLElement>('[data-modal-name]');
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-room-item]'));

  if (!scene || !modal) return () => {};

  const toggles = [clock, modeBtn].filter(Boolean) as HTMLElement[];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reducedMotion ? 0.01 : TRANSITION;

  let mode: RoomMode = options.initialMode ?? 'day';
  let activeItem: HTMLElement | null = null;
  let lastToggleAt = 0;
  let clockTimer = 0;

  const pad = (n: number) => String(n).padStart(2, '0');

  const tickTimestamp = () => {
    if (!timestampEl) return;
    const d = new Date();
    timestampEl.textContent = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const setHands = (hourDeg: number, minuteDeg: number, animate = false) => {
    if (!hourHand || !minuteHand) return;
    const props = { transformOrigin: '50% 50%', svgOrigin: '50 50' };
    if (animate) {
      gsap.to(hourHand, { rotation: hourDeg, duration, ease: 'power2.inOut', ...props });
      gsap.to(minuteHand, { rotation: minuteDeg, duration, ease: 'power2.inOut', ...props });
    } else {
      gsap.set(hourHand, { rotation: hourDeg, ...props });
      gsap.set(minuteHand, { rotation: minuteDeg, ...props });
    }
  };

  const applyModeVisuals = (next: RoomMode, animate: boolean) => {
    root.dataset.mode = next;
    root.classList.toggle('is-night', next === 'night');
    root.classList.toggle('is-day', next === 'day');

    toggles.forEach((el) => {
      el.setAttribute('aria-pressed', String(next === 'night'));
      if (el.hasAttribute('data-room-clock')) {
        el.setAttribute(
          'aria-label',
          next === 'night' ? '牆面時鐘：黑夜，點擊切換至白天' : '牆面時鐘：白天，點擊切換至黑夜',
        );
      }
    });

    if (modeLabel) modeLabel.textContent = next === 'night' ? 'NIGHT' : 'DAY';

    items.forEach((item) => {
      const itemMode = item.dataset.mode || 'all';
      const visible = itemMode === 'all' || itemMode === next;
      item.hidden = !visible;
      item.setAttribute('aria-hidden', String(!visible));
      item.tabIndex = visible ? 0 : -1;
      if (animate && visible && !reducedMotion) {
        gsap.fromTo(
          item,
          { opacity: 0, y: 10, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: duration * 0.9, ease: 'power2.out', delay: 0.06 },
        );
      }
    });

    if (lamp) {
      gsap.to(lamp, { opacity: next === 'night' ? 1 : 0, duration, ease: 'power2.inOut' });
    }

    if (next === 'night') setHands(300, 220, animate);
    else setHands(40, 70, animate);
  };

  const setMode = (next: RoomMode, animate = true) => {
    if (next === mode) {
      applyModeVisuals(next, false);
      return;
    }
    mode = next;
    applyModeVisuals(next, animate);
  };

  const toggleMode = () => {
    const now = performance.now();
    if (now - lastToggleAt < 280) return;
    lastToggleAt = now;
    setMode(mode === 'day' ? 'night' : 'day', true);
  };

  const fillModal = (item: HTMLElement) => {
    if (modalTitle) modalTitle.textContent = item.dataset.title || '';
    if (modalSubtitle) modalSubtitle.textContent = item.dataset.subtitle || '';
    if (modalDetail) modalDetail.textContent = item.dataset.detail || '';
    if (modalName) modalName.textContent = item.dataset.name || '';
    if (modalTags) {
      const tags = (item.dataset.tags || '')
        .split('|')
        .map((t) => t.trim())
        .filter(Boolean);
      modalTags.replaceChildren(
        ...tags.map((tag) => {
          const span = document.createElement('span');
          span.className =
            'label-mono border border-beige-dark/60 px-2 py-1 text-[10px] text-warm-taupe sm:text-xs';
          span.textContent = tag;
          return span;
        }),
      );
    }
    modal.style.setProperty('--modal-accent', item.dataset.accent || '#8A6BBE');
  };

  const openModal = (item: HTMLElement) => {
    activeItem = item;
    fillModal(item);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('overflow-hidden');
    const panel = modal.querySelector<HTMLElement>('[data-modal-panel]');
    if (panel && !reducedMotion) {
      gsap.fromTo(
        panel,
        { opacity: 0, y: 18, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power2.out' },
      );
    }
    modal.querySelector<HTMLElement>('[data-modal-close]')?.focus();
  };

  const closeModal = () => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('overflow-hidden');
    const prev = activeItem;
    activeItem = null;
    prev?.focus();
  };

  const onItemActivate = (item: HTMLElement) => {
    if (item.hidden) return;
    openModal(item);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !modal.hidden) {
      e.preventDefault();
      closeModal();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLElement) {
      const item = e.target.closest<HTMLElement>('[data-room-item]');
      if (item && root.contains(item)) {
        e.preventDefault();
        onItemActivate(item);
      }
    }
  };

  const onModalBackdrop = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-modal-close') || target === modal) closeModal();
  };

  const onImgError = (e: Event) => {
    const img = e.target as HTMLImageElement;
    const wrap = img.closest('[data-room-item]');
    const fallback = wrap?.querySelector<HTMLElement>('[data-obj-fallback]');
    img.hidden = true;
    if (fallback) fallback.hidden = false;
  };

  // init
  gsap.set(lamp, { opacity: 0 });
  setMode(mode, false);
  tickTimestamp();
  clockTimer = window.setInterval(tickTimestamp, 1000);

  const onToggleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMode();
    }
  };

  const itemHandlers = items.map((item) => {
    const onClick = () => onItemActivate(item);
    item.addEventListener('click', onClick);
    const imgs = Array.from(item.querySelectorAll('img'));
    imgs.forEach((img) => img.addEventListener('error', onImgError));
    return { item, onClick, imgs };
  });

  toggles.forEach((el) => {
    el.addEventListener('click', toggleMode);
    el.addEventListener('keydown', onToggleKey);
  });

  modalClose.forEach((el) => el.addEventListener('click', closeModal));
  modal.addEventListener('click', onModalBackdrop);
  document.addEventListener('keydown', onKeyDown);

  return () => {
    window.clearInterval(clockTimer);
    toggles.forEach((el) => {
      el.removeEventListener('click', toggleMode);
      el.removeEventListener('keydown', onToggleKey);
    });
    itemHandlers.forEach(({ item, onClick, imgs }) => {
      item.removeEventListener('click', onClick);
      imgs.forEach((img) => img.removeEventListener('error', onImgError));
    });
    modalClose.forEach((el) => el.removeEventListener('click', closeModal));
    modal.removeEventListener('click', onModalBackdrop);
    document.removeEventListener('keydown', onKeyDown);
    document.documentElement.classList.remove('overflow-hidden');
    gsap.killTweensOf([scene, lamp, hourHand, minuteHand, ...items]);
  };
}

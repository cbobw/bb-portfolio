/**
 * 師生課堂控管：混亂漂流（Matter.js）↔ 整齊歸位（GSAP）
 * - 5 張聯絡卡片物理漂流、撞牆/碰撞橡膠縮放
 * - 游標為真實物理碰撞體，可推動卡片
 * - 老師拖入講臺 → 暫停物理、歸位矩陣、解鎖互動
 */
import Matter from 'matter-js';
import gsap from 'gsap';

const { Engine, Runner, World, Bodies, Body, Events } = Matter;

type Tracked = {
  body: Matter.Body;
  el: HTMLElement;
  bounceLock: boolean;
  bounceScale: number;
  orderProxy: { p: number } | null;
};

const WALL = 64;
const CURSOR_RADIUS = 22;

export function initContactClassroom(root: HTMLElement) {
  const arena = root.querySelector<HTMLElement>('[data-classroom-arena]');
  const seat = root.querySelector<HTMLElement>('[data-teacher-seat]');
  const teacher = root.querySelector<HTMLElement>('[data-teacher]');
  const quote = root.querySelector<HTMLElement>('[data-classroom-quote]');
  const toast = root.querySelector<HTMLElement>('[data-toast]');
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-contact-card]'));

  if (!arena || !seat || !teacher || !cards.length) return () => {};

  let engine: Matter.Engine | null = null;
  let runner: Matter.Runner | null = null;
  let walls: Matter.Body[] = [];
  let cursorBody: Matter.Body | null = null;
  let tracked: Tracked[] = [];
  let ordered = false;
  let raf = 0;
  let toastTimer = 0;
  let resizeTimer = 0;
  let pointerX = -9999;
  let pointerY = -9999;
  let prevCursorX = -9999;
  let prevCursorY = -9999;
  let pointerInside = false;
  let teacherDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let started = false;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isMobile = () => window.matchMedia('(max-width: 639px)').matches;

  const cardChamfer = () => (isMobile() ? 10 : 16);

  const size = () => {
    const r = arena.getBoundingClientRect();
    const bottomSafe = window.matchMedia('(max-width: 767px)').matches ? 72 : 0;
    return { w: Math.max(1, r.width), h: Math.max(1, r.height - bottomSafe) };
  };

  const cardSize = (el: HTMLElement) => ({
    w: el.offsetWidth || 160,
    h: el.offsetHeight || 120,
  });

  const readTranslate = (el: HTMLElement) => {
    const m = /translate\(([-.\d]+)px,\s*([-.\d]+)px\)/.exec(el.style.transform || '');
    const rot = /rotate\(([-.\d]+)rad\)/.exec(el.style.transform || '');
    return {
      x: m ? parseFloat(m[1]) : 0,
      y: m ? parseFloat(m[2]) : 0,
      angle: rot ? parseFloat(rot[1]) : 0,
    };
  };

  const setStatus = (orderedMode: boolean) => {
    root.classList.toggle('is-ordered', orderedMode);
    root.classList.toggle('is-chaos', !orderedMode);
    cards.forEach((card) => {
      card.classList.toggle('is-interactive', orderedMode);
      card.querySelectorAll<HTMLElement>('button, a').forEach((ctrl) => {
        if (orderedMode) {
          ctrl.removeAttribute('tabindex');
          ctrl.removeAttribute('aria-disabled');
        } else {
          ctrl.setAttribute('tabindex', '-1');
          ctrl.setAttribute('aria-disabled', 'true');
        }
      });
    });
  };

  const showToast = (msg: string) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.add('is-show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-show');
      window.setTimeout(() => {
        toast.hidden = true;
      }, 220);
    }, 1800);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to Clipboard!');
      try {
        navigator.vibrate?.(10);
      } catch {
        /* noop */
      }
    } catch {
      showToast('Copy failed');
    }
  };

  const bounceCard = (_el: HTMLElement, item: Tracked) => {
    if (item.bounceLock || reducedMotion) return;
    item.bounceLock = true;
    const proxy = { s: item.bounceScale };
    gsap.killTweensOf(proxy);
    gsap.fromTo(
      proxy,
      { s: 0.95 },
      {
        s: 1,
        duration: 0.35,
        ease: 'elastic.out(1, 0.45)',
        onUpdate: () => {
          item.bounceScale = proxy.s;
        },
        onComplete: () => {
          item.bounceScale = 1;
          item.bounceLock = false;
        },
      },
    );
  };

  const buildWalls = (w: number, h: number) => {
    if (!engine) return;
    if (walls.length) World.remove(engine.world, walls);
    const opt = { isStatic: true, friction: 0.05, restitution: 0.92, label: 'wall' };
    walls = [
      Bodies.rectangle(w / 2, h + WALL / 2, w + WALL * 2, WALL, opt),
      Bodies.rectangle(w / 2, -WALL / 2, w + WALL * 2, WALL, opt),
      Bodies.rectangle(-WALL / 2, h / 2, WALL, h + WALL * 2, opt),
      Bodies.rectangle(w + WALL / 2, h / 2, WALL, h + WALL * 2, opt),
    ];
    World.add(engine.world, walls);
  };

  const parkCursor = () => {
    if (!cursorBody) return;
    Body.setVelocity(cursorBody, { x: 0, y: 0 });
    Body.setPosition(cursorBody, { x: -2000, y: -2000 });
    prevCursorX = -2000;
    prevCursorY = -2000;
  };

  const spawnCursor = () => {
    if (!engine) return;
    if (cursorBody) World.remove(engine.world, cursorBody);
    cursorBody = Bodies.circle(-2000, -2000, CURSOR_RADIUS, {
      restitution: 0.85,
      friction: 0.05,
      frictionAir: 0,
      density: 0.08,
      inertia: Infinity,
      label: 'cursor',
    });
    World.add(engine.world, cursorBody);
  };

  const syncCursorBody = () => {
    if (!cursorBody || ordered) return;
    if (!pointerInside || pointerX < 0) {
      parkCursor();
      return;
    }

    const arenaRect = arena.getBoundingClientRect();
    const lx = pointerX - arenaRect.left;
    const ly = pointerY - arenaRect.top;

    if (prevCursorX < -1000) {
      Body.setPosition(cursorBody, { x: lx, y: ly });
      Body.setVelocity(cursorBody, { x: 0, y: 0 });
    } else {
      // 用位移推導速度，讓碰撞帶有動量
      const vx = (lx - prevCursorX) * 0.65;
      const vy = (ly - prevCursorY) * 0.65;
      Body.setVelocity(cursorBody, { x: vx, y: vy });
      Body.setPosition(cursorBody, { x: lx, y: ly });
    }
    prevCursorX = lx;
    prevCursorY = ly;
  };

  const spawnCards = (w: number, h: number) => {
    if (!engine) return;
    tracked = [];

    cards.forEach((el, i) => {
      const { w: bw, h: bh } = cardSize(el);
      const mobile = isMobile();
      const margin = mobile ? 28 : 48;
      const topReserve = mobile ? 150 : 100;
      const x = margin + Math.random() * Math.max(40, w - margin * 2);
      const yMin = topReserve;
      const yMax = Math.max(topReserve + 40, h - margin - bh / 2);
      const y = yMin + Math.random() * (yMax - yMin);
      const body = Bodies.rectangle(x, y, bw, bh, {
        chamfer: { radius: cardChamfer() },
        restitution: 0.88,
        friction: 0.02,
        frictionAir: 0.012,
        density: 0.0012,
        label: `card-${i}`,
      });
      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 1.4,
        y: (Math.random() - 0.5) * 1.4,
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.03);
      World.add(engine!.world, body);
      tracked.push({ body, el, bounceLock: false, bounceScale: 1, orderProxy: null });
      el.style.transform = `translate(${x - bw / 2}px, ${y - bh / 2}px) rotate(0rad) scale(1)`;
    });
  };

  const syncDom = () => {
    if (ordered) return;
    for (const { body, el, bounceScale } of tracked) {
      const { w: bw, h: bh } = cardSize(el);
      el.style.transform = `translate(${body.position.x - bw / 2}px, ${body.position.y - bh / 2}px) rotate(${body.angle}rad) scale(${bounceScale})`;
    }
    raf = requestAnimationFrame(syncDom);
  };

  const gridTargets = () => {
    const { w, h } = size();
    const mobile = isMobile();
    const cols = mobile ? 2 : w < 1024 ? 2 : 3;
    const rows = Math.ceil(cards.length / cols);
    const gapX = mobile ? 8 : 16;
    const gapY = mobile ? 8 : 14;
    const padX = mobile ? 12 : 32;
    const padY = mobile ? 138 : 168;
    const usableW = w - padX * 2;
    const usableH = Math.max(mobile ? 260 : 220, h - padY - 20);
    const cellW = mobile
      ? (usableW - gapX * (cols - 1)) / cols
      : Math.min(330, (usableW - gapX * (cols - 1)) / cols);
    const cellH = Math.min(
      mobile ? 94 : 192,
      (usableH - gapY * (rows - 1)) / rows,
    );
    const gridW = cols * cellW + (cols - 1) * gapX;
    const gridH = rows * cellH + (rows - 1) * gapY;
    const startX = (w - gridW) / 2;
    const startY = Math.max(padY, (h - gridH) / 2 + (mobile ? 8 : 0));

    return cards.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: startX + col * (cellW + gapX) + cellW / 2,
        y: startY + row * (cellH + gapY) + cellH / 2,
        w: mobile ? Math.min(cellW, cardSize(cards[i]!).w) : cellW,
        h: cellH,
      };
    });
  };

  const enterOrder = () => {
    if (ordered || !engine || !runner) return;
    ordered = true;
    setStatus(true);
    cancelAnimationFrame(raf);
    Runner.stop(runner);
    parkCursor();

    const targets = gridTargets();
    tracked.forEach((item, i) => {
      const t = targets[i];
      if (!t) return;

      Body.setVelocity(item.body, { x: 0, y: 0 });
      Body.setAngularVelocity(item.body, 0);
      Body.setAngle(item.body, 0);
      Body.setPosition(item.body, { x: t.x, y: t.y });

      const { w: bw, h: bh } = cardSize(item.el);
      const cur = readTranslate(item.el);
      const endTx = t.x - bw / 2;
      const endTy = t.y - bh / 2;
      const proxy = { p: 0 };
      if (item.orderProxy) gsap.killTweensOf(item.orderProxy);
      item.orderProxy = proxy;
      item.bounceScale = 1;

      gsap.to(proxy, {
        p: 1,
        duration: reducedMotion ? 0.01 : 0.55 + i * 0.05,
        ease: 'power3.out',
        onUpdate: () => {
          const x = cur.x + (endTx - cur.x) * proxy.p;
          const y = cur.y + (endTy - cur.y) * proxy.p;
          const a = cur.angle * (1 - proxy.p);
          item.el.style.transform = `translate(${x}px, ${y}px) rotate(${a}rad) scale(1)`;
        },
        onComplete: () => {
          item.orderProxy = null;
          item.el.style.width = `${t.w}px`;
          const { w: nw, h: nh } = cardSize(item.el);
          const fx = t.x - nw / 2;
          const fy = t.y - nh / 2;
          item.el.style.transform = `translate(${fx}px, ${fy}px) rotate(0rad) scale(1)`;
        },
      });
    });
  };

  const enterChaos = () => {
    if (!ordered || !engine || !runner) return;
    ordered = false;
    setStatus(false);

    cards.forEach((el) => {
      el.style.width = '';
    });

    tracked.forEach((item) => {
      if (item.orderProxy) {
        gsap.killTweensOf(item.orderProxy);
        item.orderProxy = null;
      }
      item.bounceScale = 1;
      const { w: bw, h: bh } = cardSize(item.el);
      const cur = readTranslate(item.el);
      Body.setPosition(item.body, { x: cur.x + bw / 2, y: cur.y + bh / 2 });
      Body.setAngle(item.body, 0);
      Body.setVelocity(item.body, {
        x: (Math.random() - 0.5) * 2.2,
        y: (Math.random() - 0.5) * 2.2,
      });
      Body.setAngularVelocity(item.body, (Math.random() - 0.5) * 0.05);
    });

    Runner.run(runner, engine);
    syncDom();
  };

  const seatContainsTeacher = () => {
    const s = seat.getBoundingClientRect();
    const t = teacher.getBoundingClientRect();
    const cx = t.left + t.width / 2;
    const cy = t.top + t.height / 2;
    const pad = 10;
    return cx >= s.left - pad && cx <= s.right + pad && cy >= s.top - pad && cy <= s.bottom + pad;
  };

  const updateOrderFromSeat = () => {
    const onSeat = seatContainsTeacher();
    seat.classList.toggle('is-occupied', onSeat);
    teacher.classList.toggle('is-seated', onSeat);
    if (quote) quote.hidden = !onSeat;
    if (onSeat && !ordered) enterOrder();
    else if (!onSeat && ordered) enterChaos();
  };

  /** 左上初始位置 */
  const placeTeacherHome = () => {
    teacher.style.transform = 'translate(12px, 14px)';
  };

  const setTeacherPos = (x: number, y: number) => {
    const { w, h } = size();
    const tw = teacher.offsetWidth || 72;
    const th = teacher.offsetHeight || 96;
    const nx = Math.min(w - tw - 4, Math.max(4, x));
    const ny = Math.min(h - th - 4, Math.max(4, y));
    teacher.style.transform = `translate(${nx}px, ${ny}px)`;
  };

  const onTeacherDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    teacherDragging = true;
    teacher.setPointerCapture(e.pointerId);
    teacher.classList.add('is-dragging');
    const tRect = teacher.getBoundingClientRect();
    dragOffsetX = e.clientX - tRect.left;
    dragOffsetY = e.clientY - tRect.top;
  };

  const onTeacherMove = (e: PointerEvent) => {
    if (!teacherDragging) return;
    e.preventDefault();
    const arenaRect = arena.getBoundingClientRect();
    setTeacherPos(e.clientX - arenaRect.left - dragOffsetX, e.clientY - arenaRect.top - dragOffsetY);
    updateOrderFromSeat();
  };

  const onTeacherUp = (e: PointerEvent) => {
    if (!teacherDragging) return;
    teacherDragging = false;
    teacher.classList.remove('is-dragging');
    try {
      teacher.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    updateOrderFromSeat();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (teacherDragging) return;
    pointerInside = true;
    pointerX = e.clientX;
    pointerY = e.clientY;
  };

  const onPointerLeave = () => {
    pointerInside = false;
    pointerX = -9999;
    pointerY = -9999;
    parkCursor();
  };

  const onCopyClick = (e: Event) => {
    if (!ordered) {
      e.preventDefault();
      showToast('先請老師上講臺');
      return;
    }
    const btn = e.currentTarget as HTMLElement;
    const value = btn.dataset.copy ?? '';
    if (!value) return;
    e.preventDefault();
    void copyText(value);
  };

  const onLinkClick = (e: Event) => {
    if (!ordered) {
      e.preventDefault();
      showToast('先請老師上講臺');
    }
  };

  const onCollision = (event: Matter.IEventCollision<Matter.Engine>) => {
    if (ordered) return;
    for (const pair of event.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      const hitWall = labels.some((l) => l === 'wall');
      const hitCursor = labels.some((l) => l === 'cursor');
      const cardBodies = tracked.filter((item) => pair.bodyA === item.body || pair.bodyB === item.body);
      if (!cardBodies.length) continue;
      if (hitWall || hitCursor || labels.filter((l) => l.startsWith('card-')).length >= 2) {
        cardBodies.forEach((item) => bounceCard(item.el, item));
      }
    }
  };

  const onBeforeUpdate = () => {
    syncCursorBody();
    if (ordered) return;
    for (const { body } of tracked) {
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed < 0.15) {
        Body.setVelocity(body, {
          x: body.velocity.x + (Math.random() - 0.5) * 0.4,
          y: body.velocity.y + (Math.random() - 0.5) * 0.4,
        });
      } else if (speed > 3.2) {
        Body.setVelocity(body, {
          x: body.velocity.x * 0.9,
          y: body.velocity.y * 0.9,
        });
      }
    }
  };

  const rebuildBodies = () => {
    if (!engine) return;
    const { w, h } = size();
    buildWalls(w, h);

    tracked.forEach((item) => {
      const { w: bw, h: bh } = cardSize(item.el);
      const { x, y } = item.body.position;
      const angle = item.body.angle;
      const vel = { ...item.body.velocity };
      const label = item.body.label;
      World.remove(engine!.world, item.body);
      const body = Bodies.rectangle(
        Math.min(w - 20, Math.max(20, x)),
        Math.min(h - 20, Math.max(20, y)),
        bw,
        bh,
        {
          chamfer: { radius: cardChamfer() },
          restitution: 0.88,
          friction: 0.02,
          frictionAir: 0.012,
          density: 0.0012,
          label,
        },
      );
      Body.setAngle(body, angle);
      Body.setVelocity(body, vel);
      World.add(engine!.world, body);
      item.body = body;
    });
  };

  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!engine) return;
      rebuildBodies();

      const cur = readTranslate(teacher);
      setTeacherPos(cur.x, cur.y);

      if (ordered) {
        const targets = gridTargets();
        tracked.forEach((item, i) => {
          const t = targets[i];
          if (!t) return;
          Body.setPosition(item.body, { x: t.x, y: t.y });
          Body.setAngle(item.body, 0);
          item.el.style.width = `${t.w}px`;
          const { w: bw, h: bh } = cardSize(item.el);
          item.el.style.transform = `translate(${t.x - bw / 2}px, ${t.y - bh / 2}px) rotate(0rad) scale(1)`;
        });
      }
      updateOrderFromSeat();
    }, 120);
  };

  const copyBtns = Array.from(root.querySelectorAll<HTMLElement>('[data-copy]'));
  const linkEls = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[data-contact-link]'));
  copyBtns.forEach((btn) => btn.addEventListener('click', onCopyClick));
  linkEls.forEach((a) => a.addEventListener('click', onLinkClick));

  teacher.addEventListener('pointerdown', onTeacherDown);
  teacher.addEventListener('pointermove', onTeacherMove);
  teacher.addEventListener('pointerup', onTeacherUp);
  teacher.addEventListener('pointercancel', onTeacherUp);

  arena.addEventListener('pointermove', onPointerMove);
  arena.addEventListener('pointerleave', onPointerLeave);
  arena.addEventListener('pointerenter', () => {
    pointerInside = true;
  });
  window.addEventListener('resize', onResize);

  const onTouchMove = (e: TouchEvent) => {
    if (teacherDragging) e.preventDefault();
  };
  arena.addEventListener('touchmove', onTouchMove, { passive: false });

  const start = () => {
    if (started) return;
    started = true;
    engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0.001 },
    });
    const { w, h } = size();
    buildWalls(w, h);
    spawnCards(w, h);
    spawnCursor();
    runner = Runner.create();
    Runner.run(runner, engine);
    Events.on(engine, 'collisionStart', onCollision);
    Events.on(engine, 'beforeUpdate', onBeforeUpdate);
    syncDom();
    placeTeacherHome();
    setStatus(false);
  };

  requestAnimationFrame(start);

  return () => {
    ordered = true;
    started = false;
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer);
    window.clearTimeout(resizeTimer);
    if (runner) Runner.stop(runner);
    if (engine) {
      Events.off(engine, 'collisionStart', onCollision);
      Events.off(engine, 'beforeUpdate', onBeforeUpdate);
      World.clear(engine.world, false);
      Engine.clear(engine);
    }
    engine = null;
    runner = null;
    cursorBody = null;
    tracked = [];
    copyBtns.forEach((btn) => btn.removeEventListener('click', onCopyClick));
    linkEls.forEach((a) => a.removeEventListener('click', onLinkClick));
    teacher.removeEventListener('pointerdown', onTeacherDown);
    teacher.removeEventListener('pointermove', onTeacherMove);
    teacher.removeEventListener('pointerup', onTeacherUp);
    teacher.removeEventListener('pointercancel', onTeacherUp);
    arena.removeEventListener('pointermove', onPointerMove);
    arena.removeEventListener('pointerleave', onPointerLeave);
    arena.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('resize', onResize);
  };
}

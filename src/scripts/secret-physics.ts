import Matter from 'matter-js';

const { Engine, Runner, World, Bodies, Body, Mouse, MouseConstraint, Events } = Matter;

export type SecretFact = { text: string };
export type SecretMeme = { label: string; shape: 'circle' | 'rect' | 'tri' };

interface SecretPhysicsOptions {
  facts: SecretFact[];
  memes: SecretMeme[];
}

type Tracked = {
  body: Matter.Body;
  el: HTMLElement;
};

/**
 * 彩蛋物理場：邊界牆 + DOM 同步 + MouseConstraint（滑鼠／觸控拖拽）
 */
export function initSecretPhysics(root: HTMLElement, options: SecretPhysicsOptions) {
  const switchBtn = root.querySelector<HTMLButtonElement>('[data-egg-switch]');
  const minimal = root.querySelector<HTMLElement>('[data-egg-minimal]');
  const arena = root.querySelector<HTMLElement>('[data-egg-arena]');
  const layer = root.querySelector<HTMLElement>('[data-egg-layer]');
  if (!switchBtn || !minimal || !arena || !layer) return () => {};

  let engine: Matter.Engine | null = null;
  let runner: Matter.Runner | null = null;
  let mouseConstraint: Matter.MouseConstraint | null = null;
  let mouse: Matter.Mouse | null = null;
  let walls: Matter.Body[] = [];
  let tracked: Tracked[] = [];
  let running = false;
  let raf = 0;

  const WALL = 80;

  const size = () => {
    const r = arena.getBoundingClientRect();
    // 手機預留底部導覽，避免物體掉進導覽後方
    const bottomSafe = window.matchMedia('(max-width: 767px)').matches ? 72 : 0;
    return { w: Math.max(1, r.width), h: Math.max(1, r.height - bottomSafe) };
  };

  const clearWorld = () => {
    cancelAnimationFrame(raf);
    if (runner) Runner.stop(runner);
    if (engine) {
      World.clear(engine.world, false);
      Engine.clear(engine);
    }
    layer.replaceChildren();
    tracked = [];
    walls = [];
    engine = null;
    runner = null;
    mouseConstraint = null;
    mouse = null;
  };

  const syncDom = () => {
    if (!running) return;
    for (const { body, el } of tracked) {
      const { x, y } = body.position;
      const angle = body.angle;
      el.style.transform = `translate(${x - el.offsetWidth / 2}px, ${y - el.offsetHeight / 2}px) rotate(${angle}rad)`;
    }
    raf = requestAnimationFrame(syncDom);
  };

  const buildWalls = (w: number, h: number) => {
    if (!engine) return;
    if (walls.length) World.remove(engine.world, walls);
    const opt = { isStatic: true, friction: 0.9, restitution: 0.15, label: 'wall' };
    walls = [
      Bodies.rectangle(w / 2, h + WALL / 2, w + WALL * 2, WALL, opt), // floor
      Bodies.rectangle(w / 2, -WALL / 2, w + WALL * 2, WALL, opt), // ceiling
      Bodies.rectangle(-WALL / 2, h / 2, WALL, h + WALL * 2, opt), // left
      Bodies.rectangle(w + WALL / 2, h / 2, WALL, h + WALL * 2, opt), // right
    ];
    World.add(engine.world, walls);
  };

  const spawnObjects = (w: number, h: number) => {
    if (!engine) return;

    options.facts.forEach((fact, i) => {
      const el = document.createElement('div');
      el.className = 'egg-card';
      el.textContent = fact.text;
      el.style.width = w < 480 ? '140px' : '180px';
      layer.appendChild(el);

      const bw = el.offsetWidth;
      const bh = el.offsetHeight || 72;
      const x = 40 + Math.random() * Math.max(40, w - 80);
      const y = 30 + (i % 4) * 28;
      const body = Bodies.rectangle(x, y, bw, bh, {
        chamfer: { radius: 2 },
        restitution: 0.35,
        friction: 0.4,
        frictionAir: 0.02,
        density: 0.002,
        label: `fact-${i}`,
      });
      World.add(engine!.world, body);
      tracked.push({ body, el });
      el.style.transform = `translate(${x - bw / 2}px, ${y - bh / 2}px)`;
    });

    options.memes.forEach((meme, i) => {
      const el = document.createElement('div');
      el.className = `egg-meme egg-meme--${meme.shape}`;
      el.textContent = meme.label;
      layer.appendChild(el);

      const sizePx = meme.shape === 'circle' ? 64 : meme.shape === 'tri' ? 70 : 72;
      el.style.width = `${sizePx}px`;
      el.style.height = `${sizePx}px`;

      const bw = sizePx;
      const bh = sizePx;
      const x = 60 + Math.random() * Math.max(40, w - 120);
      const y = 10 + Math.random() * 60;
      let body: Matter.Body;
      if (meme.shape === 'circle') {
        body = Bodies.circle(x, y, bw / 2, {
          restitution: 0.55,
          friction: 0.3,
          frictionAir: 0.015,
          density: 0.0025,
          label: `meme-${i}`,
        });
      } else if (meme.shape === 'tri') {
        body = Bodies.polygon(x, y, 3, bw / 2, {
          restitution: 0.4,
          friction: 0.35,
          density: 0.0025,
          label: `meme-${i}`,
        });
      } else {
        body = Bodies.rectangle(x, y, bw, bh, {
          chamfer: { radius: 4 },
          restitution: 0.4,
          friction: 0.35,
          density: 0.0025,
          label: `meme-${i}`,
        });
      }
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
      World.add(engine!.world, body);
      tracked.push({ body, el });
      el.style.transform = `translate(${x - bw / 2}px, ${y - bh / 2}px)`;
    });
  };

  const attachMouse = () => {
    if (!engine) return;
    mouse = Mouse.create(arena);
    mouse.pixelRatio = window.devicePixelRatio || 1;

    mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.22,
        damping: 0.1,
        render: { visible: false },
      },
    });
    World.add(engine.world, mouseConstraint);

    // 觸控拖拽時禁止頁面滾動（手機撥弄）
    arena.addEventListener(
      'touchmove',
      (e) => {
        if (mouseConstraint?.body) e.preventDefault();
      },
      { passive: false },
    );

    Events.on(mouseConstraint, 'startdrag', () => {
      arena.classList.add('is-dragging');
    });
    Events.on(mouseConstraint, 'enddrag', () => {
      arena.classList.remove('is-dragging');
    });
  };

  const start = () => {
    if (running) return;
    running = true;
    root.classList.add('is-chaos');
    switchBtn.setAttribute('aria-pressed', 'true');
    switchBtn.textContent = '關閉重力';
    minimal.hidden = true;
    arena.hidden = false;

    // 等一幀以取得正確場地尺寸
    requestAnimationFrame(() => {
      if (!running) return;
      const { w, h } = size();
      engine = Engine.create({
        gravity: { x: 0, y: 1.15, scale: 0.001 },
      });
      buildWalls(w, h);
      spawnObjects(w, h);
      attachMouse();

      runner = Runner.create();
      Runner.run(runner, engine);
      syncDom();
    });
  };

  const stop = () => {
    if (!running) return;
    running = false;
    root.classList.remove('is-chaos');
    switchBtn.setAttribute('aria-pressed', 'false');
    switchBtn.textContent = '開啟彩蛋';
    clearWorld();
    arena.hidden = true;
    minimal.hidden = false;
  };

  const onToggle = () => {
    if (running) stop();
    else start();
  };

  const onResize = () => {
    if (!running || !engine) return;
    const { w, h } = size();
    buildWalls(w, h);
    // 把飛出邊界的物體夾回場內
    for (const { body } of tracked) {
      const x = Math.min(w - 20, Math.max(20, body.position.x));
      const y = Math.min(h - 20, Math.max(20, body.position.y));
      Body.setPosition(body, { x, y });
    }
    if (mouse) {
      mouse.pixelRatio = window.devicePixelRatio || 1;
    }
  };

  switchBtn.addEventListener('click', onToggle);
  window.addEventListener('resize', onResize);

  return () => {
    stop();
    switchBtn.removeEventListener('click', onToggle);
    window.removeEventListener('resize', onResize);
  };
}

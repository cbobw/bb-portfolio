/**
 * One-click 切換 Solid / Wireframe 藍圖模式
 */
export function initBlueprintToggle(root: HTMLElement) {
  const btn = root.querySelector<HTMLButtonElement>('[data-mode-toggle]');
  const stage = root.querySelector<HTMLElement>('[data-blueprint-stage]');
  const label = root.querySelector<HTMLElement>('[data-mode-label]');
  if (!btn || !stage) return () => {};

  let mode: 'solid' | 'wireframe' = 'solid';

  const apply = () => {
    stage.dataset.mode = mode;
    root.dataset.mode = mode;
    btn.setAttribute('aria-pressed', mode === 'wireframe' ? 'true' : 'false');
    if (label) label.textContent = mode === 'solid' ? 'Solid' : 'Wireframe';
    btn.textContent = mode === 'solid' ? '切換 Wireframe' : '切換 Solid';
  };

  const onClick = () => {
    mode = mode === 'solid' ? 'wireframe' : 'solid';
    apply();
  };

  btn.addEventListener('click', onClick);
  apply();

  return () => btn.removeEventListener('click', onClick);
}

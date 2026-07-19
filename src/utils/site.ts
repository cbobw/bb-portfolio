/** GitHub Pages 子路徑下的資源/路由前綴（Astro BASE_URL） */
export const base = import.meta.env.BASE_URL;

/** 將站內路徑轉為含 base 的 URL，例如 downloads/foo.pdf → /bb-portfolio/downloads/foo.pdf */
export function withBase(path: string): string {
  const cleaned = path.replace(/^\//, '');
  return `${base}${cleaned}`;
}

/** 移除 pathname 中的 base 前綴，供導覽 active 判斷 */
export function stripBase(pathname: string): string {
  if (base !== '/' && pathname.startsWith(base)) {
    const rest = pathname.slice(base.length);
    return rest ? (rest.startsWith('/') ? rest : `/${rest}`) : '/';
  }
  return pathname || '/';
}

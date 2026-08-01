const BLOCKED_MANGA_TITLES = new Set(['one piece']);

function normalizeMangaTitle(title: string) {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isMangaTitleBlocked(title: string) {
  return BLOCKED_MANGA_TITLES.has(normalizeMangaTitle(title));
}

export function filterAllowedMangaTitles<TManga extends { title: string }>(mangas: TManga[]) {
  return mangas.filter((manga) => !isMangaTitleBlocked(manga.title));
}

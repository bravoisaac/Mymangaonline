export const EXTENSIONS_INDEX_URL =
  'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json';

export const EXTENSIONS_APK_BASE_URL =
  'https://raw.githubusercontent.com/keiyoushi/extensions/repo/apk';

export type MangaSource = {
  name: string;
  lang: string;
  id: string;
  baseUrl: string;
};

export type MangaExtension = {
  name: string;
  pkg: string;
  apk: string;
  lang: string;
  code: number;
  version: string;
  sources: MangaSource[];
  nsfw: number;
};

export type ExtensionStats = {
  totalExtensions: number;
  totalSources: number;
  safeExtensions: number;
  nsfwExtensions: number;
  languages: { lang: string; count: number }[];
  topSources: MangaExtension[];
};

export type LanguageFilter = {
  code: string;
  label: string;
  extensionCount: number;
  sourceCount: number;
};

const LANGUAGE_LABELS: Record<string, string> = {
  all: 'Todos',
  ar: 'Arabe',
  ca: 'Catalan',
  ceb: 'Cebuano',
  cs: 'Checo',
  da: 'Danes',
  de: 'Aleman',
  en: 'Ingles',
  eo: 'Esperanto',
  es: 'Espanol',
  et: 'Estonio',
  fr: 'Frances',
  hi: 'Hindi',
  hu: 'Hungaro',
  id: 'Indonesio',
  it: 'Italiano',
  ja: 'Japones',
  jv: 'Javanes',
  ko: 'Coreano',
  nl: 'Neerlandes',
  pl: 'Polaco',
  pt: 'Portugues',
  ru: 'Ruso',
  tr: 'Turco',
  uk: 'Ucraniano',
  vi: 'Vietnamita',
  zh: 'Chino',
};

export function getApkUrl(apk: string) {
  return `${EXTENSIONS_APK_BASE_URL}/${apk}`;
}

export function getDisplayName(extension: MangaExtension) {
  return extension.name.replace(/^Tachiyomi:\s*/i, '').trim();
}

export function getPrimaryUrl(extension: MangaExtension) {
  return extension.sources.find((source) => source.baseUrl)?.baseUrl;
}

export function getLanguageLabel(code: string) {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export function getLanguageFilters(extensions: MangaExtension[]): LanguageFilter[] {
  const filters = new Map<string, { extensionPackages: Set<string>; sourceCount: number }>();

  function ensureFilter(code: string) {
    const normalizedCode = code || 'all';
    const currentFilter = filters.get(normalizedCode);

    if (currentFilter) {
      return currentFilter;
    }

    const nextFilter = { extensionPackages: new Set<string>(), sourceCount: 0 };
    filters.set(normalizedCode, nextFilter);
    return nextFilter;
  }

  const allFilter = ensureFilter('all');

  extensions.forEach((extension) => {
    allFilter.extensionPackages.add(extension.pkg);
    allFilter.sourceCount += extension.sources.length;

    const extensionLanguages = new Set([extension.lang]);
    extension.sources.forEach((source) => {
      extensionLanguages.add(source.lang);
      ensureFilter(source.lang).sourceCount += 1;
    });

    extensionLanguages.forEach((language) => {
      ensureFilter(language).extensionPackages.add(extension.pkg);
    });
  });

  return Array.from(filters.entries())
    .map(([code, value]) => ({
      code,
      label: getLanguageLabel(code),
      extensionCount: value.extensionPackages.size,
      sourceCount: value.sourceCount,
    }))
    .sort((a, b) => {
      if (a.code === 'all') {
        return -1;
      }
      if (b.code === 'all') {
        return 1;
      }

      return b.extensionCount - a.extensionCount || a.label.localeCompare(b.label);
    });
}

function matchesLanguage(extension: MangaExtension, language: string) {
  if (language === 'all') {
    return true;
  }

  return extension.lang === language || extension.sources.some((source) => source.lang === language);
}

export function getSourcePreview(extension: MangaExtension, language: string) {
  if (language === 'all') {
    return extension.sources.slice(0, 3);
  }

  const matchingSources = extension.sources.filter((source) => source.lang === language);

  if (matchingSources.length > 0) {
    return matchingSources.slice(0, 3);
  }

  if (extension.lang === language) {
    return extension.sources.slice(0, 3);
  }

  return [];
}

export function getHiddenSourceCount(extension: MangaExtension, language: string) {
  if (language === 'all' || extension.lang === language) {
    return Math.max(extension.sources.length - 3, 0);
  }

  const matchingSources = extension.sources.filter((source) => source.lang === language);
  return Math.max(matchingSources.length - 3, 0);
}

export function filterExtensions(
  extensions: MangaExtension[],
  query: string,
  language: string,
  showNsfw: boolean,
) {
  const normalizedQuery = query.trim().toLowerCase();

  return extensions.filter((extension) => {
    if (!showNsfw && extension.nsfw === 1) {
      return false;
    }

    if (!matchesLanguage(extension, language)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      extension.name.toLowerCase().includes(normalizedQuery) ||
      extension.pkg.toLowerCase().includes(normalizedQuery) ||
      extension.sources.some(
        (source) =>
          source.name.toLowerCase().includes(normalizedQuery) ||
          source.baseUrl.toLowerCase().includes(normalizedQuery),
      )
    );
  });
}

export function buildExtensionStats(extensions: MangaExtension[]): ExtensionStats {
  const languageCounts = new Map<string, number>();
  let totalSources = 0;

  extensions.forEach((extension) => {
    totalSources += extension.sources.length;
    languageCounts.set(extension.lang, (languageCounts.get(extension.lang) ?? 0) + 1);
  });

  return {
    totalExtensions: extensions.length,
    totalSources,
    safeExtensions: extensions.filter((extension) => extension.nsfw !== 1).length,
    nsfwExtensions: extensions.filter((extension) => extension.nsfw === 1).length,
    languages: Array.from(languageCounts.entries())
      .map(([lang, count]) => ({ lang, count }))
      .sort((a, b) => b.count - a.count),
    topSources: [...extensions].sort((a, b) => b.sources.length - a.sources.length).slice(0, 8),
  };
}

export async function fetchExtensions() {
  const response = await fetch(EXTENSIONS_INDEX_URL);

  if (!response.ok) {
    throw new Error(`No se pudo cargar el indice (${response.status})`);
  }

  return (await response.json()) as MangaExtension[];
}

export const MANGADEX_API_URL = 'https://api.mangadex.org';
export const MANGADEX_UPLOADS_URL = 'https://uploads.mangadex.org';

export type MangaLanguage = 'es' | 'en' | 'pt-br' | 'fr';

export const DEFAULT_MANGA_LANGUAGE: MangaLanguage = 'es';

export type MangaSearchResult = {
  id: string;
  source?: string;
  sourceName?: string;
  title: string;
  description: string;
  status?: string;
  year?: number;
  contentRating?: string;
  coverUrl?: string;
  latestUploadedChapter?: string;
  chapterCount?: number;
};

export type MangaChapter = {
  id: string;
  source?: string;
  title: string;
  chapter: string;
  volume?: string;
  language?: string;
  pages: number;
  readableAt?: string;
  groupName?: string;
};

export type MangaChapterFeed = {
  chapters: MangaChapter[];
  total: number;
  limit?: number;
  offset?: number;
};

export type MangaLibraryPage = {
  mangas: MangaSearchResult[];
  total: number;
  limit: number;
  offset: number;
};

export type MangaTag = {
  id: string;
  name: string;
  group: string;
};

export type MangaFilters = {
  tagIds?: string[];
  tagMode?: 'AND' | 'OR';
};

export type ChapterPages = {
  baseUrl: string;
  hash: string;
  pageUrls: string[];
};

type MangaDexRelationship = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
};

type MangaDexEntity<TAttributes> = {
  id: string;
  type: string;
  attributes: TAttributes;
  relationships?: MangaDexRelationship[];
};

type MangaAttributes = {
  title?: Record<string, string>;
  altTitles?: Record<string, string>[];
  description?: Record<string, string>;
  status?: string;
  year?: number;
  contentRating?: string;
  latestUploadedChapter?: string;
};

type ChapterAttributes = {
  title?: string;
  chapter?: string;
  volume?: string;
  pages?: number;
  readableAt?: string;
};

type MangaTagAttributes = {
  name?: Record<string, string>;
  group?: string;
};

type MangaDexCollection<TAttributes> = {
  result: string;
  data: MangaDexEntity<TAttributes>[];
  total?: number;
};

type MangaDexSingle<TAttributes> = {
  result: string;
  data: MangaDexEntity<TAttributes>;
};

type AtHomeResponse = {
  result: string;
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
};

const CHAPTER_FEED_LIMIT = 96;

export const MANGA_LANGUAGES: { code: MangaLanguage; label: string }[] = [
  { code: 'es', label: 'Espanol' },
  { code: 'en', label: 'Ingles' },
  { code: 'pt-br', label: 'Portugues BR' },
  { code: 'fr', label: 'Frances' },
];

function buildUrl(path: string, params: Record<string, string | string[]>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => searchParams.append(key, item));
      return;
    }

    if (value) {
      searchParams.set(key, value);
    }
  });

  return `${MANGADEX_API_URL}${path}?${searchParams.toString()}`;
}

function getRelationship(entity: MangaDexEntity<unknown>, type: string) {
  return entity.relationships?.find((relationship) => relationship.type === type);
}

function getLocalizedText(text: Record<string, string> | undefined, language: MangaLanguage) {
  if (!text) {
    return '';
  }

  return text[language] ?? text.es ?? text.en ?? Object.values(text)[0] ?? '';
}

function mapManga(entity: MangaDexEntity<MangaAttributes>, language: MangaLanguage): MangaSearchResult {
  const cover = getRelationship(entity, 'cover_art');
  const fileName = cover?.attributes?.fileName;

  return {
    id: entity.id,
    title: getLocalizedText(entity.attributes.title, language),
    description: getLocalizedText(entity.attributes.description, language),
    status: entity.attributes.status,
    year: entity.attributes.year,
    contentRating: entity.attributes.contentRating,
    latestUploadedChapter: entity.attributes.latestUploadedChapter,
    coverUrl:
      typeof fileName === 'string'
        ? `${MANGADEX_UPLOADS_URL}/covers/${entity.id}/${fileName}.256.jpg`
        : undefined,
  };
}

function mapChapter(entity: MangaDexEntity<ChapterAttributes>): MangaChapter {
  const group = getRelationship(entity, 'scanlation_group');
  const groupName = group?.attributes?.name;

  return {
    id: entity.id,
    title: entity.attributes.title ?? '',
    chapter: entity.attributes.chapter ?? 'Sin numero',
    volume: entity.attributes.volume,
    pages: entity.attributes.pages ?? 0,
    readableAt: entity.attributes.readableAt,
    groupName: typeof groupName === 'string' ? groupName : undefined,
  };
}

function mapTag(entity: MangaDexEntity<MangaTagAttributes>, language: MangaLanguage): MangaTag {
  return {
    id: entity.id,
    name: getLocalizedText(entity.attributes.name, language),
    group: entity.attributes.group ?? '',
  };
}

async function fetchJson<TResponse>(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`MangaDex respondio ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export async function searchManga(title: string, language: MangaLanguage, filters: MangaFilters = {}) {
  const tagIds = filters.tagIds ?? [];
  const url = buildUrl('/manga', {
    title: title.trim(),
    limit: '20',
    'includes[]': 'cover_art',
    'availableTranslatedLanguage[]': language,
    'contentRating[]': ['safe', 'suggestive'],
    'includedTags[]': tagIds,
    includedTagsMode: tagIds.length > 1 ? filters.tagMode ?? 'AND' : '',
    'order[relevance]': 'desc',
  });
  const data = await fetchJson<MangaDexCollection<MangaAttributes>>(url);

  return data.data.map((entity) => mapManga(entity, language));
}

export async function getMangaTags(language: MangaLanguage) {
  const data = await fetchJson<MangaDexCollection<MangaTagAttributes>>(buildUrl('/manga/tag', {}));

  return data.data
    .map((entity) => mapTag(entity, language))
    .filter((tag) => tag.group === 'genre' || tag.group === 'theme')
    .filter((tag) => tag.name)
    .sort((first, second) => first.name.localeCompare(second.name));
}

export async function getMangaById(mangaId: string, language: MangaLanguage) {
  const url = buildUrl(`/manga/${mangaId}`, {
    'includes[]': 'cover_art',
  });
  const data = await fetchJson<MangaDexSingle<MangaAttributes>>(url);

  return mapManga(data.data, language);
}

export async function getPopularManga(language: MangaLanguage) {
  const url = buildUrl('/manga', {
    limit: '20',
    'includes[]': 'cover_art',
    'availableTranslatedLanguage[]': language,
    'contentRating[]': ['safe', 'suggestive'],
    hasAvailableChapters: 'true',
    'order[followedCount]': 'desc',
  });
  const data = await fetchJson<MangaDexCollection<MangaAttributes>>(url);

  return data.data.map((entity) => mapManga(entity, language));
}

export async function getMangaLibrary(
  language: MangaLanguage,
  page = 0,
  limit = 15,
  filters: MangaFilters = {},
): Promise<MangaLibraryPage> {
  const normalizedPage = Math.max(0, page);
  const normalizedLimit = Math.max(1, limit);
  const offset = normalizedPage * normalizedLimit;
  const tagIds = filters.tagIds ?? [];
  const url = buildUrl('/manga', {
    limit: String(normalizedLimit),
    offset: String(offset),
    'includes[]': 'cover_art',
    'availableTranslatedLanguage[]': language,
    'contentRating[]': ['safe', 'suggestive'],
    hasAvailableChapters: 'true',
    'includedTags[]': tagIds,
    includedTagsMode: tagIds.length > 1 ? filters.tagMode ?? 'AND' : '',
    'order[followedCount]': 'desc',
  });
  const data = await fetchJson<MangaDexCollection<MangaAttributes>>(url);

  return {
    mangas: data.data.map((entity) => mapManga(entity, language)),
    total: data.total ?? data.data.length,
    limit: normalizedLimit,
    offset,
  };
}

export async function getRecentlyUpdatedManga(language: MangaLanguage) {
  const url = buildUrl('/manga', {
    limit: '20',
    'includes[]': 'cover_art',
    'availableTranslatedLanguage[]': language,
    'contentRating[]': ['safe', 'suggestive'],
    hasAvailableChapters: 'true',
    'order[latestUploadedChapter]': 'desc',
  });
  const data = await fetchJson<MangaDexCollection<MangaAttributes>>(url);

  return data.data.map((entity) => mapManga(entity, language));
}

export async function getMangaChapters(mangaId: string, language: MangaLanguage) {
  const chapters: MangaChapter[] = [];
  let offset = 0;
  let total = CHAPTER_FEED_LIMIT;

  while (offset < total) {
    const url = buildUrl(`/manga/${mangaId}/feed`, {
      limit: String(CHAPTER_FEED_LIMIT),
      offset: String(offset),
      'translatedLanguage[]': language,
      'includes[]': 'scanlation_group',
      'order[volume]': 'asc',
      'order[chapter]': 'asc',
    });
    const data = await fetchJson<MangaDexCollection<ChapterAttributes>>(url);

    total = data.total ?? chapters.length + data.data.length;
    chapters.push(...data.data.map(mapChapter));

    if (data.data.length === 0) {
      break;
    }

    offset += data.data.length;
  }

  const readableChapters = chapters.filter((chapter) => chapter.pages > 0);

  return {
    chapters: readableChapters,
    total: readableChapters.length,
  } satisfies MangaChapterFeed;
}

export async function getChapterPages(chapterId: string, useDataSaver = true): Promise<ChapterPages> {
  const data = await fetchJson<AtHomeResponse>(`${MANGADEX_API_URL}/at-home/server/${chapterId}`);
  const pages = useDataSaver ? data.chapter.dataSaver : data.chapter.data;
  const qualityPath = useDataSaver ? 'data-saver' : 'data';

  return {
    baseUrl: data.baseUrl,
    hash: data.chapter.hash,
    pageUrls: pages.map((page) => `${data.baseUrl}/${qualityPath}/${data.chapter.hash}/${page}`),
  };
}

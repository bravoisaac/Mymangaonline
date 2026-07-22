import { Platform } from 'react-native';

import type {
  ChapterPages,
  MangaChapter,
  MangaFilters,
  MangaLanguage,
  MangaLibraryPage,
  MangaSearchResult,
  MangaTag,
} from './mangadex';

export type MangaSourceId = 'mangadex' | 'comick' | string;

type NormalizedManga = {
  id: string;
  source: string;
  title: string;
  description: string;
  cover: string | null;
  status: string;
  year: number | null;
  genres: string[];
  language: string;
};

type NormalizedMangaDetails = NormalizedManga & {
  authors: string[];
  artists: string[];
  chaptersCount: number;
};

type NormalizedChapter = {
  id: string;
  source: string;
  mangaId: string;
  chapter: string;
  title: string | null;
  volume: string | null;
  language: string;
  pages: number;
  publishedAt: string | null;
};

type NormalizedPage = {
  page: number;
  url: string;
  width: number | null;
  height: number | null;
};

type SearchResponse = {
  query: string;
  source: string;
  lang: string;
  items: NormalizedManga[];
};

type SearchAllResponse = {
  query: string;
  lang: string;
  results: {
    source: string;
    items: NormalizedManga[];
  }[];
  errors: {
    source: string;
    message: string;
  }[];
};

type MangaLibraryResponse = {
  source: string;
  lang: string;
  mangas: NormalizedManga[];
  total: number;
  limit: number;
  offset: number;
};

type MangaTagsResponse = {
  source: string;
  lang: string;
  tags: MangaTag[];
};

type ChapterFeedResponse = {
  source: string;
  mangaId: string;
  lang: string;
  chapters: NormalizedChapter[];
  total: number;
  limit: number;
  offset: number;
};

type ChapterPagesResponse = {
  source: string;
  chapterId: string;
  pages: NormalizedPage[];
};

type HomeMangaResponse = {
  recentlyUpdated: MangaSearchResult[];
  popular: MangaSearchResult[];
  recommended: MangaSearchResult[];
};

export type ScraperProvider = {
  id: string;
  name: string;
  language?: string;
  type: 'api' | 'scraper';
  enabled: boolean;
  available: boolean;
  unavailableReason?: string;
};

export type ScraperMangaResult = {
  id: string;
  providerId: string;
  title: string;
  cover?: string;
  description?: string;
  url?: string;
};

export type ScraperMangaDetails = ScraperMangaResult & {
  author?: string;
  status?: string;
  genres?: string[];
};

export type ScraperChapter = {
  id: string;
  providerId: string;
  mangaId: string;
  title: string;
  chapterNumber?: number;
  volume?: string;
  language?: string;
  publishedAt?: string;
  url?: string;
};

export type ScraperPage = {
  index: number;
  imageUrl: string;
};

export type ScraperProviderError = {
  providerId: string;
  message: string;
};

export type ScraperSearchPayload = {
  items: ScraperMangaResult[];
  errors: ScraperProviderError[];
};

type ProvidersResponse = {
  providers: ScraperProvider[];
};

type ScraperSearchAllResponse = {
  query: string;
  results: {
    providerId: string;
    items: ScraperMangaResult[];
  }[];
  errors: ScraperProviderError[];
};

type ScraperSearchProviderResponse = {
  query: string;
  providerId: string;
  items: ScraperMangaResult[];
};

type ScraperChapterFeedResponse = {
  providerId: string;
  mangaId: string;
  chapters: ScraperChapter[];
};

type ScraperPagesResponse = {
  providerId: string;
  chapterId: string;
  pages: ScraperPage[];
};

type MergedMangaLibraryOptions = MangaFilters & {
  query?: string;
};

type MangaLibraryRequestOptions = MangaFilters & {
  sort?: 'popular' | 'recentlyUpdated';
  source?: 'all' | 'mangadex' | 'comick';
};

const HOME_MANGA_LIMIT = 15;
const HOME_MANGA_LOOKAHEAD_LIMIT = 30;
const DEFAULT_API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';
const DEFAULT_LIBRARY_QUERY = 'one piece';
const SECONDARY_LIBRARY_TIMEOUT_MS = 1600;

export const MYMANGA_API_BASE_URL = (
  process.env.EXPO_PUBLIC_MYMANGA_API_URL ?? DEFAULT_API_BASE_URL
).replace(/\/$/, '');

export function getSourceLabel(source: MangaSourceId | undefined) {
  if (source === 'comick') {
    return 'Comick';
  }

  if (source === 'mangadex' || !source) {
    return 'MangaDex';
  }

  return source;
}

function buildApiUrl(path: string, params: Record<string, string | string[] | undefined> = {}) {
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

  const query = searchParams.toString();

  return `${MYMANGA_API_BASE_URL}${path}${query ? `?${query}` : ''}`;
}

function getApiImageUrl(source: string, imageUrl: string | null) {
  if (!imageUrl) {
    return undefined;
  }

  if (source === 'comick') {
    return buildApiUrl('/proxy/image', { url: imageUrl });
  }

  return imageUrl;
}

async function fetchApiJson<TResponse>(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API_Mymangaonline respondio ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

function withTimeout<TValue>(promise: Promise<TValue>, timeoutMs: number, fallback: TValue) {
  return new Promise<TValue>((resolve) => {
    const timeoutId = setTimeout(() => resolve(fallback), timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timeoutId));
  });
}

function mapApiManga(manga: NormalizedManga | NormalizedMangaDetails): MangaSearchResult {
  return {
    id: manga.id,
    source: manga.source,
    sourceName: getSourceLabel(manga.source),
    title: manga.title,
    description: manga.description,
    status: manga.status,
    year: manga.year ?? undefined,
    coverUrl: getApiImageUrl(manga.source, manga.cover),
    chapterCount: 'chaptersCount' in manga ? manga.chaptersCount : undefined,
    genres: manga.genres,
  };
}

function mapApiChapter(chapter: NormalizedChapter): MangaChapter {
  return {
    id: chapter.id,
    source: chapter.source,
    title: chapter.title ?? '',
    chapter: chapter.chapter || 'Sin numero',
    volume: chapter.volume ?? undefined,
    language: chapter.language,
    pages: chapter.pages,
    readableAt: chapter.publishedAt ?? undefined,
  };
}

function getMangaResultKey(manga: MangaSearchResult) {
  return `${manga.source ?? 'mangadex'}:${manga.id}`;
}

function mergeMangaLists(primary: MangaSearchResult[], secondary: MangaSearchResult[]) {
  const merged: MangaSearchResult[] = [];
  const seenMangaIds = new Set<string>();
  const totalItems = Math.max(primary.length, secondary.length);

  for (let index = 0; index < totalItems; index += 1) {
    [primary[index], secondary[index]].forEach((manga) => {
      if (!manga) {
        return;
      }

      const mangaKey = getMangaResultKey(manga);

      if (!seenMangaIds.has(mangaKey)) {
        seenMangaIds.add(mangaKey);
        merged.push(manga);
      }
    });
  }

  return merged;
}

export async function searchMangaFromApi(
  query: string,
  language: MangaLanguage,
  source: MangaSourceId = 'mangadex',
) {
  const data = await fetchApiJson<SearchResponse>(
    buildApiUrl('/manga/search', {
      q: query.trim(),
      source,
      lang: language,
    }),
  );

  return data.items.map(mapApiManga);
}

export async function searchAllMangaFromApi(query: string, language: MangaLanguage) {
  const data = await fetchApiJson<SearchAllResponse>(
    buildApiUrl('/manga/search/all', {
      q: query.trim(),
      lang: language,
    }),
  );

  return data.results.flatMap((result) => result.items.map(mapApiManga));
}

export async function getMangaTagsFromApi(language: MangaLanguage) {
  const data = await fetchApiJson<MangaTagsResponse>(
    buildApiUrl('/manga/tags', {
      lang: language,
    }),
  );

  return data.tags;
}

async function getMangaLibraryFromApi(
  language: MangaLanguage,
  page: number,
  limit: number,
  options: MergedMangaLibraryOptions,
): Promise<MangaLibraryPage> {
  const data = await fetchApiJson<MangaLibraryResponse>(
    buildApiUrl('/manga/library', {
      lang: language,
      page: String(page),
      limit: String(limit),
      tagIds: options.tagIds,
      tagMode: options.tagMode,
    }),
  );

  return {
    mangas: data.mangas.map(mapApiManga),
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
}

export async function getMergedMangaLibraryFromApi(
  language: MangaLanguage,
  page = 0,
  limit = 15,
  options: MergedMangaLibraryOptions = {},
): Promise<MangaLibraryPage> {
  const normalizedPage = Math.max(0, page);
  const normalizedLimit = Math.max(1, limit);
  const hasMangaDexFilters = (options.tagIds?.length ?? 0) > 0;
  const libraryQuery = options.query?.trim() || DEFAULT_LIBRARY_QUERY;
  const [mangadexPage, comickMangas] = await Promise.all([
    getMangaLibraryFromApi(language, normalizedPage, normalizedLimit, options),
    hasMangaDexFilters || normalizedPage > 0
      ? Promise.resolve<MangaSearchResult[]>([])
      : withTimeout(
          searchMangaFromApi(libraryQuery, language, 'comick'),
          SECONDARY_LIBRARY_TIMEOUT_MS,
          [],
        ),
  ]);
  const mergedMangas = mergeMangaLists(mangadexPage.mangas, comickMangas).slice(0, normalizedLimit);

  return {
    mangas: mergedMangas,
    total: mangadexPage.total,
    limit: normalizedLimit,
    offset: mangadexPage.offset,
  };
}

export async function getAllMangaLibraryFromApi(
  language: MangaLanguage,
  page = 0,
  limit = 15,
  options: MangaLibraryRequestOptions = {},
): Promise<MangaLibraryPage> {
  const normalizedPage = Math.max(0, page);
  const normalizedLimit = Math.max(1, limit);
  const data = await fetchApiJson<MangaLibraryResponse>(
    buildApiUrl('/manga/library/all', {
      lang: language,
      page: String(normalizedPage),
      limit: String(normalizedLimit),
      tagIds: options.tagIds,
      tagMode: options.tagMode,
      sort: options.sort,
      source: options.source,
    }),
  );

  return {
    mangas: data.mangas.map(mapApiManga),
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
}

export async function getMangaDetailsFromApi(
  source: MangaSourceId,
  mangaId: string,
  language: MangaLanguage,
) {
  const data = await fetchApiJson<NormalizedMangaDetails>(
    buildApiUrl(`/manga/${encodeURIComponent(source)}/${encodeURIComponent(mangaId)}`, {
      lang: language,
    }),
  );

  return mapApiManga(data);
}

export async function getMangaChaptersFromApi(
  source: MangaSourceId,
  mangaId: string,
  language: MangaLanguage,
  offset = 0,
  limit = 100,
  order: 'asc' | 'desc' = 'asc',
) {
  const data = await fetchApiJson<ChapterFeedResponse>(
    buildApiUrl(`/manga/${encodeURIComponent(source)}/${encodeURIComponent(mangaId)}/chapters`, {
      lang: language,
      offset: String(Math.max(0, offset)),
      limit: String(Math.max(1, limit)),
      order,
    }),
  );

  return {
    chapters: data.chapters.map(mapApiChapter),
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
}

export async function getChapterPagesFromApi(source: MangaSourceId, chapterId: string): Promise<ChapterPages> {
  const data = await fetchApiJson<ChapterPagesResponse>(
    buildApiUrl(`/manga/${encodeURIComponent(source)}/chapter/${encodeURIComponent(chapterId)}/pages`),
  );

  return {
    baseUrl: '',
    hash: '',
    pageUrls: data.pages.map((page) => (source === 'comick' ? buildApiUrl('/proxy/image', { url: page.url }) : page.url)),
  };
}

export async function getHomeMangaFromApi(language: MangaLanguage): Promise<HomeMangaResponse> {
  const [updatedPage, popularPage] = await Promise.all([
    getAllMangaLibraryFromApi(language, 0, HOME_MANGA_LOOKAHEAD_LIMIT, { sort: 'recentlyUpdated' }),
    getAllMangaLibraryFromApi(language, 0, HOME_MANGA_LOOKAHEAD_LIMIT, { sort: 'popular' }),
  ]);

  const discoveryPool = mergeMangaLists(
    popularPage.mangas.slice(4),
    updatedPage.mangas.slice(4),
  );

  return {
    recentlyUpdated: updatedPage.mangas.slice(0, HOME_MANGA_LIMIT),
    popular: popularPage.mangas.slice(0, HOME_MANGA_LIMIT),
    recommended: (discoveryPool.length > 0 ? discoveryPool : popularPage.mangas).slice(
      0,
      HOME_MANGA_LIMIT,
    ),
  };
}

export async function getScraperProvidersFromApi(activeOnly = true) {
  const data = await fetchApiJson<ProvidersResponse>(
    buildApiUrl('/providers', {
      all: activeOnly ? undefined : 'true',
    }),
  );

  return data.providers;
}

export async function searchScraperMangaFromApi(
  query: string,
  providerId?: string,
): Promise<ScraperSearchPayload> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return {
      items: [],
      errors: [],
    };
  }

  if (providerId && providerId !== 'all') {
    const data = await fetchApiJson<ScraperSearchProviderResponse>(
      buildApiUrl(`/manga/search/${encodeURIComponent(providerId)}`, {
        q: normalizedQuery,
      }),
    );

    return {
      items: data.items.map((item) => ({ ...item, providerId: item.providerId ?? data.providerId })),
      errors: [],
    };
  }

  const data = await fetchApiJson<ScraperSearchAllResponse>(
    buildApiUrl('/manga/search', {
      q: normalizedQuery,
    }),
  );

  return {
    items: data.results.flatMap((result) =>
      result.items.map((item) => ({ ...item, providerId: item.providerId ?? result.providerId })),
    ),
    errors: data.errors,
  };
}

export async function getScraperMangaDetailsFromApi(providerId: string, mangaId: string) {
  return fetchApiJson<ScraperMangaDetails>(
    buildApiUrl(`/manga/${encodeURIComponent(providerId)}/${encodeURIComponent(mangaId)}`),
  );
}

export async function getScraperChaptersFromApi(providerId: string, mangaId: string) {
  const data = await fetchApiJson<ScraperChapterFeedResponse>(
    buildApiUrl(`/manga/${encodeURIComponent(providerId)}/${encodeURIComponent(mangaId)}/chapters`),
  );

  return data.chapters;
}

export async function getScraperChapterPagesFromApi(providerId: string, chapterId: string) {
  const data = await fetchApiJson<ScraperPagesResponse>(
    buildApiUrl(`/manga/${encodeURIComponent(providerId)}/chapters/${encodeURIComponent(chapterId)}/pages`),
  );

  return data.pages;
}

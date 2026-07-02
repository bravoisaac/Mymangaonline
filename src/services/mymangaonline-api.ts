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
};

type ChapterPagesResponse = {
  source: string;
  chapterId: string;
  pages: NormalizedPage[];
};

type HomeMangaResponse = {
  featured: MangaSearchResult[];
  recommended: MangaSearchResult[];
};

type MergedMangaLibraryOptions = MangaFilters & {
  query?: string;
};

const DEFAULT_API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';
const DEFAULT_LIBRARY_QUERY = 'one piece';

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

function mapApiManga(manga: NormalizedManga): MangaSearchResult {
  return {
    id: manga.id,
    source: manga.source,
    sourceName: getSourceLabel(manga.source),
    title: manga.title,
    description: manga.description,
    status: manga.status,
    year: manga.year ?? undefined,
    coverUrl: getApiImageUrl(manga.source, manga.cover),
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
      : searchMangaFromApi(libraryQuery, language, 'comick').catch(() => []),
  ]);
  const mergedMangas = mergeMangaLists(mangadexPage.mangas, comickMangas).slice(0, normalizedLimit);

  return {
    mangas: mergedMangas,
    total: mangadexPage.total,
    limit: normalizedLimit,
    offset: mangadexPage.offset,
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
) {
  const data = await fetchApiJson<ChapterFeedResponse>(
    buildApiUrl(`/manga/${encodeURIComponent(source)}/${encodeURIComponent(mangaId)}/chapters`, {
      lang: language,
    }),
  );

  return {
    chapters: data.chapters.map(mapApiChapter),
    total: data.chapters.length,
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
  const [featured, recommended] = await Promise.all([
    searchMangaFromApi('one piece', language, 'comick'),
    searchMangaFromApi('naruto', language, 'mangadex'),
  ]);

  return {
    featured,
    recommended,
  };
}

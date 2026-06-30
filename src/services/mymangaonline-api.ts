import { Platform } from 'react-native';

import type { ChapterPages, MangaChapter, MangaLanguage, MangaSearchResult } from './mangadex';

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

const DEFAULT_API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';

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

function buildApiUrl(path: string, params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params);
  const query = searchParams.toString();

  return `${MYMANGA_API_BASE_URL}${path}${query ? `?${query}` : ''}`;
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
    coverUrl: manga.cover ?? undefined,
  };
}

function mapApiChapter(chapter: NormalizedChapter): MangaChapter {
  return {
    id: chapter.id,
    source: chapter.source,
    title: chapter.title ?? '',
    chapter: chapter.chapter || 'Sin numero',
    volume: chapter.volume ?? undefined,
    pages: chapter.pages,
    readableAt: chapter.publishedAt ?? undefined,
  };
}

export async function searchMangaFromApi(query: string, language: MangaLanguage, source: MangaSourceId = 'mangadex') {
  const data = await fetchApiJson<SearchResponse>(
    buildApiUrl('/manga/search', {
      q: query.trim(),
      source,
      lang: language,
    }),
  );

  return data.items.map(mapApiManga);
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
    pageUrls: data.pages.map((page) => page.url),
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

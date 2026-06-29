import { Platform } from 'react-native';

import type { MangaLanguage, MangaSearchResult } from './mangadex';

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

type SearchResponse = {
  query: string;
  source: string;
  lang: string;
  items: NormalizedManga[];
};

type HomeMangaResponse = {
  featured: MangaSearchResult[];
  recommended: MangaSearchResult[];
};

const DEFAULT_API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';

export const MYMANGA_API_BASE_URL = (
  process.env.EXPO_PUBLIC_MYMANGA_API_URL ?? DEFAULT_API_BASE_URL
).replace(/\/$/, '');

function buildApiUrl(path: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `${MYMANGA_API_BASE_URL}${path}?${searchParams.toString()}`;
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
    title: manga.title,
    description: manga.description,
    status: manga.status,
    year: manga.year ?? undefined,
    coverUrl: manga.cover ?? undefined,
  };
}

export async function searchMangaFromApi(query: string, language: MangaLanguage, source = 'mangadex') {
  const data = await fetchApiJson<SearchResponse>(
    buildApiUrl('/manga/search', {
      q: query.trim(),
      source,
      lang: language,
    }),
  );

  return data.items.map(mapApiManga);
}

export async function getHomeMangaFromApi(language: MangaLanguage): Promise<HomeMangaResponse> {
  const [featured, recommended] = await Promise.all([
    searchMangaFromApi('one piece', language),
    searchMangaFromApi('naruto', language),
  ]);

  return {
    featured,
    recommended,
  };
}

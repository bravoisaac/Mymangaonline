import type { MangaLanguage, MangaSearchResult } from './mangadex';
import type { ScraperMangaResult } from './mymangaonline-api';

const ACCOUNTS_KEY = 'mymangaonline.accounts';
const CURRENT_USER_KEY = 'mymangaonline.currentUser';
const LIBRARY_KEY_PREFIX = 'mymangaonline.library.';
const VIEWED_CHAPTERS_KEY_PREFIX = 'mymangaonline.viewedChapters.';

export type AuthProvider = 'local';

export type LocalUser = {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  pictureUrl?: string;
  createdAt: string;
};

type LocalAccount = LocalUser & {
  updatedAt: string;
};

type LegacyLocalAccount = Omit<LocalAccount, 'provider'> & {
  provider: AuthProvider | 'email';
  passwordHash?: unknown;
};

export type SavedManga = MangaSearchResult & {
  language: MangaLanguage;
  savedAt: string;
  libraryType?: 'api' | 'scraper';
  providerId?: string;
  providerName?: string;
  scraperMangaId?: string;
  scraperLanguage?: string;
  sourceUrl?: string;
};

function getStorage() {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  return globalThis.localStorage;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUserId(email: string) {
  return normalizeEmail(email).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getLibraryKey(userId: string) {
  return `${LIBRARY_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

function getViewedChaptersKey(userId: string) {
  return `${VIEWED_CHAPTERS_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

function getChapterHistoryKey(mangaId: string, chapterId: string, language: MangaLanguage) {
  return `${mangaId}:${language}:${chapterId}`;
}

function getCurrentViewerId() {
  return getCurrentUser()?.id ?? 'guest';
}

function readJson<TValue>(key: string, fallback: TValue): TValue {
  const storage = getStorage();

  if (!storage) {
    return fallback;
  }

  try {
    const value = storage.getItem(key);

    return value ? (JSON.parse(value) as TValue) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

function getAccounts() {
  const storedAccounts = readJson<LegacyLocalAccount[]>(ACCOUNTS_KEY, []);
  const accounts = storedAccounts
    .filter((account) => account?.id && account.email && account.name)
    .map(({ passwordHash: _discardedPasswordHash, ...account }) => ({
      ...account,
      provider: 'local' as const,
    }));

  if (storedAccounts.some((account) => 'passwordHash' in account || account.provider !== 'local')) {
    saveAccounts(accounts);
  }

  return accounts;
}

function saveAccounts(accounts: LocalAccount[]) {
  writeJson(ACCOUNTS_KEY, accounts);
}

function validateEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Ingresa un correo valido');
  }

  return normalizedEmail;
}

function toPublicUser(account: LocalAccount, provider = account.provider): LocalUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    provider,
    pictureUrl: account.pictureUrl,
    createdAt: account.createdAt,
  };
}

function setCurrentUser(user: LocalUser) {
  writeJson(CURRENT_USER_KEY, user);
}

export function getCurrentUser() {
  getAccounts();
  const user = readJson<LocalUser | null>(CURRENT_USER_KEY, null);

  if (!user?.id || !user.email || !['email', 'local'].includes(user.provider)) {
    return null;
  }

  const localUser = { ...user, provider: 'local' as const };

  if (user.provider !== 'local') {
    setCurrentUser(localUser);
  }

  return localUser;
}

export function createLocalProfile(name: string, email: string) {
  const trimmedName = name.trim();
  const normalizedEmail = validateEmail(email);

  if (trimmedName.length < 2) {
    throw new Error('Ingresa tu nombre');
  }

  const accounts = getAccounts();

  if (accounts.some((account) => account.email === normalizedEmail)) {
    throw new Error('Ya existe un perfil local con ese correo');
  }

  const now = new Date().toISOString();
  const account: LocalAccount = {
    id: normalizeUserId(normalizedEmail),
    name: trimmedName,
    email: normalizedEmail,
    provider: 'local',
    createdAt: now,
    updatedAt: now,
  };
  const nextAccounts = [
    account,
    ...accounts.filter((existingAccount) => existingAccount.email !== normalizedEmail),
  ];
  const user = toPublicUser(account);

  saveAccounts(nextAccounts);
  setCurrentUser(user);

  return user;
}

export function openLocalProfile(email: string) {
  const normalizedEmail = validateEmail(email);
  const account = getAccounts().find((item) => item.email === normalizedEmail);

  if (!account) {
    throw new Error('No existe un perfil local con ese correo en este navegador');
  }

  const user = toPublicUser(account, 'local');

  setCurrentUser(user);

  return user;
}

export function logoutUser() {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(CURRENT_USER_KEY);
}

export function getSavedMangas(userId: string) {
  return readJson<SavedManga[]>(getLibraryKey(userId), []);
}

export function isMangaSaved(userId: string, mangaId: string) {
  return getSavedMangas(userId).some((manga) => manga.id === mangaId);
}

export function getScraperSavedMangaId(providerId: string, mangaId: string) {
  return `scraper:${providerId}:${mangaId}`;
}

export function isScraperMangaSaved(userId: string, providerId: string, mangaId: string) {
  return isMangaSaved(userId, getScraperSavedMangaId(providerId, mangaId));
}

export function saveManga(userId: string, manga: MangaSearchResult, language: MangaLanguage) {
  const savedMangas = getSavedMangas(userId);
  const nextManga: SavedManga = {
    ...manga,
    language,
    libraryType: 'api',
    savedAt: new Date().toISOString(),
  };
  const nextSavedMangas = [
    nextManga,
    ...savedMangas.filter((savedManga) => savedManga.id !== manga.id),
  ];

  writeJson(getLibraryKey(userId), nextSavedMangas);

  return nextSavedMangas;
}

export function saveScraperManga(
  userId: string,
  manga: ScraperMangaResult,
  providerName: string,
  providerLanguage?: string,
) {
  const savedMangas = getSavedMangas(userId);
  const mangaId = getScraperSavedMangaId(manga.providerId, manga.id);
  const nextManga: SavedManga = {
    id: mangaId,
    source: `scraper:${manga.providerId}`,
    sourceName: providerName,
    title: manga.title,
    description: manga.description ?? '',
    coverUrl: manga.cover,
    language: 'es',
    savedAt: new Date().toISOString(),
    libraryType: 'scraper',
    providerId: manga.providerId,
    providerName,
    scraperMangaId: manga.id,
    scraperLanguage: providerLanguage,
    sourceUrl: manga.url,
  };
  const nextSavedMangas = [
    nextManga,
    ...savedMangas.filter((savedManga) => savedManga.id !== mangaId),
  ];

  writeJson(getLibraryKey(userId), nextSavedMangas);

  return nextSavedMangas;
}

export function removeSavedManga(userId: string, mangaId: string) {
  const nextSavedMangas = getSavedMangas(userId).filter((manga) => manga.id !== mangaId);

  writeJson(getLibraryKey(userId), nextSavedMangas);

  return nextSavedMangas;
}

export function markChapterViewed(mangaId: string, chapterId: string, language: MangaLanguage) {
  const viewerId = getCurrentViewerId();
  const viewedChapters = readJson<Record<string, string>>(getViewedChaptersKey(viewerId), {});
  const chapterHistoryKey = getChapterHistoryKey(mangaId, chapterId, language);

  viewedChapters[chapterHistoryKey] = new Date().toISOString();
  writeJson(getViewedChaptersKey(viewerId), viewedChapters);

  return viewedChapters[chapterHistoryKey];
}

export function toggleChapterViewed(mangaId: string, chapterId: string, language: MangaLanguage) {
  const viewerId = getCurrentViewerId();
  const viewedChapters = readJson<Record<string, string>>(getViewedChaptersKey(viewerId), {});
  const chapterHistoryKey = getChapterHistoryKey(mangaId, chapterId, language);
  const isViewed = Boolean(viewedChapters[chapterHistoryKey]);

  if (isViewed) {
    delete viewedChapters[chapterHistoryKey];
  } else {
    viewedChapters[chapterHistoryKey] = new Date().toISOString();
  }

  writeJson(getViewedChaptersKey(viewerId), viewedChapters);

  return !isViewed;
}

export function getViewedChapterIds(mangaId: string, language: MangaLanguage) {
  const viewerId = getCurrentViewerId();
  const viewedChapters = readJson<Record<string, string>>(getViewedChaptersKey(viewerId), {});
  const chapterPrefix = `${mangaId}:${language}:`;

  return Object.keys(viewedChapters)
    .filter((chapterHistoryKey) => chapterHistoryKey.startsWith(chapterPrefix))
    .map((chapterHistoryKey) => chapterHistoryKey.slice(chapterPrefix.length));
}

export function getViewedChapterHistory(mangaId: string, language: MangaLanguage) {
  const viewerId = getCurrentViewerId();
  const viewedChapters = readJson<Record<string, string>>(getViewedChaptersKey(viewerId), {});
  const chapterPrefix = `${mangaId}:${language}:`;

  return Object.fromEntries(
    Object.entries(viewedChapters)
      .filter(([chapterHistoryKey]) => chapterHistoryKey.startsWith(chapterPrefix))
      .map(([chapterHistoryKey, viewedAt]) => [
        chapterHistoryKey.slice(chapterPrefix.length),
        viewedAt,
      ]),
  ) as Record<string, string>;
}

export function isChapterViewed(mangaId: string, chapterId: string, language: MangaLanguage) {
  const viewerId = getCurrentViewerId();
  const viewedChapters = readJson<Record<string, string>>(getViewedChaptersKey(viewerId), {});

  return Boolean(viewedChapters[getChapterHistoryKey(mangaId, chapterId, language)]);
}

import type { MangaLanguage, MangaSearchResult } from './mangadex';

const ACCOUNTS_KEY = 'mymangaonline.accounts';
const CURRENT_USER_KEY = 'mymangaonline.currentUser';
const LIBRARY_KEY_PREFIX = 'mymangaonline.library.';
const VIEWED_CHAPTERS_KEY_PREFIX = 'mymangaonline.viewedChapters.';

export type AuthProvider = 'email';

export type LocalUser = {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  pictureUrl?: string;
  createdAt: string;
};

type LocalAccount = LocalUser & {
  passwordHash?: string;
  updatedAt: string;
};

export type SavedManga = MangaSearchResult & {
  language: MangaLanguage;
  savedAt: string;
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
  return readJson<LocalAccount[]>(ACCOUNTS_KEY, []);
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

function validatePassword(password: string) {
  if (password.length < 6) {
    throw new Error('La contrasena debe tener al menos 6 caracteres');
  }
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

async function hashPassword(password: string, email: string) {
  const value = `${normalizeEmail(email)}:${password}`;

  if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const encodedValue = new TextEncoder().encode(value);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', encodedValue);

    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  let fallbackHash = 0;

  for (let index = 0; index < value.length; index += 1) {
    fallbackHash = (fallbackHash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return `fallback-${fallbackHash.toString(16)}`;
}

export function getCurrentUser() {
  const user = readJson<LocalUser | null>(CURRENT_USER_KEY, null);

  if (!user?.id || !user.email || user.provider !== 'email') {
    return null;
  }

  return user;
}

export async function createEmailAccount(name: string, email: string, password: string) {
  const trimmedName = name.trim();
  const normalizedEmail = validateEmail(email);

  if (trimmedName.length < 2) {
    throw new Error('Ingresa tu nombre');
  }

  validatePassword(password);

  const accounts = getAccounts();

  if (accounts.some((account) => account.email === normalizedEmail && account.passwordHash)) {
    throw new Error('Ya existe una cuenta con ese correo');
  }

  const now = new Date().toISOString();
  const account: LocalAccount = {
    id: normalizeUserId(normalizedEmail),
    name: trimmedName,
    email: normalizedEmail,
    provider: 'email',
    passwordHash: await hashPassword(password, normalizedEmail),
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

export async function loginWithEmail(email: string, password: string) {
  const normalizedEmail = validateEmail(email);
  validatePassword(password);

  const account = getAccounts().find((item) => item.email === normalizedEmail && item.passwordHash);

  if (!account) {
    throw new Error('No existe una cuenta con ese correo');
  }

  const passwordHash = await hashPassword(password, normalizedEmail);

  if (account.passwordHash !== passwordHash) {
    throw new Error('Correo o contrasena incorrectos');
  }

  const user = toPublicUser(account, 'email');

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

export function saveManga(userId: string, manga: MangaSearchResult, language: MangaLanguage) {
  const savedMangas = getSavedMangas(userId);
  const nextManga: SavedManga = {
    ...manga,
    language,
    savedAt: new Date().toISOString(),
  };
  const nextSavedMangas = [
    nextManga,
    ...savedMangas.filter((savedManga) => savedManga.id !== manga.id),
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

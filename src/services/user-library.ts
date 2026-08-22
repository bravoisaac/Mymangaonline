import type { User } from '@supabase/supabase-js';

import type { MangaLanguage, MangaSearchResult } from './mangadex';
import type { ScraperMangaResult } from './mymangaonline-api';
import { filterAllowedMangaTitles, isMangaTitleBlocked } from './manga-policy';
import { isSupabaseConfigured, requireSupabase, supabase } from './supabase';

const LEGACY_ACCOUNTS_KEY = 'mymangaonline.accounts';
const CURRENT_USER_KEY = 'mymangaonline.currentUser';
const LIBRARY_KEY_PREFIX = 'mymangaonline.library.';
const VIEWED_CHAPTERS_KEY_PREFIX = 'mymangaonline.viewedChapters.';

export type ProfileUser = {
  id: string;
  name: string;
  email: string;
  provider: 'supabase';
  pictureUrl?: string;
  createdAt: string;
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

export type ProfileSessionResult = {
  user: ProfileUser | null;
  mangas: SavedManga[];
  message?: string;
};

type SavedMangaRow = {
  manga: unknown;
  saved_at: string;
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

function normalizeLegacyUserId(email: string) {
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

function validateEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Ingresa un correo valido');
  }

  return normalizedEmail;
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }

  return password;
}

function toProfileUser(user: User): ProfileUser {
  const email = user.email ?? '';
  const metadataName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '';
  const pictureUrl =
    typeof user.user_metadata?.picture === 'string' ? user.user_metadata.picture : undefined;

  return {
    id: user.id,
    name: metadataName || email.split('@')[0] || 'Lector',
    email,
    provider: 'supabase',
    pictureUrl,
    createdAt: user.created_at,
  };
}

function setCurrentUser(user: ProfileUser) {
  writeJson(CURRENT_USER_KEY, user);
}

function clearCurrentUser() {
  getStorage()?.removeItem(CURRENT_USER_KEY);
}

function isSavedManga(value: unknown): value is SavedManga {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const manga = value as Partial<SavedManga>;

  return (
    typeof manga.id === 'string' &&
    manga.id.length > 0 &&
    typeof manga.title === 'string' &&
    typeof manga.savedAt === 'string' &&
    ['es', 'en', 'pt-br', 'fr'].includes(String(manga.language))
  );
}

function mergeSavedMangas(...collections: SavedManga[][]) {
  const mangasById = new Map<string, SavedManga>();

  collections.flat().forEach((manga) => {
    const existing = mangasById.get(manga.id);

    if (!existing || Date.parse(manga.savedAt) >= Date.parse(existing.savedAt)) {
      mangasById.set(manga.id, manga);
    }
  });

  return filterAllowedMangaTitles(
    Array.from(mangasById.values()).sort(
      (first, second) => Date.parse(second.savedAt) - Date.parse(first.savedAt),
    ),
  );
}

function getFriendlyAuthError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos';
  }

  if (normalizedMessage.includes('email not confirmed')) {
    return 'Confirma tu correo antes de iniciar sesion';
  }

  if (normalizedMessage.includes('user already registered')) {
    return 'Ya existe un perfil con ese correo';
  }

  if (normalizedMessage.includes('password')) {
    return 'La contraseña no cumple los requisitos del perfil';
  }

  return 'No se pudo completar el acceso al perfil';
}

function getFriendlyPasswordChangeError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'La contraseña actual no es correcta';
  }

  if (
    normalizedMessage.includes('same password') ||
    normalizedMessage.includes('different from the old password')
  ) {
    return 'La nueva contraseña debe ser distinta de la actual';
  }

  if (normalizedMessage.includes('password')) {
    return 'La nueva contraseña no cumple los requisitos del perfil';
  }

  return 'No se pudo cambiar la contraseña';
}

async function getRemoteSavedMangas(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('saved_mangas')
    .select('manga, saved_at')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });

  if (error) {
    throw new Error('No se pudo descargar la biblioteca sincronizada');
  }

  return (data as SavedMangaRow[])
    .map((row) => {
      if (!isSavedManga(row.manga)) {
        return null;
      }

      return {
        ...row.manga,
        savedAt: row.saved_at || row.manga.savedAt,
      };
    })
    .filter((manga): manga is SavedManga => manga !== null);
}

async function upsertRemoteSavedMangas(userId: string, mangas: SavedManga[]) {
  if (mangas.length === 0) {
    return;
  }

  const client = requireSupabase();
  const { error } = await client.from('saved_mangas').upsert(
    mangas.map((manga) => ({
      user_id: userId,
      manga_id: manga.id,
      manga,
      saved_at: manga.savedAt,
    })),
    { onConflict: 'user_id,manga_id' },
  );

  if (error) {
    throw new Error('No se pudo guardar la biblioteca sincronizada');
  }
}

async function syncProfileLibrary(user: ProfileUser) {
  const localMangas = getSavedMangas(user.id);
  const legacyMangas = getSavedMangas(normalizeLegacyUserId(user.email));
  const remoteMangas = await getRemoteSavedMangas(user.id);
  const mergedMangas = mergeSavedMangas(remoteMangas, legacyMangas, localMangas);

  await upsertRemoteSavedMangas(user.id, mergedMangas);
  writeJson(getLibraryKey(user.id), mergedMangas);
  getStorage()?.removeItem(LEGACY_ACCOUNTS_KEY);

  return mergedMangas;
}

async function completeProfileSession(user: User): Promise<ProfileSessionResult> {
  const profileUser = toProfileUser(user);

  setCurrentUser(profileUser);

  try {
    const mangas = await syncProfileLibrary(profileUser);

    return { user: profileUser, mangas };
  } catch (error) {
    return {
      user: profileUser,
      mangas: getSavedMangas(profileUser.id),
      message:
        error instanceof Error
          ? `${error.message}. Se conservara la copia local para volver a intentarlo.`
          : 'No se pudo sincronizar la biblioteca. Se conservara la copia local.',
    };
  }
}

export { isSupabaseConfigured };

export function getCurrentUser() {
  const user = readJson<ProfileUser | null>(CURRENT_USER_KEY, null);

  if (!user?.id || !user.email || user.provider !== 'supabase') {
    return null;
  }

  return user;
}

export async function restoreOnlineProfile(): Promise<ProfileSessionResult> {
  if (!supabase) {
    return { user: null, mangas: [] };
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error('No se pudo restaurar la sesion del perfil');
  }

  if (!data.session?.user) {
    clearCurrentUser();
    return { user: null, mangas: [] };
  }

  const { data: verifiedUserData, error: verifiedUserError } = await supabase.auth.getUser();

  if (verifiedUserError || !verifiedUserData.user) {
    throw new Error('No se pudo validar la sesion del perfil');
  }

  return completeProfileSession(verifiedUserData.user);
}

export async function createOnlineProfile(name: string, email: string, password: string) {
  const trimmedName = name.trim();
  const normalizedEmail = validateEmail(email);

  validatePassword(password);

  if (trimmedName.length < 2) {
    throw new Error('Ingresa tu nombre');
  }

  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { name: trimmedName },
    },
  });

  if (error) {
    throw new Error(getFriendlyAuthError(error.message));
  }

  if (!data.session || !data.user) {
    return {
      user: null,
      mangas: [],
      message: 'Perfil creado. Revisa tu correo y confirma la cuenta antes de iniciar sesion.',
    } satisfies ProfileSessionResult;
  }

  return completeProfileSession(data.user);
}

export async function openOnlineProfile(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: validateEmail(email),
    password: validatePassword(password),
  });

  if (error) {
    throw new Error(getFriendlyAuthError(error.message));
  }

  return completeProfileSession(data.user);
}

export async function changeOnlineProfilePassword(
  currentPassword: string,
  newPassword: string,
  email?: string,
) {
  const client = requireSupabase();
  const validatedCurrentPassword = validatePassword(currentPassword);
  const validatedNewPassword = validatePassword(newPassword);

  if (validatedCurrentPassword === validatedNewPassword) {
    throw new Error('La nueva contraseña debe ser distinta de la actual');
  }

  let accountEmail = email ? validateEmail(email) : '';

  if (!accountEmail) {
    const { data: currentUserData, error: currentUserError } = await client.auth.getUser();
    const currentUser = currentUserData.user;

    if (currentUserError || !currentUser?.email) {
      throw new Error('Vuelve a iniciar sesión antes de cambiar la contraseña');
    }

    accountEmail = currentUser.email;
  }

  const { error: verificationError } = await client.auth.signInWithPassword({
    email: accountEmail,
    password: validatedCurrentPassword,
  });

  if (verificationError) {
    throw new Error(getFriendlyPasswordChangeError(verificationError.message));
  }

  const { data, error } = await client.auth.updateUser({
    password: validatedNewPassword,
  });

  if (error || !data.user) {
    throw new Error(getFriendlyPasswordChangeError(error?.message ?? 'Password update failed'));
  }

  return completeProfileSession(data.user);
}

export async function logoutUser() {
  try {
    await supabase?.auth.signOut({ scope: 'local' });
  } finally {
    clearCurrentUser();
  }
}

export function getSavedMangas(userId: string) {
  const mangas = readJson<unknown[]>(getLibraryKey(userId), []).filter(isSavedManga);

  return filterAllowedMangaTitles(mangas);
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

export async function saveManga(
  userId: string,
  manga: MangaSearchResult,
  language: MangaLanguage,
) {
  if (isMangaTitleBlocked(manga.title)) {
    throw new Error('Este manga no esta disponible.');
  }

  const nextManga: SavedManga = {
    ...manga,
    language,
    libraryType: 'api',
    savedAt: new Date().toISOString(),
  };
  const nextSavedMangas = mergeSavedMangas([nextManga], getSavedMangas(userId));

  writeJson(getLibraryKey(userId), nextSavedMangas);
  await upsertRemoteSavedMangas(userId, [nextManga]);

  return nextSavedMangas;
}

export async function saveScraperManga(
  userId: string,
  manga: ScraperMangaResult,
  providerName: string,
  providerLanguage?: string,
) {
  if (isMangaTitleBlocked(manga.title)) {
    throw new Error('Este manga no esta disponible.');
  }

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
  const nextSavedMangas = mergeSavedMangas([nextManga], getSavedMangas(userId));

  writeJson(getLibraryKey(userId), nextSavedMangas);
  await upsertRemoteSavedMangas(userId, [nextManga]);

  return nextSavedMangas;
}

export async function removeSavedManga(userId: string, mangaId: string) {
  const client = requireSupabase();
  const { error } = await client
    .from('saved_mangas')
    .delete()
    .eq('user_id', userId)
    .eq('manga_id', mangaId);

  if (error) {
    throw new Error('No se pudo eliminar el manga de la biblioteca sincronizada');
  }

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

import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useHydratedWindowDimensions, useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useTheme } from '@/hooks/use-theme';
import type { MangaChapter } from '@/services/mangadex';
import {
  getMangaChaptersFromApi,
  getScraperChaptersFromApi,
  getSourceLabel,
  type ScraperChapter,
} from '@/services/mymangaonline-api';
import {
  changeOnlineProfilePassword,
  createOnlineProfile,
  getCurrentUser,
  getSavedMangas,
  getViewedChapterHistory,
  isSupabaseConfigured,
  logoutUser,
  openOnlineProfile,
  removeSavedManga,
  restoreOnlineProfile,
  type ProfileUser,
  type SavedManga,
} from '@/services/user-library';

type AuthMode = 'open' | 'create' | 'change';
const MOBILE_LAYOUT_BREAKPOINT = 640;

type MangaProgress = {
  chapterCount: number;
  latestChapter?: MangaChapter;
  lastViewedChapter?: MangaChapter;
  hasNewChapter: boolean;
  updatedAt: string;
  error?: string;
};

function getTime(value: string | undefined) {
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function getChapterLabel(chapter: MangaChapter | undefined) {
  if (!chapter) {
    return 'Sin leer';
  }

  return `Capitulo ${chapter.chapter}`;
}

function mapScraperChapter(chapter: ScraperChapter | undefined): MangaChapter | undefined {
  if (!chapter) {
    return undefined;
  }

  return {
    id: chapter.id,
    source: `scraper:${chapter.providerId}`,
    title: chapter.title,
    chapter: chapter.chapterNumber === undefined ? chapter.title || 'Sin numero' : String(chapter.chapterNumber),
    volume: chapter.volume,
    language: chapter.language,
    pages: 0,
    readableAt: chapter.publishedAt,
  };
}

function getSavedMangaSourceLabel(manga: SavedManga) {
  if (manga.libraryType === 'scraper') {
    return manga.providerName ?? manga.providerId ?? 'Scraper';
  }

  return getSourceLabel(manga.source);
}

export default function LibraryScreen() {
  const theme = useTheme();
  const { width: viewportWidth } = useHydratedWindowDimensions();
  const { contentInset } = useResponsiveLayout();
  const isMobileLayout = viewportWidth < MOBILE_LAYOUT_BREAKPOINT;
  const router = useRouter();
  const [user, setUser] = useState<ProfileUser | null>(() => getCurrentUser());
  const [authMode, setAuthMode] = useState<AuthMode>('open');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmedNewPassword, setConfirmedNewPassword] = useState('');
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [savedMangas, setSavedMangas] = useState<SavedManga[]>(() => (user ? getSavedMangas(user.id) : []));
  const [progressByMangaId, setProgressByMangaId] = useState<Record<string, MangaProgress>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(isSupabaseConfigured);
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [removingMangaId, setRemovingMangaId] = useState<string | null>(null);

  const displayedSavedMangas = useMemo(
    () =>
      [...savedMangas].sort((firstManga, secondManga) => {
        const firstProgress = progressByMangaId[firstManga.id];
        const secondProgress = progressByMangaId[secondManga.id];

        if (Boolean(firstProgress?.hasNewChapter) !== Boolean(secondProgress?.hasNewChapter)) {
          return firstProgress?.hasNewChapter ? -1 : 1;
        }

        return (
          getTime(secondProgress?.updatedAt ?? secondManga.savedAt) -
          getTime(firstProgress?.updatedAt ?? firstManga.savedAt)
        );
      }),
    [progressByMangaId, savedMangas],
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let isActive = true;

    async function restoreSession() {
      try {
        const result = await restoreOnlineProfile();

        if (!isActive) {
          return;
        }

        setUser(result.user);
        setSavedMangas(result.mangas);
        setNotice(result.message ?? null);
        setError(null);
      } catch (restoreError) {
        if (isActive) {
          setError(
            restoreError instanceof Error
              ? restoreError.message
              : 'No se pudo restaurar la sesion del perfil',
          );
        }
      } finally {
        if (isActive) {
          setIsRestoringSession(false);
        }
      }
    }

    void restoreSession();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!user || savedMangas.length === 0) {
      return;
    }

    let isCurrentRequest = true;

    async function loadProgress() {
      await Promise.resolve();

      if (!isCurrentRequest) {
        return;
      }

      setIsLoadingProgress(true);

      try {
        const progressEntries = await Promise.all(
          savedMangas.map(async (manga) => {
            try {
              if (manga.libraryType === 'scraper' && manga.providerId && manga.scraperMangaId) {
                const scraperChapters = await getScraperChaptersFromApi(manga.providerId, manga.scraperMangaId);
                const latestChapter = mapScraperChapter(scraperChapters.at(-1));

                return [
                  manga.id,
                  {
                    chapterCount: scraperChapters.length,
                    latestChapter,
                    hasNewChapter: false,
                    updatedAt: latestChapter?.readableAt ?? manga.savedAt,
                  } satisfies MangaProgress,
                ] as const;
              }

              const chapterFeed = await getMangaChaptersFromApi(manga.source ?? 'mangadex', manga.id, manga.language);
              const viewedHistory = getViewedChapterHistory(manga.id, manga.language);
              const latestChapter = chapterFeed.chapters.at(-1);
              let lastViewedAt = '';
              let lastViewedChapter: MangaChapter | undefined;
              let highestViewedIndex = -1;

              chapterFeed.chapters.forEach((chapter, chapterIndex) => {
                const viewedAt = viewedHistory[chapter.id];

                if (!viewedAt) {
                  return;
                }

                if (viewedAt > lastViewedAt) {
                  lastViewedAt = viewedAt;
                  lastViewedChapter = chapter;
                }

                highestViewedIndex = Math.max(highestViewedIndex, chapterIndex);
              });

              return [
                manga.id,
                {
                  chapterCount: chapterFeed.chapters.length,
                  latestChapter,
                  lastViewedChapter,
                  hasNewChapter:
                    Boolean(latestChapter) &&
                    highestViewedIndex >= 0 &&
                    highestViewedIndex < chapterFeed.chapters.length - 1,
                  updatedAt: latestChapter?.readableAt ?? manga.savedAt,
                } satisfies MangaProgress,
              ] as const;
            } catch (progressError) {
              return [
                manga.id,
                {
                  chapterCount: 0,
                  hasNewChapter: false,
                  updatedAt: manga.savedAt,
                  error:
                    progressError instanceof Error
                      ? progressError.message
                      : 'No se pudo cargar progreso',
                } satisfies MangaProgress,
              ] as const;
            }
          }),
        );

        if (isCurrentRequest) {
          setProgressByMangaId(Object.fromEntries(progressEntries));
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoadingProgress(false);
        }
      }
    }

    void loadProgress();

    return () => {
      isCurrentRequest = false;
    };
  }, [savedMangas, user]);

  async function handleProfileSubmit() {
    try {
      setIsSubmitting(true);
      setError(null);
      setNotice(null);
      let result;

      if (authMode === 'change') {
        if (newPassword !== confirmedNewPassword) {
          throw new Error('Las contraseñas nuevas no coinciden');
        }

        result = await changeOnlineProfilePassword(password, newPassword, email);
      } else {
        result =
          authMode === 'create'
            ? await createOnlineProfile(name, email, password)
            : await openOnlineProfile(email, password);
      }

      setUser(result.user);
      setSavedMangas(result.mangas);
      setNotice(
        authMode === 'change'
          ? 'Contrasena actualizada correctamente.'
          : (result.message ?? null),
      );
      setPassword('');
      setNewPassword('');
      setConfirmedNewPassword('');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'No se pudo abrir el perfil');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      setIsSubmitting(true);
      await logoutUser();
      setUser(null);
      setSavedMangas([]);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmedNewPassword('');
      setIsPasswordFormOpen(false);
      setNotice(null);
      setError(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  function closePasswordForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmedNewPassword('');
    setIsPasswordFormOpen(false);
    setError(null);
  }

  async function handlePasswordChange() {
    try {
      setIsChangingPassword(true);
      setError(null);
      setNotice(null);

      if (newPassword !== confirmedNewPassword) {
        throw new Error('Las contraseñas nuevas no coinciden');
      }

      const result = await changeOnlineProfilePassword(currentPassword, newPassword);
      setUser(result.user);
      setSavedMangas(result.mangas);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmedNewPassword('');
      setIsPasswordFormOpen(false);
      setNotice('Contrasena actualizada correctamente.');
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : 'No se pudo cambiar la contraseña',
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  function openManga(manga: SavedManga) {
    if (manga.libraryType === 'scraper' && manga.providerId && manga.scraperMangaId) {
      router.push({
        pathname: '/scrapers',
        params: {
          providerId: manga.providerId,
          mangaId: manga.scraperMangaId,
          title: manga.title,
          q: manga.title,
        },
      });
      return;
    }

    router.push({
      pathname: '/manga',
      params: {
        mangaId: manga.id,
        language: manga.language,
        source: manga.source ?? 'mangadex',
        returnTo: '/library',
      },
    });
  }

  async function removeManga(mangaId: string) {
    if (!user) {
      return;
    }

    try {
      setRemovingMangaId(mangaId);
      setError(null);
      setSavedMangas(await removeSavedManga(user.id, mangaId));
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'No se pudo quitar el manga de la biblioteca',
      );
    } finally {
      setRemovingMangaId(null);
    }
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        isMobileLayout && styles.compactContent,
        {
          paddingTop: contentInset.top,
          paddingBottom: contentInset.bottom,
          paddingLeft: Spacing.three + contentInset.left,
          paddingRight: Spacing.three + contentInset.right,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      <Head>
        <title>Mi biblioteca | MyMangaOnline</title>
        <meta
          name="description"
          content="Organiza mangas en un perfil sincronizado y abre tu biblioteca desde otros navegadores."
        />
      </Head>
      <View style={[styles.header, isMobileLayout && styles.compactHeader]}>
        <View style={styles.eyebrowRow}>
          <View style={styles.liveDot} />
          <ThemedText type="code" style={styles.eyebrowText}>
            GUARDA · SIGUE · CONTINÚA
          </ThemedText>
        </View>
        <ThemedText
          accessibilityRole="header"
          aria-level={1}
          type="title"
          style={[styles.title, isMobileLayout && styles.compactTitle]}>
          Mis mangas
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Guarda mangas en tu perfil y recupera la misma biblioteca desde cualquier navegador.
        </ThemedText>
      </View>

      {isRestoringSession ? (
        <ThemedView type="backgroundElement" style={styles.loadingPanel}>
          <ActivityIndicator color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Recuperando tu perfil y biblioteca...
          </ThemedText>
        </ThemedView>
      ) : !user ? (
        <ThemedView type="backgroundElement" style={styles.loginPanel}>
          <View style={styles.loginHeader}>
            <ThemedText type="code" style={styles.panelEyebrow}>
              PERFIL EN LÍNEA
            </ThemedText>
            <ThemedText type="subtitle" style={styles.panelTitle}>
              {authMode === 'create'
                ? 'Crear perfil'
                : authMode === 'change'
                  ? 'Cambiar contraseña'
                  : 'Abrir perfil'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {authMode === 'change'
                ? 'Verifica tu contraseña actual y elige una nueva para conservar tu perfil.'
                : 'Usa el mismo correo y contraseña para recuperar tus mangas en otro navegador.'}
            </ThemedText>
          </View>

          {!isSupabaseConfigured && (
            <View style={styles.formError}>
              <ThemedText type="smallBold">Configuración pendiente</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Agrega la URL y la clave pública de Supabase antes de crear perfiles.
              </ThemedText>
            </View>
          )}

          <View style={styles.authModeRow}>
            <Pressable
              onPress={() => setAuthMode('open')}
              style={[
                styles.authModeButton,
                authMode === 'open' && styles.authModeButtonActive,
              ]}>
              <ThemedText type="smallBold" style={authMode === 'open' && styles.primaryButtonText}>
                Abrir perfil
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setAuthMode('create')}
              style={[
                styles.authModeButton,
                authMode === 'create' && styles.authModeButtonActive,
              ]}>
              <ThemedText type="smallBold" style={authMode === 'create' && styles.primaryButtonText}>
                Crear perfil
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setAuthMode('change')}
              style={[
                styles.authModeButton,
                authMode === 'change' && styles.authModeButtonActive,
              ]}>
              <ThemedText
                type="smallBold"
                style={authMode === 'change' && styles.primaryButtonText}>
                Cambiar contraseña
              </ThemedText>
            </Pressable>
          </View>

          {authMode === 'create' && (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nombre"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="words"
              autoCorrect={false}
              style={[styles.input, { color: theme.text }]}
            />
          )}

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Correo"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={[styles.input, { color: theme.text }]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={
              authMode === 'change'
                ? 'Contraseña actual'
                : 'Contraseña (mínimo 8 caracteres)'
            }
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType={authMode === 'create' ? 'newPassword' : 'password'}
            style={[styles.input, { color: theme.text }]}
          />
          {authMode === 'change' && (
            <>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Nueva contraseña (mínimo 8 caracteres)"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="newPassword"
                style={[styles.input, { color: theme.text }]}
              />
              <TextInput
                value={confirmedNewPassword}
                onChangeText={setConfirmedNewPassword}
                placeholder="Repetir nueva contraseña"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="newPassword"
                style={[styles.input, { color: theme.text }]}
              />
            </>
          )}
          {error && (
            <View style={styles.formError}>
              <ThemedText type="small" themeColor="textSecondary">
                {error}
              </ThemedText>
            </View>
          )}
          {notice && (
            <View style={styles.formNotice}>
              <ThemedText type="small" themeColor="textSecondary">
                {notice}
              </ThemedText>
            </View>
          )}

          <Pressable
            disabled={isSubmitting || !isSupabaseConfigured}
            onPress={() => void handleProfileSubmit()}
            style={({ pressed }) => [
              styles.primaryButton,
              (isSubmitting || !isSupabaseConfigured) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                {authMode === 'create'
                  ? 'Crear perfil'
                  : authMode === 'change'
                    ? 'Guardar contraseña'
                    : 'Iniciar sesión'}
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>
      ) : (
        <>
          <ThemedView type="backgroundElement" style={styles.userPanel}>
            <View style={styles.userSummary}>
              {user.pictureUrl && (
                <Image source={{ uri: user.pictureUrl }} style={styles.userAvatar} contentFit="cover" />
              )}
              <View style={styles.userInfo}>
                <ThemedText type="code" style={styles.panelEyebrow}>
                  PERFIL SINCRONIZADO
                </ThemedText>
                <ThemedText type="smallBold">Usuario: {user.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {user.email} · Disponible en otros navegadores
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {savedMangas.length} mangas guardados
                </ThemedText>
                {isLoadingProgress && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Actualizando capitulos...
                  </ThemedText>
                )}
              </View>
            </View>
            <View style={styles.profileActions}>
              <Pressable
                disabled={isSubmitting || isChangingPassword}
                onPress={() => {
                  setIsPasswordFormOpen((isOpen) => !isOpen);
                  setError(null);
                  setNotice(null);
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  (isSubmitting || isChangingPassword) && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {isPasswordFormOpen ? 'Ocultar cambio' : 'Cambiar contraseña'}
                </ThemedText>
              </Pressable>
              <Pressable
                disabled={isSubmitting || isChangingPassword}
                onPress={() => void handleLogout()}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  (isSubmitting || isChangingPassword) && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Cerrar sesión
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          {isPasswordFormOpen && (
            <ThemedView type="backgroundElement" style={styles.passwordPanel}>
              <View style={styles.passwordHeader}>
                <ThemedText type="code" style={styles.panelEyebrow}>
                  SEGURIDAD DEL PERFIL
                </ThemedText>
                <ThemedText type="subtitle" style={styles.panelTitle}>
                  Cambiar contraseña
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Confirma tu contraseña actual y usa una nueva de al menos 8 caracteres.
                </ThemedText>
              </View>

              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Contraseña actual"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="password"
                style={[styles.input, { color: theme.text }]}
              />
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Nueva contraseña (mínimo 8 caracteres)"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="newPassword"
                style={[styles.input, { color: theme.text }]}
              />
              <TextInput
                value={confirmedNewPassword}
                onChangeText={setConfirmedNewPassword}
                placeholder="Repetir nueva contraseña"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="newPassword"
                style={[styles.input, { color: theme.text }]}
              />

              <View style={styles.passwordActions}>
                <Pressable
                  disabled={isChangingPassword}
                  onPress={closePasswordForm}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    isChangingPassword && styles.disabled,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Cancelar
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={isChangingPassword}
                  onPress={() => void handlePasswordChange()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.passwordSaveButton,
                    isChangingPassword && styles.disabled,
                    pressed && styles.pressed,
                  ]}>
                  {isChangingPassword ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.primaryButtonText}>
                      Guardar contraseña
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ThemedView>
          )}

          {notice && (
            <View style={styles.formNotice}>
              <ThemedText type="small" themeColor="textSecondary">
                {notice}
              </ThemedText>
            </View>
          )}

          {error && (
            <View style={styles.formError}>
              <ThemedText type="small" themeColor="textSecondary">
                {error}
              </ThemedText>
            </View>
          )}

          {savedMangas.length > 0 ? (
            <>
              <View style={styles.collectionHeading}>
                <ThemedText type="code" style={styles.sectionEyebrow}>
                  TU COLECCIÓN
                </ThemedText>
                <View style={styles.collectionTitleRow}>
                  <ThemedText type="subtitle" style={styles.collectionTitle}>
                    Guardados
                  </ThemedText>
                  <ThemedText type="code" themeColor="textSecondary">
                    {savedMangas.length} MANGAS
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.libraryGrid, isMobileLayout && styles.compactLibraryGrid]}>
                {displayedSavedMangas.map((manga) => {
                  const progress = progressByMangaId[manga.id];

                  return (
                    <ThemedView
                      key={manga.id}
                      type="backgroundElement"
                      style={[styles.mangaCard, isMobileLayout && styles.compactMangaCard]}>
                    <Pressable
                      accessibilityLabel={`Abrir ${manga.title || 'manga'}`}
                      accessibilityRole="button"
                      onPress={() => openManga(manga)}
                      style={({ pressed }) => pressed && styles.pressed}>
                      <Image
                        source={{ uri: manga.coverUrl }}
                        style={[styles.cover, isMobileLayout && styles.compactCover]}
                        contentFit="cover"
                      />
                    </Pressable>
                    <View style={[styles.mangaInfo, isMobileLayout && styles.compactMangaInfo]}>
                      <Pressable onPress={() => openManga(manga)} style={({ pressed }) => pressed && styles.pressed}>
                        <ThemedText
                          type="smallBold"
                          numberOfLines={2}
                          style={isMobileLayout && styles.compactMangaTitle}>
                          {manga.title || 'Sin titulo'}
                          {!isMobileLayout && ` - ${getSavedMangaSourceLabel(manga)}`}
                        </ThemedText>
                      </Pressable>
                      {isMobileLayout ? (
                        <ThemedText
                          type="code"
                          themeColor="textSecondary"
                          numberOfLines={1}
                          style={styles.compactSourceText}>
                          {getSavedMangaSourceLabel(manga).toUpperCase()}
                        </ThemedText>
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                          {manga.description || 'Sin descripcion disponible.'}
                        </ThemedText>
                      )}

                      <View style={[styles.progressPanel, isMobileLayout && styles.compactProgressPanel]}>
                        {progress ? (
                          <>
                            <View style={styles.progressRow}>
                              <ThemedText
                                type="code"
                                themeColor="textSecondary"
                                style={isMobileLayout && styles.compactProgressLabel}>
                                {isMobileLayout ? 'CAPS' : 'CAPITULOS'}
                              </ThemedText>
                              <ThemedText type="smallBold" style={isMobileLayout && styles.compactProgressValue}>
                                {progress.error ? '--' : progress.chapterCount}
                              </ThemedText>
                            </View>
                            <View style={styles.progressRow}>
                              <ThemedText
                                type="code"
                                themeColor="textSecondary"
                                style={isMobileLayout && styles.compactProgressLabel}>
                                {isMobileLayout ? 'VISTO' : 'ULTIMO VISTO'}
                              </ThemedText>
                              <ThemedText
                                type="smallBold"
                                numberOfLines={1}
                                style={isMobileLayout && styles.compactProgressValue}>
                                {isMobileLayout
                                  ? progress.lastViewedChapter?.chapter ?? '--'
                                  : getChapterLabel(progress.lastViewedChapter)}
                              </ThemedText>
                            </View>
                            <View style={styles.progressRow}>
                              <ThemedText
                                type="code"
                                themeColor="textSecondary"
                                style={isMobileLayout && styles.compactProgressLabel}>
                                {isMobileLayout ? 'ULTIMO' : 'DISPONIBLE'}
                              </ThemedText>
                              <ThemedText
                                type="smallBold"
                                numberOfLines={1}
                                style={isMobileLayout && styles.compactProgressValue}>
                                {isMobileLayout
                                  ? progress.latestChapter?.chapter ?? '--'
                                  : getChapterLabel(progress.latestChapter)}
                              </ThemedText>
                            </View>
                            {progress.hasNewChapter && (
                              <View style={[styles.newChapterPill, isMobileLayout && styles.compactNewChapterPill]}>
                                <ThemedText
                                  type="code"
                                  style={[styles.newChapterText, isMobileLayout && styles.compactNewChapterText]}>
                                  {isMobileLayout ? 'NUEVO' : 'NUEVO CAPITULO'}
                                </ThemedText>
                              </View>
                            )}
                            {progress.error && (
                              <ThemedText
                                type="small"
                                themeColor="textSecondary"
                                numberOfLines={2}
                                style={isMobileLayout && styles.compactProgressError}>
                                {isMobileLayout ? 'Error al cargar' : progress.error}
                              </ThemedText>
                            )}
                          </>
                        ) : (
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            style={isMobileLayout && styles.compactLoadingText}>
                            Cargando capitulos...
                          </ThemedText>
                        )}
                      </View>

                      <View style={[styles.cardFooter, isMobileLayout && styles.compactCardFooter]}>
                        <View style={[styles.pill, isMobileLayout && styles.compactPill]}>
                          <ThemedText
                            type="code"
                            themeColor="textSecondary"
                            style={isMobileLayout && styles.compactPillText}>
                            {(manga.scraperLanguage ?? manga.language).toUpperCase()}
                          </ThemedText>
                        </View>
                        <Pressable
                          accessibilityLabel={`Quitar ${manga.title || 'manga'}`}
                          accessibilityRole="button"
                          disabled={removingMangaId === manga.id}
                          onPress={() => void removeManga(manga.id)}
                          style={({ pressed }) => [
                            removingMangaId === manga.id && styles.disabled,
                            pressed && styles.pressed,
                          ]}>
                          <ThemedText type="linkPrimary" style={isMobileLayout && styles.compactRemoveLink}>
                            {removingMangaId === manga.id ? 'Quitando...' : 'Quitar'}
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                    </ThemedView>
                  );
                })}
              </View>
            </>
          ) : (
            <ThemedView type="backgroundElement" style={styles.emptyPanel}>
              <ThemedText type="smallBold">Todavia no guardaste mangas</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Busca mangas en Explorar o Scrapers y presiona Guardar para agregarlos aqui.
              </ThemedText>
              <Pressable onPress={() => router.push('/reader')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  Explorar mangas
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.five,
  },
  compactContent: {
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  compactHeader: {
    paddingTop: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2364d2',
  },
  eyebrowText: {
    color: '#2364d2',
    letterSpacing: 0.8,
  },
  title: {
    maxWidth: 680,
    fontSize: 48,
    lineHeight: 52,
  },
  compactTitle: {
    fontSize: 34,
    lineHeight: 38,
  },
  subtitle: {
    maxWidth: 650,
  },
  loginPanel: {
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.22)',
  },
  loginHeader: {
    gap: Spacing.one,
  },
  panelEyebrow: {
    color: '#2364d2',
    letterSpacing: 0.6,
  },
  panelTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.18)',
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
    fontSize: 16,
  },
  authModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    padding: Spacing.one,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  authModeButton: {
    flex: 1,
    minWidth: 128,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  authModeButtonActive: {
    backgroundColor: '#2364d2',
  },
  formError: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderLeftWidth: 4,
    borderLeftColor: '#b72d3b',
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
  },
  formNotice: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderLeftWidth: 4,
    borderLeftColor: '#2364d2',
    backgroundColor: 'rgba(35, 100, 210, 0.08)',
  },
  loadingPanel: {
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.22)',
  },
  primaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  userPanel: {
    minHeight: 72,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.22)',
  },
  profileActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  passwordPanel: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.22)',
  },
  passwordHeader: {
    gap: Spacing.one,
  },
  passwordActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  passwordSaveButton: {
    minWidth: 172,
  },
  userInfo: {
    gap: Spacing.one,
  },
  userSummary: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  collectionHeading: {
    gap: Spacing.half,
  },
  sectionEyebrow: {
    color: '#2364d2',
    letterSpacing: 0.6,
  },
  collectionTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  collectionTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  libraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  compactLibraryGrid: {
    gap: Spacing.one,
  },
  mangaCard: {
    flexGrow: 1,
    flexBasis: 240,
    maxWidth: 256,
    gap: Spacing.two,
    padding: Spacing.two,
    overflow: 'hidden',
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.24)',
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
  },
  compactMangaCard: {
    flexBasis: '29%',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '32%',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: 6,
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  compactCover: {
    borderRadius: Spacing.half,
  },
  mangaInfo: {
    flex: 1,
    minHeight: 224,
    gap: Spacing.one,
  },
  compactMangaInfo: {
    minHeight: 124,
    gap: Spacing.half,
  },
  compactMangaTitle: {
    fontSize: 11,
    lineHeight: 13,
  },
  compactSourceText: {
    fontSize: 8,
    lineHeight: 10,
  },
  progressPanel: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.12)',
  },
  compactProgressPanel: {
    gap: Spacing.half,
    padding: Spacing.one,
    borderRadius: Spacing.one,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  compactProgressLabel: {
    fontSize: 8,
    lineHeight: 11,
  },
  compactProgressValue: {
    maxWidth: '52%',
    fontSize: 9,
    lineHeight: 11,
  },
  compactProgressError: {
    fontSize: 8,
    lineHeight: 10,
  },
  newChapterPill: {
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: '#147d55',
  },
  newChapterText: {
    color: '#ffffff',
  },
  compactNewChapterPill: {
    minHeight: 18,
    paddingHorizontal: Spacing.one,
  },
  compactNewChapterText: {
    fontSize: 8,
    lineHeight: 10,
  },
  compactLoadingText: {
    fontSize: 9,
    lineHeight: 12,
  },
  cardFooter: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  compactCardFooter: {
    gap: Spacing.half,
  },
  pill: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  compactPill: {
    minHeight: 18,
    paddingHorizontal: Spacing.one,
  },
  compactPillText: {
    fontSize: 8,
    lineHeight: 10,
  },
  compactRemoveLink: {
    fontSize: 10,
    lineHeight: 14,
  },
  emptyPanel: {
    gap: Spacing.three,
    alignItems: 'flex-start',
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.22)',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
});

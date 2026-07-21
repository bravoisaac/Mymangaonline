import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useTheme } from '@/hooks/use-theme';
import type { MangaChapter } from '@/services/mangadex';
import {
  getMangaChaptersFromApi,
  getScraperChaptersFromApi,
  getSourceLabel,
  type ScraperChapter,
} from '@/services/mymangaonline-api';
import {
  createEmailAccount,
  getCurrentUser,
  getSavedMangas,
  getViewedChapterHistory,
  loginWithEmail,
  logoutUser,
  removeSavedManga,
  type LocalUser,
  type SavedManga,
} from '@/services/user-library';

type AuthMode = 'login' | 'create';
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
  const { width: viewportWidth } = useWindowDimensions();
  const { contentInset } = useResponsiveLayout();
  const isMobileLayout = viewportWidth < MOBILE_LAYOUT_BREAKPOINT;
  const router = useRouter();
  const [user, setUser] = useState<LocalUser | null>(() => getCurrentUser());
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [savedMangas, setSavedMangas] = useState<SavedManga[]>(() => (user ? getSavedMangas(user.id) : []));
  const [progressByMangaId, setProgressByMangaId] = useState<Record<string, MangaProgress>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);

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

  async function handleEmailSubmit() {
    try {
      setIsSubmitting(true);
      const nextUser =
        authMode === 'create'
          ? await createEmailAccount(name, email, password)
          : await loginWithEmail(email, password);

      setUser(nextUser);
      setSavedMangas(getSavedMangas(nextUser.id));
      setError(null);
      setPassword('');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'No se pudo iniciar sesion');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    logoutUser();
    setUser(null);
    setSavedMangas([]);
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
        title: manga.title,
        description: manga.description ?? '',
        coverUrl: manga.coverUrl ?? '',
      },
    });
  }

  function removeManga(mangaId: string) {
    if (!user) {
      return;
    }

    setSavedMangas(removeSavedManga(user.id, mangaId));
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
      <View style={[styles.header, isMobileLayout && styles.compactHeader]}>
        <ThemedText type="title" style={[styles.title, isMobileLayout && styles.compactTitle]}>
          Mis mangas
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          Guarda mangas en tu biblioteca local y vuelve a abrirlos desde aqui.
        </ThemedText>
      </View>

      {!user ? (
        <ThemedView type="backgroundElement" style={styles.loginPanel}>
          <View style={styles.loginHeader}>
            <ThemedText type="subtitle" style={styles.panelTitle}>
              {authMode === 'create' ? 'Crear cuenta' : 'Entrar'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Tu sesion queda guardada en este navegador.
            </ThemedText>
          </View>

          <View style={styles.authModeRow}>
            <Pressable
              onPress={() => setAuthMode('login')}
              style={[
                styles.authModeButton,
                authMode === 'login' && styles.authModeButtonActive,
              ]}>
              <ThemedText type="smallBold" style={authMode === 'login' && styles.primaryButtonText}>
                Entrar
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setAuthMode('create')}
              style={[
                styles.authModeButton,
                authMode === 'create' && styles.authModeButtonActive,
              ]}>
              <ThemedText type="smallBold" style={authMode === 'create' && styles.primaryButtonText}>
                Crear cuenta
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
            placeholder="Contrasena"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType={authMode === 'create' ? 'newPassword' : 'password'}
            onSubmitEditing={() => void handleEmailSubmit()}
            style={[styles.input, { color: theme.text }]}
          />

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Pressable
            disabled={isSubmitting}
            onPress={() => void handleEmailSubmit()}
            style={({ pressed }) => [
              styles.primaryButton,
              isSubmitting && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                {authMode === 'create' ? 'Crear cuenta' : 'Entrar con correo'}
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
                <ThemedText type="smallBold">Usuario: {user.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {user.email} - Correo
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
            <Pressable onPress={handleLogout} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Cerrar sesion
              </ThemedText>
            </Pressable>
          </ThemedView>

          {savedMangas.length > 0 ? (
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
                          onPress={() => removeManga(manga.id)}
                          style={({ pressed }) => pressed && styles.pressed}>
                          <ThemedText type="linkPrimary" style={isMobileLayout && styles.compactRemoveLink}>
                            Quitar
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  </ThemedView>
                );
              })}
            </View>
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
    gap: Spacing.three,
  },
  compactContent: {
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  compactHeader: {
    paddingTop: 0,
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
  },
  compactTitle: {
    fontSize: 30,
    lineHeight: 34,
  },
  loginPanel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  loginHeader: {
    gap: Spacing.one,
  },
  panelTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
    fontSize: 16,
  },
  authModeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.one,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  authModeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  authModeButtonActive: {
    backgroundColor: '#2364d2',
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
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
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
    borderRadius: Spacing.two,
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
    gap: Spacing.two,
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
});

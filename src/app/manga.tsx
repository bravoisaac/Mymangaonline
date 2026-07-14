import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  MANGA_LANGUAGES,
  type MangaChapter,
  type MangaLanguage,
  type MangaSearchResult,
} from '@/services/mangadex';
import {
  getMangaChaptersFromApi,
  getMangaDetailsFromApi,
  getSourceLabel,
  type MangaSourceId,
} from '@/services/mymangaonline-api';
import {
  getCurrentUser,
  getViewedChapterIds,
  isMangaSaved,
  markChapterViewed,
  removeSavedManga,
  saveManga,
} from '@/services/user-library';

type ChapterOrder = 'asc' | 'desc';
const CHAPTER_BATCH_SIZE = 10;

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getInitialLanguage(value: string | string[] | undefined): MangaLanguage {
  const language = getParam(value);

  return MANGA_LANGUAGES.some((item) => item.code === language) ? (language as MangaLanguage) : 'es';
}

function getInitialSource(value: string | string[] | undefined): MangaSourceId {
  return getParam(value) ?? 'mangadex';
}

function formatChapterDate(value: string | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function MangaScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const router = useRouter();
  const mangaId = getParam(params.mangaId);
  const language = getInitialLanguage(params.language);
  const source = getInitialSource(params.source);
  const sourceLabel = getSourceLabel(source);
  const fallbackManga = useMemo<MangaSearchResult | null>(() => {
    const title = getParam(params.title);

    if (!mangaId || !title) {
      return null;
    }

    const parsedYear = Number(getParam(params.year));

    return {
      id: mangaId,
      source,
      sourceName: sourceLabel,
      title,
      description: getParam(params.description) ?? '',
      coverUrl: getParam(params.coverUrl) || undefined,
      status: getParam(params.status) || undefined,
      year: Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : undefined,
    };
  }, [mangaId, params.coverUrl, params.description, params.status, params.title, params.year, source, sourceLabel]);
  const [manga, setManga] = useState<MangaSearchResult | null>(null);
  const [chapters, setChapters] = useState<MangaChapter[]>([]);
  const [chapterTotal, setChapterTotal] = useState(0);
  const [chapterOrder, setChapterOrder] = useState<ChapterOrder>('desc');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, refreshSavedState] = useState(0);
  const [, refreshViewedState] = useState(0);
  const currentError = mangaId ? error : 'No se encontro el manga solicitado';
  const currentUser = getCurrentUser();
  const isSaved = Boolean(currentUser && mangaId && isMangaSaved(currentUser.id, mangaId));
  const viewedChapterIds = mangaId ? new Set(getViewedChapterIds(mangaId, language)) : new Set<string>();

  const displayedChapters = chapters;
  const firstChapter = chapters[0];
  const chapterLanguageLabel = firstChapter?.language?.toUpperCase() ?? language.toUpperCase();

  const contentInset = useMemo(
    () => ({
      top: Platform.select({ web: 92, default: safeAreaInsets.top + Spacing.three }),
      bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.five,
      left: safeAreaInsets.left,
      right: safeAreaInsets.right,
    }),
    [safeAreaInsets],
  );

  useEffect(() => {
    if (!mangaId) {
      return;
    }

    const nextMangaId = mangaId;

    async function loadManga() {
      try {
        setIsLoading(true);
        setError(null);
        const [mangaResult, chapterResult] = await Promise.allSettled([
          getMangaDetailsFromApi(source, nextMangaId, language),
          getMangaChaptersFromApi(source, nextMangaId, language, 0, CHAPTER_BATCH_SIZE, chapterOrder),
        ]);
        if (chapterResult.status === 'rejected') {
          throw chapterResult.reason;
        }

        const nextManga = mangaResult.status === 'fulfilled' ? mangaResult.value : fallbackManga;

        if (!nextManga) {
          throw mangaResult.status === 'rejected' ? mangaResult.reason : new Error('No se pudo cargar el manga');
        }

        const chapterFeed = chapterResult.value;
        setManga(nextManga);
        setChapters(chapterFeed.chapters);
        setChapterTotal(Math.max(chapterFeed.total, nextManga.chapterCount ?? 0, chapterFeed.chapters.length));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el manga');
      } finally {
        setIsLoading(false);
      }
    }

    void loadManga();
  }, [chapterOrder, fallbackManga, mangaId, language, source]);

  async function loadMoreChapters() {
    if (!mangaId || isLoadingMore || chapters.length >= chapterTotal) {
      return;
    }

    try {
      setIsLoadingMore(true);
      setError(null);
      const chapterFeed = await getMangaChaptersFromApi(
        source,
        mangaId,
        language,
        chapters.length,
        CHAPTER_BATCH_SIZE,
        chapterOrder,
      );
      setChapters((current) => {
        const chaptersById = new Map(current.map((chapter) => [chapter.id, chapter]));
        chapterFeed.chapters.forEach((chapter) => chaptersById.set(chapter.id, chapter));
        return Array.from(chaptersById.values());
      });
      setChapterTotal((current) => Math.max(current, chapterFeed.total));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar mas capitulos');
    } finally {
      setIsLoadingMore(false);
    }
  }

  function openChapter(chapter: MangaChapter | undefined) {
    if (!mangaId || !chapter) {
      return;
    }

    markChapterViewed(mangaId, chapter.id, language);
    refreshViewedState((current) => current + 1);

    const chapterIndex = Math.max(0, chapters.findIndex((item) => item.id === chapter.id));

    router.push({
      pathname: '/chapter',
      params: {
        mangaId,
        chapterId: chapter.id,
        language,
        source,
        chapterOffset: String(Math.floor(chapterIndex / CHAPTER_BATCH_SIZE) * CHAPTER_BATCH_SIZE),
        chapterOrder,
        title: manga?.title ?? '',
        description: manga?.description ?? '',
        coverUrl: manga?.coverUrl ?? '',
        status: manga?.status ?? '',
        year: manga?.year ? String(manga.year) : '',
      },
    });
  }

  function toggleSavedManga() {
    if (!manga || !mangaId) {
      return;
    }

    if (!currentUser) {
      router.push('/library');
      return;
    }

    if (isSaved) {
      removeSavedManga(currentUser.id, mangaId);
      refreshSavedState((current) => current + 1);
      return;
    }

    saveManga(currentUser.id, manga, language);
    refreshSavedState((current) => current + 1);
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: contentInset.top,
          paddingBottom: contentInset.bottom,
          paddingLeft: Spacing.three + contentInset.left,
          paddingRight: Spacing.three + contentInset.right,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <ThemedText type="linkPrimary">{'< Volver a busqueda'}</ThemedText>
        </Pressable>
      </View>

      {currentError && (
        <ThemedView type="backgroundElement" style={styles.errorPanel}>
          <ThemedText type="smallBold">Error</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {currentError}
          </ThemedText>
        </ThemedView>
      )}

      {isLoading ? (
        <LoadingRow label="Cargando lobby del manga..." />
      ) : manga ? (
        <>
          <ThemedView type="backgroundElement" style={styles.mangaDetail}>
            <Image source={{ uri: manga.coverUrl }} style={styles.detailCover} contentFit="cover" />
            <View style={styles.detailInfo}>
              <ThemedText type="title" style={styles.detailTitle}>
                {manga.title} - {sourceLabel}
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary" numberOfLines={5}>
                {manga.description || 'Sin descripcion disponible.'}
              </ThemedText>
              <View style={styles.detailMeta}>
                {manga.status && <Pill text={manga.status} />}
                {manga.year && <Pill text={String(manga.year)} />}
                {manga.contentRating && <Pill text={manga.contentRating} />}
                <Pill text={sourceLabel} />
                <Pill text={chapterLanguageLabel} />
              </View>
              {manga.genres && manga.genres.length > 0 && (
                <View style={styles.genreSection}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Géneros
                  </ThemedText>
                  <View style={styles.genreList}>
                    {manga.genres.map((genre) => (
                      <Pill key={genre} text={genre} variant="genre" />
                    ))}
                  </View>
                </View>
              )}
              <View style={styles.detailActions}>
                <Pressable
                  disabled={!firstChapter}
                  onPress={() => openChapter(firstChapter)}
                  style={({ pressed }) => [
                    styles.startButton,
                    !firstChapter && styles.disabled,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" style={styles.primaryButtonText}>
                    Empezar a leer
                  </ThemedText>
                </Pressable>
                <ThemedView type="backgroundElement" style={styles.counterButton}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Capitulos {chapterTotal}
                  </ThemedText>
                </ThemedView>
                <Pressable
                  onPress={toggleSavedManga}
                  style={({ pressed }) => [
                    styles.saveButton,
                    isSaved && styles.saveButtonActive,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" style={isSaved ? styles.primaryButtonText : undefined}>
                    {isSaved ? 'Guardado' : 'Guardar'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </ThemedView>

          <View style={styles.chapterArea}>
            <View style={styles.chapterHeader}>
              <View>
                <ThemedText type="subtitle">Capitulos {chapterTotal}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Elige un capitulo para abrir el lector.
                </ThemedText>
              </View>
              <Pressable
                onPress={() => setChapterOrder((current) => (current === 'desc' ? 'asc' : 'desc'))}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <ThemedText type="subtitle" style={styles.primaryButtonText}>
                  {chapterOrder === 'desc' ? 'v' : '^'}
                </ThemedText>
              </Pressable>
            </View>

            {chapters.length > 0 ? (
              <View style={styles.chapterList}>
                {displayedChapters.map((chapter) => {
                  const isViewed = viewedChapterIds.has(chapter.id);

                  return (
                    <Pressable
                      key={chapter.id}
                      onPress={() => openChapter(chapter)}
                      style={({ pressed }) => [
                        styles.chapterRow,
                        isViewed && styles.chapterRowViewed,
                        pressed && styles.pressed,
                      ]}>
                      <View style={styles.chapterInfo}>
                        <ThemedText
                          type="smallBold"
                          themeColor={isViewed ? 'textSecondary' : undefined}
                          numberOfLines={1}>
                          Capitulo {chapter.chapter}
                          {chapter.title ? ` - ${chapter.title}` : ''}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {chapter.pages} paginas
                          {chapter.groupName ? ` - ${chapter.groupName}` : ''}
                          {chapter.language ? ` - ${chapter.language.toUpperCase()}` : ''}
                        </ThemedText>
                      </View>
                      <View style={styles.chapterMetaRight}>
                        {isViewed && (
                          <View style={styles.viewedPill}>
                            <ThemedText type="code" style={styles.viewedPillText}>
                              VISTO
                            </ThemedText>
                          </View>
                        )}
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatChapterDate(chapter.readableAt)}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
                {chapters.length < chapterTotal && (
                  <Pressable
                    disabled={isLoadingMore}
                    onPress={() => void loadMoreChapters()}
                    style={({ pressed }) => [
                      styles.loadMoreButton,
                      isLoadingMore && styles.disabled,
                      pressed && styles.pressed,
                    ]}>
                    {isLoadingMore && <ActivityIndicator color="#ffffff" />}
                    <ThemedText type="smallBold" style={styles.primaryButtonText}>
                      {isLoadingMore ? 'Cargando capitulos...' : 'Seguir leyendo'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            ) : (
              <LoadingRow label="No hay capitulos disponibles en este idioma." />
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function LoadingRow({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.loadingRow}>
      <ActivityIndicator color={theme.text} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

function Pill({ text, variant = 'meta' }: { text: string; variant?: 'meta' | 'genre' }) {
  return (
    <View style={[styles.pill, variant === 'genre' && styles.genrePill]}>
      <ThemedText
        type="code"
        themeColor={variant === 'genre' ? undefined : 'textSecondary'}
        style={variant === 'genre' ? styles.genrePillText : undefined}>
        {text.toUpperCase()}
      </ThemedText>
    </View>
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
  header: {
    paddingTop: Spacing.four,
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  mangaDetail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  detailCover: {
    width: 180,
    height: 270,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  detailInfo: {
    flex: 1,
    minWidth: 260,
    gap: Spacing.three,
    justifyContent: 'center',
  },
  detailTitle: {
    fontSize: 36,
    lineHeight: 42,
  },
  detailMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  genreSection: {
    gap: Spacing.one,
  },
  genreList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  detailActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  startButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
    backgroundColor: '#2364d2',
  },
  counterButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
  },
  saveButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  saveButtonActive: {
    backgroundColor: '#147d55',
  },
  pill: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  genrePill: {
    backgroundColor: 'rgba(35, 100, 210, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(76, 139, 245, 0.42)',
  },
  genrePillText: {
    color: '#8eb7ff',
  },
  chapterArea: {
    gap: Spacing.two,
  },
  chapterHeader: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.one,
    backgroundColor: '#2364d2',
  },
  chapterList: {
    gap: Spacing.two,
  },
  loadMoreButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
    backgroundColor: '#2364d2',
  },
  chapterRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  chapterRowViewed: {
    borderLeftWidth: 4,
    borderLeftColor: '#147d55',
    backgroundColor: 'rgba(20, 125, 85, 0.12)',
  },
  chapterInfo: {
    flex: 1,
    minWidth: 0,
  },
  chapterMetaRight: {
    minWidth: 116,
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  viewedPill: {
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: '#147d55',
  },
  viewedPillText: {
    color: '#ffffff',
  },
  loadingRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  errorPanel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderLeftWidth: 4,
    borderLeftColor: '#b72d3b',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
  },
});

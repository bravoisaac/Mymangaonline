import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
  MANGADEX_API_URL,
  MANGA_LANGUAGES,
  getMangaById,
  getMangaChapters,
  type MangaChapter,
  type MangaLanguage,
  type MangaSearchResult,
} from '@/services/mangadex';
import {
  getCurrentUser,
  getViewedChapterIds,
  isMangaSaved,
  markChapterViewed,
  removeSavedManga,
  saveManga,
} from '@/services/user-library';

type ChapterOrder = 'asc' | 'desc';

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getInitialLanguage(value: string | string[] | undefined): MangaLanguage {
  const language = getParam(value);

  return MANGA_LANGUAGES.some((item) => item.code === language) ? (language as MangaLanguage) : 'es';
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
  const [manga, setManga] = useState<MangaSearchResult | null>(null);
  const [chapters, setChapters] = useState<MangaChapter[]>([]);
  const [chapterOrder, setChapterOrder] = useState<ChapterOrder>('desc');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, refreshSavedState] = useState(0);
  const [, refreshViewedState] = useState(0);
  const currentError = mangaId ? error : 'No se encontro el manga solicitado';
  const currentUser = getCurrentUser();
  const isSaved = Boolean(currentUser && mangaId && isMangaSaved(currentUser.id, mangaId));
  const viewedChapterIds = mangaId ? new Set(getViewedChapterIds(mangaId, language)) : new Set<string>();

  const displayedChapters = useMemo(
    () => (chapterOrder === 'desc' ? [...chapters].reverse() : chapters),
    [chapterOrder, chapters],
  );
  const firstChapter = chapters[0];

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
        const [nextManga, chapterFeed] = await Promise.all([
          getMangaById(nextMangaId, language),
          getMangaChapters(nextMangaId, language),
        ]);
        setManga(nextManga);
        setChapters(chapterFeed.chapters);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el manga');
      } finally {
        setIsLoading(false);
      }
    }

    void loadManga();
  }, [mangaId, language]);

  function openChapter(chapter: MangaChapter | undefined) {
    if (!mangaId || !chapter) {
      return;
    }

    markChapterViewed(mangaId, chapter.id, language);
    refreshViewedState((current) => current + 1);

    router.push({
      pathname: '/chapter',
      params: {
        mangaId,
        chapterId: chapter.id,
        language,
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
          <Pressable onPress={() => Linking.openURL(`${MANGADEX_API_URL}/docs/`)}>
            <ThemedText type="linkPrimary">Abrir documentacion de MangaDex</ThemedText>
          </Pressable>
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
                {manga.title}
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary" numberOfLines={5}>
                {manga.description || 'Sin descripcion disponible.'}
              </ThemedText>
              <View style={styles.detailMeta}>
                {manga.status && <Pill text={manga.status} />}
                {manga.year && <Pill text={String(manga.year)} />}
                {manga.contentRating && <Pill text={manga.contentRating} />}
                <Pill text={language.toUpperCase()} />
              </View>
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
                    Capitulos {chapters.length}
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
                <ThemedText type="subtitle">Capitulos {chapters.length}</ThemedText>
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

function Pill({ text }: { text: string }) {
  return (
    <View style={styles.pill}>
      <ThemedText type="code" themeColor="textSecondary">
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

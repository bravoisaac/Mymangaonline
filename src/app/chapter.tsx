import { Image, type ImageLoadEventData } from 'expo-image';
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
  type ChapterPages,
  type MangaChapter,
  type MangaLanguage,
  type MangaSearchResult,
} from '@/services/mangadex';
import {
  getChapterPagesFromApi,
  getMangaChaptersFromApi,
  getMangaDetailsFromApi,
  getSourceLabel,
  type MangaSourceId,
} from '@/services/mymangaonline-api';
import { markChapterViewed } from '@/services/user-library';

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

function getInitialOffset(value: string | string[] | undefined) {
  const parsedOffset = Number(getParam(value));
  return Number.isFinite(parsedOffset) ? Math.max(0, Math.floor(parsedOffset)) : 0;
}

function getInitialChapterOrder(value: string | string[] | undefined): 'asc' | 'desc' {
  return getParam(value) === 'desc' ? 'desc' : 'asc';
}

export default function ChapterScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const router = useRouter();
  const mangaId = getParam(params.mangaId);
  const chapterId = getParam(params.chapterId);
  const language = getInitialLanguage(params.language);
  const source = getInitialSource(params.source);
  const chapterOffset = getInitialOffset(params.chapterOffset);
  const chapterOrder = getInitialChapterOrder(params.chapterOrder);
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
  const [chapterPages, setChapterPages] = useState<ChapterPages | null>(null);
  const [pageAspectRatios, setPageAspectRatios] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentError = mangaId && chapterId ? error : 'No se encontro el capitulo solicitado';

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === chapterId),
    [chapterId, chapters],
  );
  const selectedChapterIndex = useMemo(
    () => chapters.findIndex((chapter) => chapter.id === chapterId),
    [chapterId, chapters],
  );
  const previousChapter = selectedChapterIndex > 0 ? chapters[selectedChapterIndex - 1] : undefined;
  const nextChapter =
    selectedChapterIndex >= 0 && selectedChapterIndex < chapters.length - 1
      ? chapters[selectedChapterIndex + 1]
      : undefined;
  const hasMoreChapters = chapterOffset + chapters.length < chapterTotal;

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
    if (!mangaId || !chapterId) {
      return;
    }

    const nextMangaId = mangaId;
    const nextChapterId = chapterId;

    async function loadChapter() {
      try {
        setIsLoading(true);
        setError(null);
        const [mangaResult, chapterResult, pagesResult] = await Promise.allSettled([
          fallbackManga
            ? Promise.resolve(fallbackManga)
            : getMangaDetailsFromApi(source, nextMangaId, language),
          getMangaChaptersFromApi(source, nextMangaId, language, chapterOffset, CHAPTER_BATCH_SIZE, chapterOrder),
          getChapterPagesFromApi(source, nextChapterId),
        ]);
        if (chapterResult.status === 'rejected') {
          throw chapterResult.reason;
        }
        if (pagesResult.status === 'rejected') {
          throw pagesResult.reason;
        }

        const nextManga = mangaResult.status === 'fulfilled' ? mangaResult.value : fallbackManga;
        const chapterFeed = chapterResult.value;
        const nextPages = pagesResult.value;

        setManga(nextManga);
        setChapters(chapterFeed.chapters);
        setChapterTotal(Math.max(chapterFeed.total, nextManga?.chapterCount ?? 0));
        setChapterPages(nextPages);
        setPageAspectRatios({});
        markChapterViewed(nextMangaId, nextChapterId, language);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el capitulo');
      } finally {
        setIsLoading(false);
      }
    }

    void loadChapter();
  }, [chapterId, chapterOffset, chapterOrder, fallbackManga, mangaId, language, source]);

  function openMangaLobby() {
    if (!mangaId) {
      router.back();
      return;
    }

    router.push({
      pathname: '/manga',
      params: {
        mangaId,
        language,
        source,
        title: manga?.title ?? fallbackManga?.title ?? '',
        description: manga?.description ?? fallbackManga?.description ?? '',
        coverUrl: manga?.coverUrl ?? fallbackManga?.coverUrl ?? '',
        status: manga?.status ?? fallbackManga?.status ?? '',
        year: manga?.year ? String(manga.year) : fallbackManga?.year ? String(fallbackManga.year) : '',
      },
    });
  }

  function openChapter(chapter: MangaChapter | undefined, offset = chapterOffset) {
    if (!mangaId || !chapter) {
      return;
    }

    router.replace({
      pathname: '/chapter',
      params: {
        mangaId,
        chapterId: chapter.id,
        language,
        source,
        chapterOffset: String(offset),
        chapterOrder,
        title: manga?.title ?? fallbackManga?.title ?? '',
        description: manga?.description ?? fallbackManga?.description ?? '',
        coverUrl: manga?.coverUrl ?? fallbackManga?.coverUrl ?? '',
        status: manga?.status ?? fallbackManga?.status ?? '',
        year: manga?.year ? String(manga.year) : fallbackManga?.year ? String(fallbackManga.year) : '',
      },
    });
  }

  async function openNextChapter() {
    if (nextChapter) {
      openChapter(nextChapter);
      return;
    }

    if (!mangaId || !hasMoreChapters || isLoadingNext) {
      return;
    }

    try {
      setIsLoadingNext(true);
      setError(null);
      const nextOffset = chapterOffset + chapters.length;
      const chapterFeed = await getMangaChaptersFromApi(
        source,
        mangaId,
        language,
        nextOffset,
        CHAPTER_BATCH_SIZE,
        chapterOrder,
      );
      const firstNextChapter = chapterFeed.chapters[0];

      setChapterTotal((current) => Math.max(current, chapterFeed.total));
      if (firstNextChapter) {
        openChapter(firstNextChapter, nextOffset);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el siguiente capitulo');
    } finally {
      setIsLoadingNext(false);
    }
  }

  function handlePageLoad(pageUrl: string, event: ImageLoadEventData) {
    const width = event.source.width;
    const height = event.source.height;

    if (!width || !height) {
      return;
    }

    setPageAspectRatios((currentAspectRatios) => ({
      ...currentAspectRatios,
      [pageUrl]: width / height,
    }));
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
        <ThemedText type="title" style={styles.title}>
          {manga ? `${manga.title} - ${sourceLabel}` : 'Lector'}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          Capitulo {selectedChapter?.chapter ?? '...'}
          {selectedChapter?.title ? ` - ${selectedChapter.title}` : ''}
        </ThemedText>
      </View>

      <ThemedView type="backgroundElement" style={styles.controls}>
        <Pressable
          disabled={!previousChapter || isLoading}
          onPress={() => openChapter(previousChapter)}
          style={({ pressed }) => [
            styles.navButton,
            (!previousChapter || isLoading) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="code" style={styles.primaryButtonText}>
            {'< Cap. anterior'}
          </ThemedText>
        </Pressable>
        <Pressable onPress={openMangaLobby} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <ThemedText type="code" themeColor="textSecondary">
            Capitulos
          </ThemedText>
        </Pressable>
        <Pressable
          disabled={(!nextChapter && !hasMoreChapters) || isLoading || isLoadingNext}
          onPress={() => void openNextChapter()}
          style={({ pressed }) => [
            styles.navButton,
            ((!nextChapter && !hasMoreChapters) || isLoading || isLoadingNext) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="code" style={styles.primaryButtonText}>
            {isLoadingNext ? 'Cargando...' : 'Cap. siguiente >'}
          </ThemedText>
        </Pressable>
      </ThemedView>

      {currentError && (
        <ThemedView type="backgroundElement" style={styles.errorPanel}>
          <ThemedText type="smallBold">Error</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {currentError}
          </ThemedText>
        </ThemedView>
      )}

      {isLoading ? (
        <LoadingRow label="Cargando paginas..." />
      ) : chapterPages ? (
        <View style={styles.reader}>
          {chapterPages.pageUrls.map((pageUrl, index) => (
            <Image
              key={pageUrl}
              source={{ uri: pageUrl }}
              style={[
                styles.readerPage,
                { aspectRatio: pageAspectRatios[pageUrl] ?? 720 / 1040 },
              ]}
              contentFit="cover"
              onLoad={(event) => handlePageLoad(pageUrl, event)}
              transition={180}
              recyclingKey={`${chapterId}-${index}`}
            />
          ))}
        </View>
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
    gap: Spacing.one,
    paddingTop: Spacing.four,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
  },
  controls: {
    minHeight: 72,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  navButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
    backgroundColor: '#2364d2',
  },
  secondaryButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  reader: {
    gap: Spacing.three,
  },
  readerPage: {
    width: '100%',
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.08)',
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

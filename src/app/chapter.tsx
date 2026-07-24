import { Image, type ImageLoadEventData } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
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
  const { contentInset, isCompact } = useResponsiveLayout();
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
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);
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
  const previousChapterIndex = selectedChapterIndex + (chapterOrder === 'desc' ? 1 : -1);
  const nextChapterIndex = selectedChapterIndex + (chapterOrder === 'desc' ? -1 : 1);
  const previousChapter = selectedChapterIndex >= 0 ? chapters[previousChapterIndex] : undefined;
  const nextChapter = selectedChapterIndex >= 0 ? chapters[nextChapterIndex] : undefined;
  const hasEarlierBatch = chapterOffset > 0;
  const hasLaterBatch = chapterOffset + chapters.length < chapterTotal;
  const canLoadPreviousChapter = chapterOrder === 'desc' ? hasLaterBatch : hasEarlierBatch;
  const canLoadNextChapter = chapterOrder === 'desc' ? hasEarlierBatch : hasLaterBatch;
  const isNavigatingChapters = isLoadingPrevious || isLoadingNext;

  useEffect(() => {
    if (!mangaId || !chapterId) {
      return;
    }

    let isActive = true;
    const nextMangaId = mangaId;
    const nextChapterId = chapterId;

    async function loadChapterPages() {
      try {
        setError(null);
        setChapterPages(null);
        setIsLoading(true);
        const nextPages = await getChapterPagesFromApi(source, nextChapterId);

        if (!isActive) {
          return;
        }

        setChapterPages(nextPages);
        markChapterViewed(nextMangaId, nextChapterId, language);
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el capitulo');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    async function loadChapterContext() {
      const [mangaResult, chapterResult] = await Promise.allSettled([
          fallbackManga
            ? Promise.resolve(fallbackManga)
            : getMangaDetailsFromApi(source, nextMangaId, language),
          getMangaChaptersFromApi(source, nextMangaId, language, chapterOffset, CHAPTER_BATCH_SIZE, chapterOrder),
      ]);

      if (!isActive) {
        return;
      }

      const nextManga = mangaResult.status === 'fulfilled' ? mangaResult.value : fallbackManga;
      setManga(nextManga);

      if (chapterResult.status === 'fulfilled') {
        const chapterFeed = chapterResult.value;
        setChapters(chapterFeed.chapters);
        setChapterTotal(Math.max(chapterFeed.total, nextManga?.chapterCount ?? 0));
        return;
      }

      const loadError = chapterResult.reason;
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Las paginas cargaron, pero no se pudo preparar la navegacion entre capitulos',
      );
    }

    void loadChapterPages();
    void loadChapterContext();

    return () => {
      isActive = false;
    };
  }, [chapterId, chapterOffset, chapterOrder, fallbackManga, mangaId, language, source]);

  useEffect(() => {
    if (!chapterPages || !nextChapter) {
      return;
    }

    let isActive = true;

    void getChapterPagesFromApi(source, nextChapter.id)
      .then((pages) => {
        if (!isActive || pages.pageUrls.length === 0) {
          return;
        }

        return Image.prefetch(pages.pageUrls.slice(0, 2), 'memory-disk');
      })
      .catch(() => {
        // Prefetching is opportunistic and must not interrupt the current chapter.
      });

    return () => {
      isActive = false;
    };
  }, [chapterPages, nextChapter, source]);

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

  async function openAdjacentChapter(direction: 'previous' | 'next') {
    const loadedChapter = direction === 'previous' ? previousChapter : nextChapter;

    if (loadedChapter) {
      openChapter(loadedChapter);
      return;
    }

    const loadsEarlierBatch =
      direction === 'previous' ? chapterOrder === 'asc' : chapterOrder === 'desc';
    const canLoadBatch = loadsEarlierBatch ? hasEarlierBatch : hasLaterBatch;

    if (!mangaId || !canLoadBatch || isNavigatingChapters) {
      return;
    }

    const setLoading = direction === 'previous' ? setIsLoadingPrevious : setIsLoadingNext;

    try {
      setLoading(true);
      setError(null);
      const adjacentOffset = loadsEarlierBatch
        ? Math.max(0, chapterOffset - CHAPTER_BATCH_SIZE)
        : chapterOffset + chapters.length;
      const chapterFeed = await getMangaChaptersFromApi(
        source,
        mangaId,
        language,
        adjacentOffset,
        CHAPTER_BATCH_SIZE,
        chapterOrder,
      );
      const adjacentChapter = loadsEarlierBatch
        ? chapterFeed.chapters[chapterFeed.chapters.length - 1]
        : chapterFeed.chapters[0];

      setChapterTotal((current) => Math.max(current, chapterFeed.total));
      if (adjacentChapter) {
        openChapter(adjacentChapter, adjacentOffset);
      }
    } catch (loadError) {
      const fallbackMessage =
        direction === 'previous'
          ? 'No se pudo cargar el capitulo anterior'
          : 'No se pudo cargar el siguiente capitulo';
      setError(loadError instanceof Error ? loadError.message : fallbackMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <FlatList
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
      data={chapterPages?.pageUrls ?? []}
      keyExtractor={(pageUrl, index) => `${chapterId}-${index}-${pageUrl}`}
      renderItem={({ item, index }) => (
        <ChapterPage pageUrl={item} pageIndex={index} chapterId={chapterId} />
      )}
      ItemSeparatorComponent={PageSeparator}
      ListHeaderComponent={
        <View style={styles.readerHeader}>
          <View style={[styles.header, isCompact && styles.compactHeader]}>
            <ThemedText type="title" style={[styles.title, isCompact && styles.compactTitle]}>
              {manga ? `${manga.title} - ${sourceLabel}` : 'Lector'}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              Capitulo {selectedChapter?.chapter ?? '...'}
              {selectedChapter?.title ? ` - ${selectedChapter.title}` : ''}
            </ThemedText>
          </View>

          <ChapterNavigation
            previousDisabled={(!previousChapter && !canLoadPreviousChapter) || isLoading || isNavigatingChapters}
            nextDisabled={(!nextChapter && !canLoadNextChapter) || isLoading || isNavigatingChapters}
            isLoadingPrevious={isLoadingPrevious}
            isLoadingNext={isLoadingNext}
            onPrevious={() => void openAdjacentChapter('previous')}
            onChapters={openMangaLobby}
            onNext={() => void openAdjacentChapter('next')}
          />

          {currentError && (
            <ThemedView type="backgroundElement" style={styles.errorPanel}>
              <ThemedText type="smallBold">Error</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {currentError}
              </ThemedText>
            </ThemedView>
          )}

          {isLoading && <LoadingRow label="Cargando paginas..." />}
        </View>
      }
      ListFooterComponent={
        chapterPages && chapterPages.pageUrls.length > 0 ? (
          <View style={styles.readerFooter}>
            <ChapterNavigation
              previousDisabled={(!previousChapter && !canLoadPreviousChapter) || isLoading || isNavigatingChapters}
              nextDisabled={(!nextChapter && !canLoadNextChapter) || isLoading || isNavigatingChapters}
              isLoadingPrevious={isLoadingPrevious}
              isLoadingNext={isLoadingNext}
              onPrevious={() => void openAdjacentChapter('previous')}
              onChapters={openMangaLobby}
              onNext={() => void openAdjacentChapter('next')}
            />
          </View>
        ) : null
      }
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      updateCellsBatchingPeriod={80}
      windowSize={3}
      showsVerticalScrollIndicator={false}
    />
  );
}

type ChapterPageProps = {
  pageUrl: string;
  pageIndex: number;
  chapterId?: string;
};

const ChapterPage = memo(function ChapterPage({ pageUrl, pageIndex, chapterId }: ChapterPageProps) {
  const [aspectRatio, setAspectRatio] = useState(720 / 1040);

  function handleLoad(event: ImageLoadEventData) {
    const width = event.source.width;
    const height = event.source.height;

    if (width && height) {
      setAspectRatio(width / height);
    }
  }

  return (
    <Image
      source={{ uri: pageUrl }}
      style={[styles.readerPage, { aspectRatio }]}
      accessibilityLabel={`Pagina ${pageIndex + 1}`}
      contentFit="cover"
      cachePolicy="memory-disk"
      loading={pageIndex < 2 ? 'eager' : 'lazy'}
      priority={pageIndex < 2 ? 'high' : 'normal'}
      onLoad={handleLoad}
      transition={180}
      recyclingKey={`${chapterId}-${pageIndex}`}
    />
  );
});

function PageSeparator() {
  return <View style={styles.pageSeparator} />;
}

type ChapterNavigationProps = {
  previousDisabled: boolean;
  nextDisabled: boolean;
  isLoadingPrevious: boolean;
  isLoadingNext: boolean;
  onPrevious: () => void;
  onChapters: () => void;
  onNext: () => void;
};

function ChapterNavigation({
  previousDisabled,
  nextDisabled,
  isLoadingPrevious,
  isLoadingNext,
  onPrevious,
  onChapters,
  onNext,
}: ChapterNavigationProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.controls}>
      <Pressable
        accessibilityLabel="Abrir capítulo anterior"
        disabled={previousDisabled}
        onPress={onPrevious}
        style={({ pressed }) => [
          styles.navButton,
          previousDisabled && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <ThemedText type="code" style={styles.primaryButtonText}>
          {isLoadingPrevious ? 'Cargando...' : '< Cap. anterior'}
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityLabel="Volver a la lista de capítulos"
        onPress={onChapters}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
        <ThemedText type="code" themeColor="textSecondary">
          Capitulos
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityLabel="Abrir capítulo siguiente"
        disabled={nextDisabled}
        onPress={onNext}
        style={({ pressed }) => [
          styles.navButton,
          nextDisabled && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <ThemedText type="code" style={styles.primaryButtonText}>
          {isLoadingNext ? 'Cargando...' : 'Cap. siguiente >'}
        </ThemedText>
      </Pressable>
    </ThemedView>
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
  compactHeader: {
    paddingTop: 0,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
  },
  compactTitle: {
    fontSize: 30,
    lineHeight: 36,
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
  readerHeader: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  readerFooter: {
    marginTop: Spacing.three,
  },
  pageSeparator: {
    height: Spacing.three,
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

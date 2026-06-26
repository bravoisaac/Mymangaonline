import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
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
  getChapterPages,
  getMangaChapters,
  searchManga,
  type ChapterPages,
  type MangaChapter,
  type MangaLanguage,
  type MangaSearchResult,
} from '@/services/mangadex';

const INITIAL_QUERY = 'one piece';

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getInitialLanguage(value: string | string[] | undefined): MangaLanguage {
  const language = getParam(value);

  return MANGA_LANGUAGES.some((item) => item.code === language) ? (language as MangaLanguage) : 'es';
}

export default function ReaderScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const initialQuery = getParam(params.query) ?? INITIAL_QUERY;
  const [query, setQuery] = useState(initialQuery);
  const [language, setLanguage] = useState<MangaLanguage>(getInitialLanguage(params.language));
  const [results, setResults] = useState<MangaSearchResult[]>([]);
  const [selectedManga, setSelectedManga] = useState<MangaSearchResult | null>(null);
  const [chapters, setChapters] = useState<MangaChapter[]>([]);
  const [chapterTotal, setChapterTotal] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState<MangaChapter | null>(null);
  const [chapterPages, setChapterPages] = useState<ChapterPages | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSearch = getParam(params.autoSearch);

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
    if (autoSearch === '1' && initialQuery.trim()) {
      void runSearch(initialQuery, getInitialLanguage(params.language));
    }
  }, [autoSearch, initialQuery, params.language]);

  async function runSearch(nextQuery: string, nextLanguage: MangaLanguage) {
    if (!nextQuery.trim()) {
      return;
    }

    try {
      setQuery(nextQuery);
      setLanguage(nextLanguage);
      setIsSearching(true);
      setError(null);
      setSelectedManga(null);
      setSelectedChapter(null);
      setChapterPages(null);
      setChapters([]);
      setChapterTotal(0);
      const nextResults = await searchManga(nextQuery, nextLanguage);
      setResults(nextResults);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'No se pudo buscar manga');
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSearch() {
    await runSearch(query, language);
  }

  async function handleSelectManga(manga: MangaSearchResult) {
    try {
      setSelectedManga(manga);
      setSelectedChapter(null);
      setChapterPages(null);
      setChapterTotal(0);
      setIsLoadingChapters(true);
      setError(null);
      const chapterFeed = await getMangaChapters(manga.id, language);
      setChapters(chapterFeed.chapters);
      setChapterTotal(chapterFeed.total);
    } catch (chapterError) {
      setError(chapterError instanceof Error ? chapterError.message : 'No se cargaron capitulos');
    } finally {
      setIsLoadingChapters(false);
    }
  }

  async function handleSelectChapter(chapter: MangaChapter) {
    try {
      setSelectedChapter(chapter);
      setIsLoadingPages(true);
      setError(null);
      const nextPages = await getChapterPages(chapter.id);
      setChapterPages(nextPages);
    } catch (pageError) {
      setError(pageError instanceof Error ? pageError.message : 'No se cargaron paginas');
    } finally {
      setIsLoadingPages(false);
    }
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
          Leer manga
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          Busca en MangaDex, selecciona idioma, abre capitulos y lee las paginas dentro de la app.
        </ThemedText>
      </View>

      <ThemedView type="backgroundElement" style={styles.searchPanel}>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar manga"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSearch}
            style={[styles.input, { color: theme.text }]}
          />
          <Pressable
            disabled={isSearching}
            onPress={handleSearch}
            style={({ pressed }) => [
              styles.searchButton,
              isSearching && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {isSearching ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Buscar
              </ThemedText>
            )}
          </Pressable>
        </View>

        <View style={styles.languageRow}>
          {MANGA_LANGUAGES.map((item) => (
            <Pressable
              key={item.code}
              onPress={() => setLanguage(item.code)}
              style={[
                styles.languageChip,
                language === item.code && styles.languageChipSelected,
              ]}>
              <ThemedText
                type="smallBold"
                style={language === item.code && styles.primaryButtonText}>
                {item.label}
              </ThemedText>
              <ThemedText type="code" style={language === item.code && styles.primaryButtonText}>
                {item.code.toUpperCase()}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </ThemedView>

      {error && (
        <ThemedView type="backgroundElement" style={styles.errorPanel}>
          <ThemedText type="smallBold">Error</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
          <Pressable onPress={() => Linking.openURL(`${MANGADEX_API_URL}/docs/`)}>
            <ThemedText type="linkPrimary">Abrir documentacion de MangaDex</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {results.length > 0 && (
        <Section title="Resultados">
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.resultList}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelectManga(item)}
                style={[
                  styles.mangaCard,
                  selectedManga?.id === item.id && styles.mangaCardSelected,
                ]}>
                <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
                <View style={styles.mangaInfo}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                    {item.description || 'Sin descripcion disponible.'}
                  </ThemedText>
                  <View style={styles.mangaMeta}>
                    {item.year && <Pill text={String(item.year)} />}
                    {item.status && <Pill text={item.status} />}
                  </View>
                </View>
              </Pressable>
            )}
          />
        </Section>
      )}

      {selectedManga && (
        <Section title={`Capitulos - ${selectedManga.title}`}>
          {isLoadingChapters ? (
            <LoadingRow label="Cargando capitulos..." />
          ) : chapters.length > 0 ? (
            <>
              <ThemedView type="backgroundElement" style={styles.chapterSummary}>
                <View>
                  <ThemedText type="subtitle" style={styles.chapterTotal}>
                    {chapterTotal}
                  </ThemedText>
                  <ThemedText type="code" themeColor="textSecondary">
                    CAPITULOS DISPONIBLES
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.chapterSummaryText}>
                  Mostrando {chapters.length} capitulos cargados en {language.toUpperCase()}.
                </ThemedText>
              </ThemedView>
              <View style={styles.chapterList}>
                {chapters.map((chapter) => (
                  <Pressable
                    key={chapter.id}
                    onPress={() => handleSelectChapter(chapter)}
                    style={[
                      styles.chapterRow,
                      selectedChapter?.id === chapter.id && styles.chapterRowSelected,
                    ]}>
                    <View style={styles.chapterInfo}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        Capitulo {chapter.chapter}
                        {chapter.title ? ` - ${chapter.title}` : ''}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {chapter.pages} paginas
                        {chapter.groupName ? ` - ${chapter.groupName}` : ''}
                      </ThemedText>
                    </View>
                    <ThemedText type="code" themeColor="textSecondary">
                      Leer
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <EmptyText text="No hay capitulos disponibles en este idioma." />
          )}
        </Section>
      )}

      {selectedChapter && (
        <Section title={`Lector - Capitulo ${selectedChapter.chapter}`}>
          {isLoadingPages ? (
            <LoadingRow label="Cargando paginas..." />
          ) : chapterPages ? (
            <View style={styles.reader}>
              {chapterPages.pageUrls.map((pageUrl, index) => (
                <Image
                  key={pageUrl}
                  source={{ uri: pageUrl }}
                  style={styles.readerPage}
                  contentFit="contain"
                  transition={180}
                  recyclingKey={`${selectedChapter.id}-${index}`}
                />
              ))}
            </View>
          ) : (
            <EmptyText text="Selecciona un capitulo para cargar paginas." />
          )}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
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

function EmptyText({ text }: { text: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.loadingRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
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
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
  },
  searchPanel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
    fontSize: 16,
  },
  searchButton: {
    minWidth: 96,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  languageChip: {
    minWidth: 116,
    minHeight: 52,
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  languageChipSelected: {
    backgroundColor: '#2364d2',
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  resultList: {
    gap: Spacing.two,
  },
  mangaCard: {
    width: 260,
    minHeight: 180,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  mangaCardSelected: {
    borderWidth: 2,
    borderColor: '#2364d2',
  },
  cover: {
    width: 86,
    height: 130,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  mangaInfo: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  mangaMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: 'auto',
  },
  pill: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  chapterSummary: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  chapterTotal: {
    fontSize: 28,
    lineHeight: 34,
  },
  chapterSummaryText: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
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
  chapterRowSelected: {
    borderWidth: 2,
    borderColor: '#2364d2',
  },
  chapterInfo: {
    flex: 1,
    minWidth: 0,
  },
  reader: {
    gap: Spacing.three,
  },
  readerPage: {
    width: '100%',
    aspectRatio: 720 / 1040,
    borderRadius: Spacing.one,
    backgroundColor: '#111111',
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

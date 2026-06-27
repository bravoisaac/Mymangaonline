import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  getMangaLibrary,
  getMangaTags,
  MANGADEX_API_URL,
  MANGA_LANGUAGES,
  searchManga,
  type MangaLanguage,
  type MangaSearchResult,
  type MangaTag,
} from '@/services/mangadex';

const INITIAL_QUERY = 'one piece';
const LIBRARY_PAGE_SIZE = 15;

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
  const router = useRouter();
  const initialQuery = getParam(params.query) ?? INITIAL_QUERY;
  const [query, setQuery] = useState(initialQuery);
  const [language, setLanguage] = useState<MangaLanguage>(getInitialLanguage(params.language));
  const [results, setResults] = useState<MangaSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryMangas, setLibraryMangas] = useState<MangaSearchResult[]>([]);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryPage, setLibraryPage] = useState(0);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [categories, setCategories] = useState<MangaTag[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const autoSearch = getParam(params.autoSearch);
  const libraryPageCount = Math.max(1, Math.ceil(libraryTotal / LIBRARY_PAGE_SIZE));
  const canGoToPreviousLibraryPage = libraryPage > 0 && !isLoadingLibrary;
  const canGoToNextLibraryPage = libraryPage + 1 < libraryPageCount && !isLoadingLibrary;
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  const contentInset = useMemo(
    () => ({
      top: Platform.select({ web: 92, default: safeAreaInsets.top + Spacing.three }),
      bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.five,
      left: safeAreaInsets.left,
      right: safeAreaInsets.right,
    }),
    [safeAreaInsets],
  );

  const runSearch = useCallback(async (nextQuery: string, nextLanguage: MangaLanguage) => {
    if (!nextQuery.trim()) {
      return;
    }

    try {
      setQuery(nextQuery);
      setLanguage(nextLanguage);
      setLibraryPage(0);
      setIsSearching(true);
      setError(null);
      const nextResults = await searchManga(nextQuery, nextLanguage, {
        tagId: selectedCategoryId ?? undefined,
      });
      setResults(nextResults);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'No se pudo buscar manga');
    } finally {
      setIsSearching(false);
    }
  }, [selectedCategoryId]);

  useEffect(() => {
    let isCurrentRequest = true;

    async function runInitialSearch() {
      await Promise.resolve();

      if (isCurrentRequest && autoSearch === '1' && initialQuery.trim()) {
        await runSearch(initialQuery, getInitialLanguage(params.language));
      }
    }

    void runInitialSearch();

    return () => {
      isCurrentRequest = false;
    };
  }, [autoSearch, initialQuery, params.language, runSearch]);

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadCategories() {
      try {
        setIsLoadingCategories(true);
        setCategoryError(null);
        const nextCategories = await getMangaTags(language);

        if (isCurrentRequest) {
          setCategories(nextCategories);
        }
      } catch (loadError) {
        if (isCurrentRequest) {
          setCategoryError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar categorias');
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoadingCategories(false);
        }
      }
    }

    void loadCategories();

    return () => {
      isCurrentRequest = false;
    };
  }, [language]);

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadLibraryPage() {
      try {
        setIsLoadingLibrary(true);
        setLibraryError(null);
        const nextPage = await getMangaLibrary(language, libraryPage, LIBRARY_PAGE_SIZE, {
          tagId: selectedCategoryId ?? undefined,
        });

        if (isCurrentRequest) {
          setLibraryMangas(nextPage.mangas);
          setLibraryTotal(nextPage.total);
        }
      } catch (loadError) {
        if (isCurrentRequest) {
          setLibraryError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la biblioteca');
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoadingLibrary(false);
        }
      }
    }

    void loadLibraryPage();

    return () => {
      isCurrentRequest = false;
    };
  }, [language, libraryPage, selectedCategoryId]);

  async function handleSearch() {
    await runSearch(query, language);
  }

  function handleLanguageChange(nextLanguage: MangaLanguage) {
    setLanguage(nextLanguage);
    setLibraryPage(0);
  }

  function handleCategoryChange(nextCategoryId: string | null) {
    setSelectedCategoryId(nextCategoryId);
    setLibraryPage(0);
  }

  function openPreviousLibraryPage() {
    setLibraryPage((currentPage) => Math.max(0, currentPage - 1));
  }

  function openNextLibraryPage() {
    setLibraryPage((currentPage) => Math.min(libraryPageCount - 1, currentPage + 1));
  }

  function openManga(manga: MangaSearchResult) {
    router.push({
      pathname: '/manga',
      params: {
        mangaId: manga.id,
        language,
      },
    });
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
          Explorar manga
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          Busca en MangaDex o abre un manga desde la biblioteca para elegir capitulos.
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
              onPress={() => handleLanguageChange(item.code)}
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

        <View style={styles.filterBlock}>
          <View style={styles.filterHeader}>
            <ThemedText type="smallBold">Categorias</ThemedText>
            {isLoadingCategories ? (
              <ActivityIndicator color={theme.textSecondary} />
            ) : (
              <ThemedText type="code" themeColor="textSecondary">
                {categories.length} FILTROS
              </ThemedText>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}>
            <Pressable
              onPress={() => handleCategoryChange(null)}
              style={[
                styles.categoryChip,
                selectedCategoryId === null && styles.categoryChipSelected,
              ]}>
              <ThemedText type="smallBold" style={selectedCategoryId === null && styles.primaryButtonText}>
                Todas
              </ThemedText>
            </Pressable>
            {categories.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => handleCategoryChange(category.id)}
                style={[
                  styles.categoryChip,
                  selectedCategoryId === category.id && styles.categoryChipSelected,
                ]}>
                <ThemedText
                  type="smallBold"
                  numberOfLines={1}
                  style={selectedCategoryId === category.id && styles.primaryButtonText}>
                  {category.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          {categoryError && (
            <ThemedText type="small" themeColor="textSecondary">
              {categoryError}
            </ThemedText>
          )}
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
              <Pressable onPress={() => openManga(item)} style={({ pressed }) => [styles.mangaCard, pressed && styles.pressed]}>
                <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
                <View style={styles.mangaInfo}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={4}>
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

      <Section title="Biblioteca">
        <View style={styles.libraryHeader}>
          <ThemedText type="small" themeColor="textSecondary">
            {selectedCategory
              ? `${selectedCategory.name} con capitulos en ${language.toUpperCase()}.`
              : `Mangas populares con capitulos en ${language.toUpperCase()}.`}
          </ThemedText>
          <View style={styles.libraryHeaderMeta}>
            {isLoadingLibrary && libraryMangas.length > 0 && <ActivityIndicator color={theme.textSecondary} />}
            <ThemedText type="code" themeColor="textSecondary">
              {LIBRARY_PAGE_SIZE} POR PAGINA
            </ThemedText>
          </View>
        </View>

        {libraryError && (
          <ThemedView type="backgroundElement" style={styles.libraryMessagePanel}>
            <ThemedText type="smallBold">No se pudo cargar la biblioteca</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {libraryError}
            </ThemedText>
          </ThemedView>
        )}

        {isLoadingLibrary && libraryMangas.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.libraryLoadingPanel}>
            <ActivityIndicator color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Cargando biblioteca...
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.libraryGrid}>
            {libraryMangas.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => openManga(item)}
                style={({ pressed }) => [styles.libraryCard, pressed && styles.pressed]}>
                <Image source={{ uri: item.coverUrl }} style={styles.libraryCover} contentFit="cover" />
                <View style={styles.libraryInfo}>
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
            ))}
          </View>
        )}

        <View style={styles.paginationRow}>
          <Pressable
            disabled={!canGoToPreviousLibraryPage}
            onPress={openPreviousLibraryPage}
            style={({ pressed }) => [
              styles.paginationButton,
              !canGoToPreviousLibraryPage && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">{'<'} Anterior</ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.paginationStatus}>
            Pagina {libraryPage + 1} de {libraryPageCount}
          </ThemedText>
          <Pressable
            disabled={!canGoToNextLibraryPage}
            onPress={openNextLibraryPage}
            style={({ pressed }) => [
              styles.paginationButton,
              !canGoToNextLibraryPage && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">Siguiente {'>'}</ThemedText>
          </Pressable>
        </View>
      </Section>
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
  filterBlock: {
    gap: Spacing.two,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  categoryRow: {
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  categoryChip: {
    maxWidth: 180,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  categoryChipSelected: {
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
  libraryHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  libraryHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  libraryMessagePanel: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderLeftWidth: 4,
    borderLeftColor: '#b72d3b',
  },
  libraryLoadingPanel: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  libraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  libraryCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 180,
    maxWidth: 256,
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  libraryCover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  libraryInfo: {
    flex: 1,
    minHeight: 116,
    gap: Spacing.one,
  },
  paginationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  paginationButton: {
    minWidth: 124,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  paginationStatus: {
    minWidth: 132,
    textAlign: 'center',
  },
  mangaCard: {
    width: 280,
    minHeight: 188,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  cover: {
    width: 92,
    height: 138,
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

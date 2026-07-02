import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  getMergedMangaLibraryFromApi,
  getMangaTagsFromApi,
  getSourceLabel,
  searchAllMangaFromApi,
} from '@/services/mymangaonline-api';
import {
  MANGADEX_API_URL,
  MANGA_LANGUAGES,
  type MangaLanguage,
  type MangaSearchResult,
  type MangaTag,
} from '@/services/mangadex';

const INITIAL_QUERY = 'one piece';
const LIBRARY_PAGE_SIZE = 15;
const CATEGORY_GROUPS = [
  { key: 'all', label: 'Todas' },
  { key: 'genre', label: 'Generos' },
  { key: 'theme', label: 'Temas' },
] as const;
const TAG_FILTER_MODES = [
  { key: 'AND', label: 'Coincidir todo' },
  { key: 'OR', label: 'Cualquier filtro' },
] as const;

type CategoryGroupFilter = (typeof CATEGORY_GROUPS)[number]['key'];
type TagFilterMode = (typeof TAG_FILTER_MODES)[number]['key'];

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
  const hasRunInitialSearch = useRef(false);
  const [query, setQuery] = useState(initialQuery);
  const [libraryQuery, setLibraryQuery] = useState(initialQuery);
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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroupFilter>('all');
  const [categorySearch, setCategorySearch] = useState('');
  const [tagFilterMode, setTagFilterMode] = useState<TagFilterMode>('AND');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'query' | 'category' | null>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const autoSearch = getParam(params.autoSearch);
  const libraryPageCount = Math.max(1, Math.ceil(libraryTotal / LIBRARY_PAGE_SIZE));
  const canGoToPreviousLibraryPage = libraryPage > 0 && !isLoadingLibrary;
  const canGoToNextLibraryPage = libraryPage + 1 < libraryPageCount && !isLoadingLibrary;
  const selectedCategoryIdSet = useMemo(() => new Set(selectedCategoryIds), [selectedCategoryIds]);
  const selectedCategories = useMemo(
    () => categories.filter((category) => selectedCategoryIdSet.has(category.id)),
    [categories, selectedCategoryIdSet],
  );
  const filteredCategories = useMemo(() => {
    const normalizedSearch = categorySearch.trim().toLocaleLowerCase();

    return categories.filter((category) => {
      const matchesGroup = categoryGroup === 'all' || category.group === categoryGroup;
      const matchesSearch =
        normalizedSearch.length === 0 || category.name.toLocaleLowerCase().includes(normalizedSearch);

      return matchesGroup && matchesSearch;
    });
  }, [categories, categoryGroup, categorySearch]);
  const selectedCategorySummary =
    selectedCategories.length > 0
      ? `${selectedCategories
          .slice(0, 3)
          .map((category) => category.name)
          .join(', ')}${selectedCategories.length > 3 ? ` +${selectedCategories.length - 3}` : ''}`
      : null;
  const categoryStatusText =
    selectedCategories.length > 0
      ? `${selectedCategories.length} seleccionado${selectedCategories.length === 1 ? '' : 's'}`
      : `${filteredCategories.length} disponibles`;

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
      setLibraryQuery(nextQuery.trim());
      const nextResults = await searchAllMangaFromApi(nextQuery, nextLanguage);
      setResults(nextResults);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'No se pudo buscar manga');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    let isCurrentRequest = true;

    async function runInitialSearch() {
      await Promise.resolve();

      if (isCurrentRequest && !hasRunInitialSearch.current && autoSearch === '1' && initialQuery.trim()) {
        hasRunInitialSearch.current = true;
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
        const nextCategories = await getMangaTagsFromApi(language);

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
        const nextPage = await getMergedMangaLibraryFromApi(language, libraryPage, LIBRARY_PAGE_SIZE, {
          query: libraryQuery,
          tagIds: selectedCategoryIds,
          tagMode: tagFilterMode,
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
  }, [language, libraryPage, libraryQuery, selectedCategoryIds, tagFilterMode]);

  async function handleSearch() {
    await runSearch(query, language);
  }

  function handleLanguageChange(nextLanguage: MangaLanguage) {
    setLanguage(nextLanguage);
    setLibraryPage(0);
  }

  function handleCategoryToggle(nextCategoryId: string) {
    setSelectedCategoryIds((currentCategoryIds) =>
      currentCategoryIds.includes(nextCategoryId)
        ? currentCategoryIds.filter((categoryId) => categoryId !== nextCategoryId)
        : [...currentCategoryIds, nextCategoryId],
    );
    setLibraryPage(0);
  }

  function clearCategoryFilters() {
    setSelectedCategoryIds([]);
    setCategorySearch('');
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
        source: manga.source ?? 'mangadex',
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
          Busca en MangaDex y Comick o abre un manga desde la biblioteca para elegir capitulos.
        </ThemedText>
      </View>

      <ThemedView type="backgroundElement" style={styles.searchPanel}>
        <View style={styles.panelSection}>
          <View style={styles.panelSectionHeader}>
            <ThemedText type="smallBold" style={styles.panelSectionTitle}>
              Buscar en MangaDex y Comick
            </ThemedText>
            {isSearching && <ActivityIndicator color={theme.textSecondary} />}
          </View>

          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar manga"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocusedField('query')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              style={[
                styles.input,
                { color: theme.text },
                focusedField === 'query' && styles.inputFocused,
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSearching }}
              disabled={isSearching}
              onPress={handleSearch}
              style={({ pressed, hovered }) => [
                styles.searchButton,
                isSearching && styles.disabled,
                hovered && !isSearching && styles.searchButtonInteractive,
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
        </View>

        <View style={styles.panelSection}>
          <ThemedText type="smallBold" style={styles.panelSectionTitle}>
            Idioma
          </ThemedText>
          <View style={styles.languageGrid}>
            {MANGA_LANGUAGES.map((item) => {
              const isSelected = language === item.code;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={item.code}
                  onPress={() => handleLanguageChange(item.code)}
                  style={({ pressed, hovered }) => [
                    styles.languageChip,
                    isSelected && styles.languageChipSelected,
                    hovered && !isSelected && styles.secondaryButtonInteractive,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" numberOfLines={1} style={isSelected && styles.primaryButtonText}>
                    {item.label}
                  </ThemedText>
                  <ThemedText
                    type="code"
                    themeColor={isSelected ? undefined : 'textSecondary'}
                    style={isSelected && styles.primaryButtonText}>
                    {item.code.toUpperCase()}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.panelSection, styles.filterBlock]}>
          <View style={styles.filterHeader}>
            <View style={styles.filterHeaderText}>
              <ThemedText type="smallBold" style={styles.panelSectionTitle}>
                Filtros
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {selectedCategorySummary ?? 'Categorias, generos y temas'}
              </ThemedText>
            </View>
            <View style={styles.filterHeaderActions}>
              <View style={styles.statusBadge}>
                {isLoadingCategories ? (
                  <ActivityIndicator color={theme.textSecondary} />
                ) : (
                  <ThemedText type="code" themeColor="textSecondary">
                    {categoryStatusText.toUpperCase()}
                  </ThemedText>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isFilterPanelOpen }}
                onPress={() => setIsFilterPanelOpen((currentValue) => !currentValue)}
                style={({ pressed, hovered }) => [
                  styles.filterToggleButton,
                  isFilterPanelOpen && styles.filterToggleButtonOpen,
                  hovered && !isFilterPanelOpen && styles.secondaryButtonInteractive,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={isFilterPanelOpen && styles.primaryButtonText}>
                  {isFilterPanelOpen ? 'Ocultar' : 'Filtros'}
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {isFilterPanelOpen && (
            <View style={styles.filterPanelContent}>
              <TextInput
                value={categorySearch}
                onChangeText={setCategorySearch}
                placeholder="Filtrar categorias"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocusedField('category')}
                onBlur={() => setFocusedField(null)}
                style={[
                  styles.categorySearchInput,
                  { color: theme.text },
                  focusedField === 'category' && styles.inputFocused,
                ]}
              />

              <View style={styles.filterControlArea}>
                <View style={styles.filterControlGroup}>
                  {CATEGORY_GROUPS.map((item) => {
                    const isSelected = categoryGroup === item.key;

                    return (
                      <Pressable
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isSelected }}
                        key={item.key}
                        onPress={() => setCategoryGroup(item.key)}
                        style={({ pressed, hovered }) => [
                          styles.filterControl,
                          isSelected && styles.filterControlSelected,
                          hovered && !isSelected && styles.secondaryButtonInteractive,
                          pressed && styles.pressed,
                        ]}>
                        <ThemedText type="smallBold" style={isSelected && styles.primaryButtonText}>
                          {item.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.filterControlGroup}>
                  {TAG_FILTER_MODES.map((item) => {
                    const isSelected = tagFilterMode === item.key;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        key={item.key}
                        onPress={() => {
                          setTagFilterMode(item.key);
                          setLibraryPage(0);
                        }}
                        style={({ pressed, hovered }) => [
                          styles.matchModeControl,
                          isSelected && styles.matchModeControlSelected,
                          hovered && !isSelected && styles.secondaryButtonInteractive,
                          pressed && styles.pressed,
                        ]}>
                        <ThemedText type="smallBold" style={isSelected && styles.primaryButtonText}>
                          {item.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.categoryGrid}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedCategoryIds.length === 0 }}
                  onPress={clearCategoryFilters}
                  style={({ pressed, hovered }) => [
                    styles.categoryChip,
                    selectedCategoryIds.length === 0 && styles.categoryChipSelected,
                    hovered && selectedCategoryIds.length > 0 && styles.secondaryButtonInteractive,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" style={selectedCategoryIds.length === 0 && styles.primaryButtonText}>
                    {selectedCategoryIds.length === 0 ? 'Sin filtros' : 'Limpiar filtros'}
                  </ThemedText>
                </Pressable>
                {filteredCategories.map((category) => {
                  const isSelected = selectedCategoryIdSet.has(category.id);

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      key={category.id}
                      onPress={() => handleCategoryToggle(category.id)}
                      style={({ pressed, hovered }) => [
                        styles.categoryChip,
                        isSelected && styles.categoryChipSelected,
                        hovered && !isSelected && styles.secondaryButtonInteractive,
                        pressed && styles.pressed,
                      ]}>
                      <ThemedText type="smallBold" numberOfLines={1} style={isSelected && styles.primaryButtonText}>
                        {category.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {!isLoadingCategories && filteredCategories.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No hay categorias para ese filtro.
                </ThemedText>
              )}
              {categoryError && (
                <ThemedText type="small" themeColor="textSecondary">
                  {categoryError}
                </ThemedText>
              )}
            </View>
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
            keyExtractor={(item) => `${item.source ?? 'mangadex'}:${item.id}`}
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
                    <Pill text={getSourceLabel(item.source)} />
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
            {selectedCategorySummary
              ? `${selectedCategorySummary} con capitulos en ${language.toUpperCase()} (${tagFilterMode}).`
              : `Mangas de MangaDex y Comick con capitulos en ${language.toUpperCase()}.`}
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
                key={`${item.source ?? 'mangadex'}:${item.id}`}
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
                    <Pill text={getSourceLabel(item.source)} />
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
    gap: Spacing.four,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  panelSection: {
    gap: Spacing.two,
  },
  panelSectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  panelSectionTitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  searchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    flexBasis: 240,
    minWidth: 176,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.18)',
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
    fontSize: 16,
  },
  inputFocused: {
    borderColor: '#3c87f7',
    backgroundColor: 'rgba(60, 135, 247, 0.09)',
  },
  searchButton: {
    minWidth: 112,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  searchButtonInteractive: {
    backgroundColor: '#1d56b6',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  languageChip: {
    flexGrow: 1,
    flexBasis: 148,
    minWidth: 124,
    minHeight: 52,
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.18)',
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
  },
  languageChipSelected: {
    backgroundColor: '#2364d2',
    borderColor: '#2364d2',
  },
  filterBlock: {
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: 'rgba(120, 130, 150, 0.18)',
  },
  filterHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  filterHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  filterHeaderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  statusBadge: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.18)',
    backgroundColor: 'rgba(120, 130, 150, 0.08)',
  },
  filterToggleButton: {
    minWidth: 92,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.22)',
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
  },
  filterToggleButtonOpen: {
    borderColor: '#2364d2',
    backgroundColor: '#2364d2',
  },
  filterPanelContent: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  categorySearchInput: {
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.18)',
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
    fontSize: 15,
  },
  filterControlArea: {
    gap: Spacing.two,
  },
  filterControlGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
  },
  filterControl: {
    flexGrow: 1,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  filterControlSelected: {
    backgroundColor: '#2364d2',
  },
  matchModeControl: {
    flexGrow: 1,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  matchModeControlSelected: {
    backgroundColor: '#0f766e',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  categoryChip: {
    maxWidth: 184,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.2)',
    backgroundColor: 'rgba(120, 130, 150, 0.1)',
  },
  categoryChipSelected: {
    backgroundColor: '#2364d2',
    borderColor: '#2364d2',
  },
  secondaryButtonInteractive: {
    borderColor: '#3c87f7',
    backgroundColor: 'rgba(60, 135, 247, 0.1)',
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

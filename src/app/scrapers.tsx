import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  getScraperChapterPagesFromApi,
  getScraperChaptersFromApi,
  getScraperMangaDetailsFromApi,
  getScraperProvidersFromApi,
  searchScraperMangaFromApi,
  type ScraperChapter,
  type ScraperMangaDetails,
  type ScraperMangaResult,
  type ScraperPage,
  type ScraperProvider,
  type ScraperProviderError,
} from '@/services/mymangaonline-api';
import {
  getCurrentUser,
  getSavedMangas,
  getScraperSavedMangaId,
  saveScraperManga,
} from '@/services/user-library';

const DEFAULT_QUERY = 'naruto';
const ALL_PROVIDERS = 'all';
const SCRAPER_PAGE_SIZE = 15;

function formatChapterTitle(chapter: ScraperChapter) {
  const numberLabel =
    chapter.chapterNumber === undefined ? 'Capitulo' : `Capitulo ${chapter.chapterNumber}`;

  return chapter.title ? `${numberLabel} - ${chapter.title}` : numberLabel;
}

function formatProviderLanguage(provider: ScraperProvider) {
  return provider.language?.toUpperCase() ?? 'AUTO';
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getVisiblePageNumbers(currentPage: number, pageCount: number) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  if (currentPage < 4) {
    return [0, 1, 2, 3, 4, pageCount - 1];
  }

  if (currentPage > pageCount - 5) {
    return [0, pageCount - 5, pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1];
  }

  return [0, currentPage - 1, currentPage, currentPage + 1, pageCount - 1];
}

export default function ScrapersScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeProviderId = getParam(params.providerId);
  const routeMangaId = getParam(params.mangaId);
  const routeTitle = getParam(params.title);
  const initialQuery = getParam(params.q) ?? DEFAULT_QUERY;
  const [providers, setProviders] = useState<ScraperProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState(ALL_PROVIDERS);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ScraperMangaResult[]>([]);
  const [resultPage, setResultPage] = useState(0);
  const [providerErrors, setProviderErrors] = useState<ScraperProviderError[]>([]);
  const [selectedManga, setSelectedManga] = useState<ScraperMangaResult | null>(null);
  const [details, setDetails] = useState<ScraperMangaDetails | null>(null);
  const [chapters, setChapters] = useState<ScraperChapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<ScraperChapter | null>(null);
  const [pages, setPages] = useState<ScraperPage[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const currentUser = getCurrentUser();
  const currentUserId = currentUser?.id;

  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );
  const availableProviders = providers.filter((provider) => provider.available);
  const resultPageCount = Math.max(1, Math.ceil(results.length / SCRAPER_PAGE_SIZE));
  const visibleResultPages = useMemo(
    () => getVisiblePageNumbers(resultPage, resultPageCount),
    [resultPage, resultPageCount],
  );
  const visibleResults = useMemo(
    () => results.slice(resultPage * SCRAPER_PAGE_SIZE, (resultPage + 1) * SCRAPER_PAGE_SIZE),
    [resultPage, results],
  );
  const canGoToPreviousResultPage = resultPage > 0 && !isSearching;
  const canGoToNextResultPage = resultPage + 1 < resultPageCount && !isSearching;
  const savedMangaIds = useMemo(() => {
    void savedVersion;

    return new Set(currentUserId ? getSavedMangas(currentUserId).map((manga) => manga.id) : []);
  }, [currentUserId, savedVersion]);
  const contentInset = useMemo(
    () => ({
      top: Platform.select({ web: 92, default: safeAreaInsets.top + Spacing.three }),
      bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.five,
      left: safeAreaInsets.left,
      right: safeAreaInsets.right,
    }),
    [safeAreaInsets],
  );

  const runSearch = useCallback(async (nextQuery: string, providerId: string) => {
    if (!nextQuery.trim()) {
      return;
    }

    try {
      setIsSearching(true);
      setError(null);
      setProviderErrors([]);
      setSelectedManga(null);
      setDetails(null);
      setChapters([]);
      setSelectedChapter(null);
      setPages([]);
      setResultPage(0);

      const payload = await searchScraperMangaFromApi(nextQuery, providerId);
      setResults(payload.items);
      setProviderErrors(payload.errors);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'No se pudo buscar con scrapers');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadProviders() {
      try {
        setIsLoadingProviders(true);
        const nextProviders = await getScraperProvidersFromApi();

        if (isMounted) {
          setProviders(nextProviders);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar proveedores');
        }
      } finally {
        if (isMounted) {
          setIsLoadingProviders(false);
        }
      }
    }

    void loadProviders();

    async function runInitialSearch() {
      await Promise.resolve();

      if (isMounted) {
        await runSearch(initialQuery, routeProviderId ?? ALL_PROVIDERS);
      }
    }

    void runInitialSearch();

    return () => {
      isMounted = false;
    };
  }, [initialQuery, routeProviderId, runSearch]);

  useEffect(() => {
    if (!routeProviderId || !routeMangaId) {
      return;
    }

    const providerId = routeProviderId;
    const mangaId = routeMangaId;
    const title = routeTitle ?? routeMangaId;
    let isMounted = true;

    async function loadRouteManga() {
      try {
        setSelectedProviderId(providerId);
        setSelectedManga({
          id: mangaId,
          providerId,
          title,
        });
        setDetails(null);
        setChapters([]);
        setSelectedChapter(null);
        setPages([]);
        setDetailsError(null);
        setPagesError(null);
        setIsLoadingDetails(true);

        const [nextDetails, nextChapters] = await Promise.all([
          getScraperMangaDetailsFromApi(providerId, mangaId),
          getScraperChaptersFromApi(providerId, mangaId),
        ]);

        if (isMounted) {
          setDetails(nextDetails);
          setChapters(nextChapters);
        }
      } catch (loadError) {
        if (isMounted) {
          setDetailsError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el manga');
        }
      } finally {
        if (isMounted) {
          setIsLoadingDetails(false);
        }
      }
    }

    void loadRouteManga();

    return () => {
      isMounted = false;
    };
  }, [routeMangaId, routeProviderId, routeTitle]);

  async function handleSearch() {
    await runSearch(query, selectedProviderId);
  }

  async function handleProviderSelect(providerId: string) {
    setSelectedProviderId(providerId);

    if (query.trim()) {
      await runSearch(query, providerId);
    }
  }

  async function openManga(manga: ScraperMangaResult) {
    try {
      setSelectedManga(manga);
      setDetails(null);
      setChapters([]);
      setSelectedChapter(null);
      setPages([]);
      setDetailsError(null);
      setPagesError(null);
      setIsLoadingDetails(true);

      const [nextDetails, nextChapters] = await Promise.all([
        getScraperMangaDetailsFromApi(manga.providerId, manga.id),
        getScraperChaptersFromApi(manga.providerId, manga.id),
      ]);

      setDetails(nextDetails);
      setChapters(nextChapters);
    } catch (loadError) {
      setDetailsError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el manga');
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function openChapter(chapter: ScraperChapter) {
    try {
      setSelectedChapter(chapter);
      setPages([]);
      setPagesError(null);
      setIsLoadingPages(true);

      const nextPages = await getScraperChapterPagesFromApi(chapter.providerId, chapter.id);
      setPages(nextPages);
    } catch (loadError) {
      setPagesError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar paginas');
    } finally {
      setIsLoadingPages(false);
    }
  }

  function getProviderName(providerId: string) {
    return providerById.get(providerId)?.name ?? providerId;
  }

  function getProviderLanguage(providerId: string) {
    return providerById.get(providerId)?.language;
  }

  function isSaved(manga: ScraperMangaResult) {
    return savedMangaIds.has(getScraperSavedMangaId(manga.providerId, manga.id));
  }

  function saveResult(manga: ScraperMangaResult) {
    if (!currentUser) {
      router.push('/library');
      return;
    }

    saveScraperManga(
      currentUser.id,
      manga,
      getProviderName(manga.providerId),
      getProviderLanguage(manga.providerId),
    );
    setSavedVersion((current) => current + 1);
    setLibraryMessage(`${manga.title || 'Manga'} guardado en Mis mangas.`);
  }

  function saveAllResults() {
    if (!currentUser) {
      router.push('/library');
      return;
    }

    results.forEach((manga) => {
      saveScraperManga(
        currentUser.id,
        manga,
        getProviderName(manga.providerId),
        getProviderLanguage(manga.providerId),
      );
    });
    setSavedVersion((current) => current + 1);
    setLibraryMessage(`${results.length} mangas guardados en Mis mangas.`);
  }

  function openPreviousResultPage() {
    setResultPage((currentPage) => Math.max(0, currentPage - 1));
  }

  function openNextResultPage() {
    setResultPage((currentPage) => Math.min(resultPageCount - 1, currentPage + 1));
  }

  function openResultPage(nextPage: number) {
    if (nextPage === resultPage || isSearching) {
      return;
    }

    setResultPage(Math.min(Math.max(0, nextPage), resultPageCount - 1));
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
          Explorar con scrapers
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Busca mangas desde proveedores scraper del backend y guardalos en Mis mangas.
        </ThemedText>
      </View>

      <ThemedView type="backgroundElement" style={styles.searchPanel}>
        <View style={styles.panelSection}>
          <View style={styles.panelSectionHeader}>
            <ThemedText type="smallBold" style={styles.panelSectionTitle}>
              Buscar por scrapers
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
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              style={[styles.searchInput, { color: theme.text }]}
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
                <>
                  <SymbolView
                    tintColor="#ffffff"
                    name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                    size={16}
                  />
                  <ThemedText type="smallBold" style={styles.primaryText}>
                    Buscar
                  </ThemedText>
                </>
              )}
            </Pressable>
          </View>
        </View>

        <View style={[styles.panelSection, styles.providerBlock]}>
          <View style={styles.providerHeader}>
            <View>
              <ThemedText type="smallBold" style={styles.panelSectionTitle}>
                Proveedores
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Usa todos o limita la busqueda a una fuente scraper.
              </ThemedText>
            </View>
            {isLoadingProviders ? (
              <ActivityIndicator color={theme.textSecondary} />
            ) : (
              <View style={styles.statusBadge}>
                <ThemedText type="code" themeColor="textSecondary">
                  {availableProviders.length}/{providers.length} ACTIVOS
                </ThemedText>
              </View>
            )}
          </View>

          <View style={styles.providerGrid}>
            <ProviderChip
              active={selectedProviderId === ALL_PROVIDERS}
              label="Todos"
              meta={`${availableProviders.length} activos`}
              onPress={() => handleProviderSelect(ALL_PROVIDERS)}
            />
            {providers.map((provider) => (
              <ProviderChip
                key={provider.id}
                active={selectedProviderId === provider.id}
                disabled={!provider.available}
                label={provider.name}
                meta={`${formatProviderLanguage(provider)} - ${provider.type}`}
                onPress={() => handleProviderSelect(provider.id)}
              />
            ))}
          </View>
        </View>
      </ThemedView>

      {error && (
        <ThemedView type="backgroundElement" style={styles.errorPanel}>
          <ThemedText type="smallBold">Error</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        </ThemedView>
      )}

      {providerErrors.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.warningPanel}>
          <ThemedText type="smallBold">Fuentes con error</ThemedText>
          {providerErrors.map((providerError) => (
            <ThemedText key={providerError.providerId} type="small" themeColor="textSecondary">
              {getProviderName(providerError.providerId)}: {providerError.message}
            </ThemedText>
          ))}
        </ThemedView>
      )}

      <Section title="Biblioteca scraper">
        <View style={styles.libraryHeader}>
          <View style={styles.libraryHeaderText}>
            <ThemedText type="small" themeColor="textSecondary">
              {results.length} mangas encontrados desde proveedores scraper.
            </ThemedText>
            {results.length > 0 && (
              <ThemedText type="code" themeColor="textSecondary">
                PAGINA {resultPage + 1} DE {resultPageCount} - {SCRAPER_PAGE_SIZE} POR PAGINA
              </ThemedText>
            )}
          </View>
          {results.length > 0 && (
            <Pressable
              disabled={isSearching}
              onPress={saveAllResults}
              style={({ pressed }) => [
                styles.saveAllButton,
                isSearching && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={styles.primaryText}>
                Guardar resultados
              </ThemedText>
            </Pressable>
          )}
        </View>

        {libraryMessage && (
          <ThemedView type="backgroundElement" style={styles.successPanel}>
            <ThemedText type="smallBold">Biblioteca actualizada</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {libraryMessage}
            </ThemedText>
          </ThemedView>
        )}

        {isSearching && results.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.loadingPanel}>
            <ActivityIndicator color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Cargando biblioteca scraper...
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.resultGrid}>
            {visibleResults.map((manga) => {
              const isMangaSaved = isSaved(manga);

              return (
                <View
                  key={`${manga.providerId}:${manga.id}`}
                  style={[
                    styles.resultCard,
                    selectedManga?.id === manga.id &&
                      selectedManga.providerId === manga.providerId &&
                      styles.resultCardActive,
                  ]}>
                  <Pressable onPress={() => openManga(manga)} style={({ pressed }) => [styles.resultOpenArea, pressed && styles.pressed]}>
                    {manga.cover ? (
                      <Image source={{ uri: manga.cover }} style={styles.cover} contentFit="cover" />
                    ) : (
                      <View style={styles.coverPlaceholder}>
                        <ThemedText type="code" themeColor="textSecondary">
                          SIN COVER
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.cardBody}>
                      <ThemedText type="smallBold" numberOfLines={2}>
                        {manga.title || 'Sin titulo'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                        {manga.description || 'Sin descripcion disponible.'}
                      </ThemedText>
                      <View style={styles.cardMeta}>
                        <Pill text={getProviderName(manga.providerId)} />
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => saveResult(manga)}
                    style={({ pressed }) => [
                      styles.saveResultButton,
                      isMangaSaved && styles.saveResultButtonActive,
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="smallBold" style={isMangaSaved && styles.primaryText}>
                      {isMangaSaved ? 'Guardado' : 'Guardar'}
                    </ThemedText>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {!isSearching && results.length === 0 && (
          <ThemedView type="backgroundElement" style={styles.emptyPanel}>
            <ThemedText type="smallBold">Sin resultados</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Cambia la busqueda o selecciona otro proveedor.
            </ThemedText>
          </ThemedView>
        )}

        {results.length > SCRAPER_PAGE_SIZE && (
          <View style={styles.paginationRow}>
            <Pressable
              disabled={!canGoToPreviousResultPage}
              onPress={openPreviousResultPage}
              style={({ pressed }) => [
                styles.paginationButton,
                !canGoToPreviousResultPage && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold">{'<'} Anterior</ThemedText>
            </Pressable>

            <View style={styles.pageNumberRow}>
              {visibleResultPages.map((pageNumber, index) => {
                const previousPageNumber = visibleResultPages[index - 1];
                const hasGap = previousPageNumber !== undefined && pageNumber - previousPageNumber > 1;
                const isSelected = pageNumber === resultPage;

                return (
                  <View key={pageNumber} style={styles.pageNumberItem}>
                    {hasGap && (
                      <ThemedText type="small" themeColor="textSecondary">
                        ...
                      </ThemedText>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled: isSearching }}
                      disabled={isSearching}
                      onPress={() => openResultPage(pageNumber)}
                      style={({ pressed }) => [
                        styles.pageNumberButton,
                        isSelected && styles.pageNumberButtonSelected,
                        pressed && styles.pressed,
                      ]}>
                      <ThemedText type="smallBold" style={isSelected && styles.primaryText}>
                        {pageNumber + 1}
                      </ThemedText>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <Pressable
              disabled={!canGoToNextResultPage}
              onPress={openNextResultPage}
              style={({ pressed }) => [
                styles.paginationButton,
                !canGoToNextResultPage && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold">Siguiente {'>'}</ThemedText>
            </Pressable>
          </View>
        )}
      </Section>

      {(selectedManga || isLoadingDetails || detailsError) && (
        <Section title="Lobby del manga">
          <ThemedView type="backgroundElement" style={styles.detailPanel}>
            {isLoadingDetails ? (
              <LoadingRow label="Cargando detalles y capitulos..." />
            ) : detailsError ? (
              <>
                <ThemedText type="smallBold">No se pudo cargar el manga</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {detailsError}
                </ThemedText>
              </>
            ) : (
              details && (
                <>
                  <View style={styles.detailTop}>
                    {details.cover ? (
                      <Image source={{ uri: details.cover }} style={styles.detailCover} contentFit="cover" />
                    ) : (
                      <View style={styles.detailCoverPlaceholder} />
                    )}
                    <View style={styles.detailInfo}>
                      <ThemedText type="subtitle" style={styles.detailTitle}>
                        {details.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={4}>
                        {details.description || 'Sin descripcion disponible.'}
                      </ThemedText>
                      <View style={styles.pillRow}>
                        <Pill text={getProviderName(details.providerId)} />
                        {details.status && <Pill text={details.status} />}
                        {details.author && <Pill text={details.author} />}
                      </View>
                    </View>
                  </View>

                  <View style={styles.sectionHeader}>
                    <View>
                      <ThemedText type="smallBold">Capitulos {chapters.length}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Selecciona un capitulo para pedir las paginas al backend.
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.chapterList}>
                    {chapters.slice(0, 30).map((chapter) => (
                      <Pressable
                        key={chapter.id}
                        onPress={() => openChapter(chapter)}
                        style={({ pressed }) => [
                          styles.chapterRow,
                          selectedChapter?.id === chapter.id && styles.chapterRowActive,
                          pressed && styles.pressed,
                        ]}>
                        <View style={styles.chapterInfo}>
                          <ThemedText type="smallBold" numberOfLines={1}>
                            {formatChapterTitle(chapter)}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                            {chapter.language?.toUpperCase() ?? details.providerId}
                            {chapter.publishedAt ? ` - ${chapter.publishedAt}` : ''}
                          </ThemedText>
                        </View>
                        <SymbolView
                          tintColor={theme.textSecondary}
                          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                          size={16}
                        />
                      </Pressable>
                    ))}
                  </View>

                  {chapters.length === 0 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      No se detectaron capitulos para este resultado.
                    </ThemedText>
                  )}
                </>
              )
            )}
          </ThemedView>
        </Section>
      )}

      {(selectedChapter || isLoadingPages || pagesError) && (
        <Section title="Paginas">
          <ThemedView type="backgroundElement" style={styles.pagesPanel}>
            <View style={styles.sectionHeader}>
              <View>
                <ThemedText type="smallBold">Paginas del capitulo</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {selectedChapter ? formatChapterTitle(selectedChapter) : 'Selecciona un capitulo'}
                </ThemedText>
              </View>
              {isLoadingPages && <ActivityIndicator color={theme.textSecondary} />}
            </View>

            {pagesError && (
              <ThemedText type="small" themeColor="textSecondary">
                {pagesError}
              </ThemedText>
            )}

            {!isLoadingPages && pages.length > 0 && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  {pages.length} paginas detectadas. Vista previa de las primeras 6.
                </ThemedText>
                <View style={styles.pagePreviewGrid}>
                  {pages.slice(0, 6).map((page) => (
                    <Image
                      key={`${page.index}:${page.imageUrl}`}
                      source={{ uri: page.imageUrl }}
                      style={styles.pagePreview}
                      contentFit="cover"
                    />
                  ))}
                </View>
              </>
            )}

            {!isLoadingPages && selectedChapter && pages.length === 0 && !pagesError && (
              <ThemedText type="small" themeColor="textSecondary">
                El scraper no devolvio paginas para este capitulo.
              </ThemedText>
            )}
          </ThemedView>
        </Section>
      )}
    </ScrollView>
  );
}

function ProviderChip({
  active,
  disabled,
  label,
  meta,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.providerChip,
        active && styles.providerChipActive,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" numberOfLines={1} style={active && styles.primaryText}>
        {label}
      </ThemedText>
      <ThemedText type="code" numberOfLines={1} style={active && styles.primaryText} themeColor="textSecondary">
        {meta.toUpperCase()}
      </ThemedText>
    </Pressable>
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

function LoadingRow({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator color={theme.text} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
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
  subtitle: {
    maxWidth: 640,
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
  searchInput: {
    flex: 1,
    flexBasis: 240,
    minWidth: 176,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.18)',
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
    fontSize: 16,
  },
  searchButton: {
    minWidth: 112,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  providerBlock: {
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: 'rgba(120, 130, 150, 0.18)',
  },
  providerHeader: {
    minHeight: 28,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
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
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  providerList: {
    gap: Spacing.two,
  },
  providerChip: {
    flexGrow: 1,
    flexBasis: 156,
    maxWidth: 220,
    minHeight: 58,
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.16)',
  },
  providerChipActive: {
    backgroundColor: '#2364d2',
  },
  primaryText: {
    color: '#ffffff',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  errorPanel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderLeftWidth: 4,
    borderLeftColor: '#b72d3b',
  },
  warningPanel: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderLeftWidth: 4,
    borderLeftColor: '#c97916',
  },
  successPanel: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderLeftWidth: 4,
    borderLeftColor: '#147d55',
  },
  sectionHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  saveAllButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  resultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  resultCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 180,
    maxWidth: 256,
    minHeight: 388,
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  resultOpenArea: {
    flex: 1,
    gap: Spacing.two,
  },
  resultCardActive: {
    borderWidth: 2,
    borderColor: '#2364d2',
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: 2 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  cardBody: {
    flex: 1,
    gap: Spacing.one,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: 'auto',
  },
  saveResultButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  saveResultButtonActive: {
    backgroundColor: '#147d55',
  },
  pill: {
    alignSelf: 'flex-start',
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  emptyPanel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  loadingPanel: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  libraryHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  libraryHeaderText: {
    flex: 1,
    minWidth: 220,
    gap: Spacing.half,
  },
  detailPanel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  detailTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  detailCover: {
    width: 142,
    height: 210,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  detailCoverPlaceholder: {
    width: 142,
    height: 210,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  detailInfo: {
    flex: 1,
    minWidth: 240,
    gap: Spacing.two,
    justifyContent: 'center',
  },
  detailTitle: {
    fontSize: 24,
    lineHeight: 30,
  },
  chapterList: {
    gap: Spacing.two,
  },
  chapterRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  chapterRowActive: {
    borderLeftWidth: 4,
    borderLeftColor: '#2364d2',
  },
  chapterInfo: {
    flex: 1,
    minWidth: 0,
  },
  pagesPanel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  pagePreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pagePreview: {
    width: 118,
    aspectRatio: 2 / 3,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  paginationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
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
  pageNumberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  pageNumberItem: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pageNumberButton: {
    minWidth: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  pageNumberButtonSelected: {
    backgroundColor: '#2364d2',
  },
  loadingRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});

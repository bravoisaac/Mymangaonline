import { SymbolView } from 'expo-symbols';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  EXTENSIONS_INDEX_URL,
  fetchExtensions,
  filterExtensions,
  getApkUrl,
  getDisplayName,
  getHiddenSourceCount,
  getLanguageFilters,
  getPrimaryUrl,
  getSourcePreview,
  type MangaExtension,
} from '@/services/extensions';

const DEFAULT_VISIBLE_COUNT = 80;

export default function ExtensionsScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const [extensions, setExtensions] = useState<MangaExtension[]>([]);
  const [query, setQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [showNsfw, setShowNsfw] = useState(false);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_COUNT);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadExtensions() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchExtensions();

        if (isMounted) {
          setExtensions(data);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la API');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadExtensions();

    return () => {
      isMounted = false;
    };
  }, []);

  const extensionsForLanguageFilters = useMemo(
    () => extensions.filter((extension) => showNsfw || extension.nsfw !== 1),
    [extensions, showNsfw],
  );
  const languageFilters = useMemo(
    () => getLanguageFilters(extensionsForLanguageFilters),
    [extensionsForLanguageFilters],
  );
  const selectedLanguageFilter = languageFilters.find((filter) => filter.code === selectedLanguage);
  const filteredExtensions = useMemo(
    () => filterExtensions(extensions, query, selectedLanguage, showNsfw),
    [extensions, query, selectedLanguage, showNsfw],
  );
  const visibleExtensions = filteredExtensions.slice(0, visibleCount);
  const safeCount = extensions.filter((extension) => extension.nsfw !== 1).length;
  const nsfwCount = extensions.length - safeCount;

  const contentBottomInset = safeAreaInsets.bottom + BottomTabInset + Spacing.five;

  function loadMore() {
    setVisibleCount((currentCount) =>
      Math.min(currentCount + DEFAULT_VISIBLE_COUNT, filteredExtensions.length),
    );
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    setVisibleCount(DEFAULT_VISIBLE_COUNT);
  }

  function handleLanguageChange(nextLanguage: string) {
    setSelectedLanguage(nextLanguage);
    setVisibleCount(DEFAULT_VISIBLE_COUNT);
  }

  function handleNsfwChange(nextValue: boolean) {
    setShowNsfw(nextValue);
    setVisibleCount(DEFAULT_VISIBLE_COUNT);
  }

  function openUrl(url?: string) {
    if (url) {
      Linking.openURL(url);
    }
  }

  function renderExtension({ item }: { item: MangaExtension }) {
    const primaryUrl = getPrimaryUrl(item);
    const sourcePreview = getSourcePreview(item, selectedLanguage);
    const hiddenSourceCount = getHiddenSourceCount(item, selectedLanguage);

    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titleBlock}>
            <ThemedText type="smallBold" style={styles.extensionName} numberOfLines={2}>
              {getDisplayName(item)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {item.pkg}
            </ThemedText>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, item.nsfw === 1 ? styles.dangerBadge : styles.safeBadge]}>
              <ThemedText type="code" style={styles.badgeText}>
                {item.nsfw === 1 ? 'NSFW' : 'SAFE'}
              </ThemedText>
            </View>
            <View style={styles.badge}>
              <ThemedText type="code" style={styles.badgeText}>
                {item.lang.toUpperCase()}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <MetaItem label="Version" value={item.version} />
          <MetaItem label="Fuentes" value={String(item.sources.length)} />
          <MetaItem label="Code" value={String(item.code)} />
        </View>

        <View style={styles.sourceList}>
          {sourcePreview.map((source) => (
            <View key={source.id} style={styles.sourceRow}>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.sourceName}>
                {source.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {source.lang.toUpperCase()} - {source.baseUrl}
              </ThemedText>
            </View>
          ))}
          {hiddenSourceCount > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              +{hiddenSourceCount} fuentes mas en este filtro
            </ThemedText>
          )}
        </View>

        <View style={styles.actions}>
          <IconButton
            label="Abrir fuente"
            icon={{ ios: 'safari', android: 'link', web: 'link' }}
            disabled={!primaryUrl}
            onPress={() => openUrl(primaryUrl)}
          />
          <IconButton
            label="APK"
            icon={{ ios: 'square.and.arrow.down', android: 'download', web: 'download' }}
            onPress={() => openUrl(getApkUrl(item.apk))}
          />
        </View>
      </ThemedView>
    );
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
        <ThemedText type="small" themeColor="textSecondary">
          Cargando indice Keiyoushi...
        </ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle" style={styles.centerText}>
          No se pudo leer la API
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {error}
        </ThemedText>
        <Pressable style={styles.retryButton} onPress={() => openUrl(EXTENSIONS_INDEX_URL)}>
          <ThemedText type="smallBold">Abrir JSON</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FlatList
          data={visibleExtensions}
          renderItem={renderExtension}
          keyExtractor={(item) => item.pkg}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: contentBottomInset }]}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <ThemedText type="title" style={styles.title}>
                  My Manga Online
                </ThemedText>
                <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
                  Catalogo de extensiones Keiyoushi para encontrar fuentes de manga, abrir sus
                  sitios y descargar APKs.
                </ThemedText>
              </View>

              <View style={styles.statsRow}>
                <Stat label="Extensiones" value={String(extensions.length)} />
                <Stat label="Seguras" value={String(safeCount)} />
                <Stat label="NSFW" value={String(nsfwCount)} />
              </View>

              <ThemedView type="backgroundElement" style={styles.filters}>
                <View style={styles.searchRow}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Buscar
                  </ThemedText>
                  <TextInput
                    value={query}
                    onChangeText={handleQueryChange}
                    placeholder="Buscar extension, paquete o URL"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.searchInput, { color: theme.text }]}
                  />
                </View>

                <View style={styles.languageHeader}>
                  <ThemedText type="smallBold">Filtrar por idioma</ThemedText>
                  {selectedLanguage !== 'all' && (
                    <Pressable onPress={() => handleLanguageChange('all')}>
                      <ThemedText type="linkPrimary">Limpiar</ThemedText>
                    </Pressable>
                  )}
                </View>

                <FlatList
                  data={languageFilters}
                  keyExtractor={(item) => item.code}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.languageList}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => handleLanguageChange(item.code)}
                      style={[
                        styles.languageChip,
                        selectedLanguage === item.code && styles.languageChipSelected,
                      ]}>
                      <ThemedText
                        type="smallBold"
                        themeColor={selectedLanguage === item.code ? undefined : 'text'}
                        numberOfLines={1}
                        style={selectedLanguage === item.code && styles.languageTextSelected}>
                        {item.label}
                      </ThemedText>
                      <ThemedText
                        type="code"
                        themeColor={selectedLanguage === item.code ? undefined : 'textSecondary'}
                        numberOfLines={1}
                        style={selectedLanguage === item.code && styles.languageTextSelected}>
                        {item.code.toUpperCase()} - {item.extensionCount} ext
                      </ThemedText>
                    </Pressable>
                  )}
                />

                <View style={styles.switchRow}>
                  <View>
                    <ThemedText type="smallBold">Mostrar contenido NSFW</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Oculto por defecto para una exploracion segura.
                    </ThemedText>
                  </View>
                  <Switch value={showNsfw} onValueChange={handleNsfwChange} />
                </View>
              </ThemedView>

              <View style={styles.resultRow}>
                <View style={styles.resultTextBlock}>
                  <ThemedText type="smallBold">{filteredExtensions.length} resultados</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Idioma: {selectedLanguageFilter?.label ?? selectedLanguage.toUpperCase()}
                  </ThemedText>
                </View>
                {visibleExtensions.length < filteredExtensions.length && (
                  <ThemedText type="small" themeColor="textSecondary">
                    mostrando {visibleExtensions.length}
                  </ThemedText>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText type="smallBold">Sin resultados</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                Cambia la busqueda, el idioma o activa NSFW si esperabas ver esas extensiones.
              </ThemedText>
            </ThemedView>
          }
          ListFooterComponent={
            visibleExtensions.length < filteredExtensions.length ? (
              <Pressable style={styles.loadMoreButton} onPress={loadMore}>
                <ThemedText type="smallBold">Cargar mas</ThemedText>
              </Pressable>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="subtitle" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="code" themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
    </ThemedView>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <ThemedText type="code" themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function IconButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: ComponentProps<typeof SymbolView>['name'];
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.disabledButton,
        pressed && styles.pressed,
      ]}>
      <SymbolView tintColor={theme.text} name={icon} size={16} />
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  listContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.three,
    paddingTop: Platform.select({ web: 92, default: Spacing.three }),
  },
  hero: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
  },
  subtitle: {
    maxWidth: 620,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  statValue: {
    fontSize: 24,
    lineHeight: 30,
  },
  filters: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  searchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
  },
  languageHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  languageList: {
    gap: Spacing.two,
  },
  languageChip: {
    width: 126,
    minHeight: 56,
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  languageChipSelected: {
    backgroundColor: '#2364d2',
  },
  languageTextSelected: {
    color: '#ffffff',
  },
  switchRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  resultTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  extensionName: {
    fontSize: 18,
    lineHeight: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.one,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 128,
  },
  badge: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.22)',
  },
  safeBadge: {
    backgroundColor: '#147a56',
  },
  dangerBadge: {
    backgroundColor: '#b72d3b',
  },
  badgeText: {
    color: '#ffffff',
  },
  metaGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metaItem: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  sourceList: {
    gap: Spacing.two,
  },
  sourceRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderLeftWidth: 3,
    borderLeftColor: '#2364d2',
  },
  sourceName: {
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    minHeight: 42,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  disabledButton: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
  loadMoreButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.two,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
});

import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { getHomeMangaFromApi, getSourceLabel } from '@/services/mymangaonline-api';
import {
  DEFAULT_MANGA_LANGUAGE,
  MANGA_LANGUAGES,
  type MangaLanguage,
  type MangaSearchResult,
} from '@/services/mangadex';

const MANGA_CARD_WIDTH = 174;
const MANGA_CARD_GAP = Spacing.two;
const MANGA_CARD_STEP = MANGA_CARD_WIDTH + MANGA_CARD_GAP;

export default function HomeScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const [language, setLanguage] = useState<MangaLanguage>(DEFAULT_MANGA_LANGUAGE);
  const [popularManga, setPopularManga] = useState<MangaSearchResult[]>([]);
  const [updatedManga, setUpdatedManga] = useState<MangaSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    let isMounted = true;

    async function loadHome() {
      try {
        setIsLoading(true);
        setError(null);
        const homeManga = await getHomeMangaFromApi(language);

        if (isMounted) {
          setPopularManga(homeManga.recommended);
          setUpdatedManga(homeManga.featured);
        }
      } catch (homeError) {
        if (isMounted) {
          setError(homeError instanceof Error ? homeError.message : 'No se pudo cargar API_Mymangaonline');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadHome();

    return () => {
      isMounted = false;
    };
  }, [language]);

  function openMangaLobby(manga: MangaSearchResult) {
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
      <View style={styles.hero}>
        <ThemedText type="title" style={styles.title}>
          My Manga Online
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Manga servido por API_Mymangaonline. Elige idioma, revisa actualizaciones recientes y
          abre cualquier titulo en Explorar.
        </ThemedText>
      </View>

      <ThemedView type="backgroundElement" style={styles.languagePanel}>
        <View style={styles.panelHeader}>
          <View>
            <ThemedText type="smallBold">Idioma de lectura</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Filtra populares, actualizados y busqueda. Espanol incluye ES-419.
            </ThemedText>
          </View>
          <Pressable
            onPress={() => router.push('/reader')}
            style={({ pressed }) => [styles.exploreButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.primaryText}>
              Explorar
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.languageRow}>
          {MANGA_LANGUAGES.map((item) => (
            <Pressable
              key={item.code}
              onPress={() => setLanguage(item.code)}
              style={[styles.languageChip, language === item.code && styles.languageChipSelected]}>
              <ThemedText
                type="smallBold"
                style={language === item.code && styles.primaryText}
                numberOfLines={1}>
                {item.label}
              </ThemedText>
              <ThemedText
                type="code"
                style={language === item.code && styles.primaryText}
                numberOfLines={1}>
                {item.code.toUpperCase()}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </ThemedView>

      {error && (
        <ThemedView type="backgroundElement" style={styles.errorPanel}>
          <ThemedText type="smallBold">No se pudo cargar API_Mymangaonline</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        </ThemedView>
      )}

      {isLoading ? (
        <ThemedView type="backgroundElement" style={styles.loadingPanel}>
          <ActivityIndicator color={theme.text} />
          <ThemedText type="small" themeColor="textSecondary">
            Cargando mangas...
          </ThemedText>
        </ThemedView>
      ) : (
        <>
          <MangaRail
            title="Mangas actualizados"
            subtitle="Capitulos recientes y titulos ES-419 disponibles desde el backend."
            manga={updatedManga}
            onPress={openMangaLobby}
          />
          <MangaRail
            title="Populares"
            subtitle="Titulos con mayor seguimiento en espanol y ES-419."
            manga={popularManga}
            onPress={openMangaLobby}
          />
        </>
      )}
    </ScrollView>
  );
}

function MangaRail({
  manga,
  onPress,
  subtitle,
  title,
}: {
  manga: MangaSearchResult[];
  onPress: (manga: MangaSearchResult) => void;
  subtitle: string;
  title: string;
}) {
  const listRef = useRef<FlatList<MangaSearchResult>>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  function slide(direction: 'left' | 'right') {
    const nextOffset = Math.max(
      0,
      scrollOffset + (direction === 'right' ? MANGA_CARD_STEP * 3 : -MANGA_CARD_STEP * 3),
    );

    listRef.current?.scrollToOffset({ offset: nextOffset, animated: true });
    setScrollOffset(nextOffset);
  }

  return (
    <View style={styles.rail}>
      <View style={styles.railTop}>
        <View style={styles.railHeader}>
          <ThemedText type="subtitle" style={styles.railTitle}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.railSubtitle}>
            {subtitle}
          </ThemedText>
        </View>

        {manga.length > 0 && (
          <View style={styles.railControls}>
            <Pressable
              onPress={() => slide('left')}
              style={({ pressed }) => [styles.railButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold">{'<'}</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => slide('right')}
              style={({ pressed }) => [styles.railButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold">{'>'}</ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={manga}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.mangaList}
        decelerationRate="fast"
        ListEmptyComponent={<EmptyRail />}
        onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        snapToAlignment="start"
        snapToInterval={MANGA_CARD_STEP}
        renderItem={({ item }) => <MangaCard manga={item} onPress={() => onPress(item)} />}
      />
    </View>
  );
}

function MangaCard({ manga, onPress }: { manga: MangaSearchResult; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.mangaCard, pressed && styles.pressed]}>
      <Image source={{ uri: manga.coverUrl }} style={styles.cover} contentFit="cover" />
      <View style={styles.cardBody}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {manga.title || 'Sin titulo'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
          {manga.description || 'Sin descripcion disponible.'}
        </ThemedText>
        <View style={styles.metaRow}>
          <Pill text={getSourceLabel(manga.source)} />
          {manga.year && <Pill text={String(manga.year)} />}
          {manga.status && <Pill text={manga.status} />}
        </View>
      </View>
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

function EmptyRail() {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyRail}>
      <ThemedText type="small" themeColor="textSecondary">
        No hay resultados para este idioma.
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
  hero: {
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
  languagePanel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  panelHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  exploreButton: {
    minHeight: 42,
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
  primaryText: {
    color: '#ffffff',
  },
  rail: {
    gap: Spacing.two,
  },
  railTop: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  railHeader: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  railControls: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  railButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  railTitle: {
    fontSize: 26,
    lineHeight: 32,
  },
  railSubtitle: {
    maxWidth: 620,
  },
  mangaList: {
    gap: Spacing.two,
    paddingRight: Spacing.three,
    paddingBottom: Spacing.one,
  },
  mangaCard: {
    width: MANGA_CARD_WIDTH,
    minHeight: 322,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  cardBody: {
    flex: 1,
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  metaRow: {
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
  loadingPanel: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  emptyRail: {
    width: 260,
    minHeight: 120,
    justifyContent: 'center',
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
  pressed: {
    opacity: 0.72,
  },
});

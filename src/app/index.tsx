import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
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

type RailKind = 'updated' | 'popular' | 'recommended';

export default function HomeScreen() {
  const theme = useTheme();
  const { contentInset, isCompact } = useResponsiveLayout();
  const [language, setLanguage] = useState<MangaLanguage>(DEFAULT_MANGA_LANGUAGE);
  const [popularManga, setPopularManga] = useState<MangaSearchResult[]>([]);
  const [updatedManga, setUpdatedManga] = useState<MangaSearchResult[]>([]);
  const [recommendedManga, setRecommendedManga] = useState<MangaSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadHome() {
      try {
        setIsLoading(true);
        setError(null);
        const homeManga = await getHomeMangaFromApi(language);

        if (isMounted) {
          setPopularManga(homeManga.popular);
          setUpdatedManga(homeManga.recentlyUpdated);
          setRecommendedManga(homeManga.recommended);
        }
      } catch (homeError) {
        if (isMounted) {
          setPopularManga([]);
          setUpdatedManga([]);
          setRecommendedManga([]);
          setError(
            homeError instanceof Error
              ? homeError.message
              : 'No se pudo conectar con el catálogo',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadHome();

    return () => {
      isMounted = false;
    };
  }, [language, reloadKey]);

  function openMangaLobby(manga: MangaSearchResult) {
    router.push({
      pathname: '/manga',
      params: {
        mangaId: manga.id,
        language,
        source: manga.source ?? 'mangadex',
        title: manga.title,
        description: manga.description,
        coverUrl: manga.coverUrl ?? '',
        status: manga.status ?? '',
        year: manga.year ? String(manga.year) : '',
      },
    });
  }

  const spotlightManga = recommendedManga[0] ?? popularManga[0] ?? updatedManga[0];

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        isCompact && styles.compactContent,
        {
          paddingTop: contentInset.top,
          paddingBottom: contentInset.bottom,
          paddingLeft: Spacing.three + contentInset.left,
          paddingRight: Spacing.three + contentInset.right,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, isCompact && styles.compactHero]}>
        <View style={styles.eyebrowRow}>
          <View style={styles.liveDot} />
          <ThemedText type="code" style={styles.eyebrowText}>
            DESCUBRE · LEE · GUARDA
          </ThemedText>
        </View>
        <ThemedText type="title" style={[styles.title, isCompact && styles.compactTitle]}>
          Tu próxima historia empieza aquí
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Encuentra nuevos mangas, revisa los últimos capítulos y vuelve a tus favoritos desde un
          solo lugar.
        </ThemedText>
        <View style={styles.heroActions}>
          <PrimaryButton label="Explorar catálogo" onPress={() => router.push('/reader')} />
          <SecondaryButton label="Ver mis mangas" onPress={() => router.push('/library')} />
        </View>
      </View>

      <LanguageSelector language={language} onChange={setLanguage} />

      {error && <ErrorPanel message={error} onRetry={() => setReloadKey((value) => value + 1)} />}

      {isLoading ? (
        <HomeLoadingState />
      ) : (
        <>
          {spotlightManga && (
            <SpotlightCard
              isCompact={isCompact}
              manga={spotlightManga}
              onPress={() => openMangaLobby(spotlightManga)}
            />
          )}

          <QuickActions />

          <MangaRail
            kind="updated"
            eyebrow="RECIÉN LLEGADOS"
            title="Actualizaciones recientes"
            subtitle="Nuevos capítulos y títulos actualizados en tu idioma de lectura."
            manga={updatedManga}
            onPress={openMangaLobby}
          />
          <MangaRail
            kind="popular"
            eyebrow="TENDENCIAS"
            title="Lo más popular"
            subtitle="Las historias que más lectores están siguiendo ahora."
            manga={popularManga}
            onPress={openMangaLobby}
          />
          <MangaRail
            kind="recommended"
            eyebrow="PARA DESCUBRIR"
            title="Recomendados para ti"
            subtitle="Una selección variada entre novedades y favoritos de la comunidad."
            manga={recommendedManga}
            onPress={openMangaLobby}
          />
        </>
      )}
    </ScrollView>
  );
}

function LanguageSelector({
  language,
  onChange,
}: {
  language: MangaLanguage;
  onChange: (language: MangaLanguage) => void;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.languagePanel}>
      <View style={styles.languageHeading}>
        <View style={styles.languageHeadingText}>
          <ThemedText type="smallBold">Idioma del catálogo</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Todo el inicio se adapta a tu selección.
          </ThemedText>
        </View>
        <ThemedText type="code" themeColor="textSecondary">
          {language.toUpperCase()}
        </ThemedText>
      </View>

      <View style={styles.languageRow}>
        {MANGA_LANGUAGES.map((item) => {
          const isSelected = language === item.code;

          return (
            <Pressable
              key={item.code}
              accessibilityLabel={`Mostrar mangas en ${item.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onChange(item.code)}
              style={({ pressed }) => [
                styles.languageChip,
                isSelected && styles.languageChipSelected,
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="smallBold"
                style={isSelected && styles.primaryText}
                numberOfLines={1}>
                {item.label}
              </ThemedText>
              <ThemedText
                type="code"
                style={isSelected ? styles.primaryText : styles.languageCode}
                numberOfLines={1}>
                {item.code.toUpperCase()}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

function SpotlightCard({
  isCompact,
  manga,
  onPress,
}: {
  isCompact: boolean;
  manga: MangaSearchResult;
  onPress: () => void;
}) {
  return (
    <View style={styles.spotlight}>
      <View style={[styles.spotlightContent, isCompact && styles.compactSpotlightContent]}>
        <View style={styles.spotlightLabel}>
          <View style={styles.spotlightDot} />
          <ThemedText type="code" style={styles.spotlightLabelText}>
            DESTACADO DE HOY
          </ThemedText>
        </View>
        <ThemedText
          type="subtitle"
          style={[styles.spotlightTitle, isCompact && styles.compactSpotlightTitle]}
          numberOfLines={2}>
          {manga.title || 'Una historia por descubrir'}
        </ThemedText>
        <ThemedText
          type="small"
          style={styles.spotlightDescription}
          numberOfLines={isCompact ? 2 : 3}>
          {manga.description || 'Abre la ficha para conocer esta historia y sus capítulos.'}
        </ThemedText>
        <View style={styles.spotlightMeta}>
          <DarkPill text={getSourceLabel(manga.source)} />
          {manga.year && <DarkPill text={String(manga.year)} />}
          {manga.status && <DarkPill text={manga.status} />}
        </View>
        <Pressable
          accessibilityLabel={`Abrir ${manga.title || 'manga destacado'}`}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.spotlightButton, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.primaryText}>
            Ver manga
          </ThemedText>
          <ThemedText type="smallBold" style={styles.primaryText}>
            →
          </ThemedText>
        </Pressable>
      </View>

      <View
        style={[
          styles.spotlightCoverFrame,
          isCompact && styles.compactSpotlightCoverFrame,
        ]}>
        {manga.coverUrl ? (
          <Image source={{ uri: manga.coverUrl }} style={styles.spotlightCover} contentFit="cover" />
        ) : (
          <CoverPlaceholder />
        )}
      </View>
    </View>
  );
}

function QuickActions() {
  return (
    <View style={styles.quickActions}>
      <QuickAction
        index="01"
        title="Explorar catálogo"
        description="Busca por título y género"
        onPress={() => router.push('/reader')}
      />
      <QuickAction
        index="02"
        title="Mi biblioteca"
        description="Continúa tus lecturas"
        onPress={() => router.push('/library')}
      />
      <QuickAction
        index="03"
        title="Más fuentes"
        description="Descubre otros catálogos"
        onPress={() => router.push('/scrapers')}
      />
    </View>
  );
}

function QuickAction({
  description,
  index,
  onPress,
  title,
}: {
  description: string;
  index: string;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
      <ThemedText type="code" style={styles.quickActionIndex}>
        {index}
      </ThemedText>
      <View style={styles.quickActionText}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {description}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" themeColor="textSecondary">
        →
      </ThemedText>
    </Pressable>
  );
}

function MangaRail({
  eyebrow,
  kind,
  manga,
  onPress,
  subtitle,
  title,
}: {
  eyebrow: string;
  kind: RailKind;
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
          <ThemedText type="code" style={styles.sectionEyebrow}>
            {eyebrow}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.railTitle}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.railSubtitle}>
            {subtitle}
          </ThemedText>
        </View>

        <View style={styles.railActions}>
          <Pressable
            accessibilityLabel={`Ver todos: ${title}`}
            accessibilityRole="button"
            onPress={() => router.push('/reader')}
            style={({ pressed }) => [styles.viewAllButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Ver todo
            </ThemedText>
          </Pressable>
          {manga.length > 0 && (
            <View style={styles.railControls}>
              <RailButton label={`Desplazar ${title} a la izquierda`} onPress={() => slide('left')}>
                ←
              </RailButton>
              <RailButton label={`Desplazar ${title} a la derecha`} onPress={() => slide('right')}>
                →
              </RailButton>
            </View>
          )}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={manga}
        keyExtractor={(item) => `${item.source ?? 'mangadex'}:${item.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mangaList}
        decelerationRate="fast"
        ListEmptyComponent={<EmptyRail />}
        onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        snapToAlignment="start"
        snapToInterval={MANGA_CARD_STEP}
        renderItem={({ index, item }) => (
          <MangaCard
            index={index}
            kind={kind}
            manga={item}
            onPress={() => onPress(item)}
          />
        )}
      />
    </View>
  );
}

function RailButton({
  children,
  label,
  onPress,
}: {
  children: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.railButton, pressed && styles.pressed]}>
      <ThemedText type="smallBold">{children}</ThemedText>
    </Pressable>
  );
}

function MangaCard({
  index,
  kind,
  manga,
  onPress,
}: {
  index: number;
  kind: RailKind;
  manga: MangaSearchResult;
  onPress: () => void;
}) {
  const badge = kind === 'popular' ? `#${index + 1}` : kind === 'updated' ? 'NUEVO' : 'DESCUBRE';

  return (
    <Pressable
      accessibilityLabel={`Abrir ${manga.title || 'manga'}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.mangaCard, pressed && styles.pressed]}>
      <View style={styles.coverFrame}>
        {manga.coverUrl ? (
          <Image source={{ uri: manga.coverUrl }} style={styles.cover} contentFit="cover" />
        ) : (
          <CoverPlaceholder />
        )}
        <View style={[styles.cardBadge, kind === 'updated' && styles.cardBadgeFresh]}>
          <ThemedText type="code" style={styles.cardBadgeText}>
            {badge}
          </ThemedText>
        </View>
      </View>
      <View style={styles.cardBody}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {manga.title || 'Sin título'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {manga.description || 'Abre la ficha para conocer más sobre esta historia.'}
        </ThemedText>
        <View style={styles.metaRow}>
          <Pill text={getSourceLabel(manga.source)} />
          {manga.year && <Pill text={String(manga.year)} />}
        </View>
      </View>
    </Pressable>
  );
}

function CoverPlaceholder() {
  return (
    <View style={styles.coverPlaceholder}>
      <ThemedText type="code" themeColor="textSecondary">
        SIN PORTADA
      </ThemedText>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
      <ThemedText type="smallBold" style={styles.primaryText}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.primaryText}>
        →
      </ThemedText>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <ThemedView type="backgroundElement" style={styles.errorPanel}>
      <View style={styles.errorText}>
        <ThemedText type="smallBold">No pudimos actualizar el inicio</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      </View>
      <Pressable
        accessibilityLabel="Reintentar cargar el inicio"
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
        <ThemedText type="smallBold" style={styles.primaryText}>
          Reintentar
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function HomeLoadingState() {
  return (
    <View accessibilityLabel="Cargando contenido del inicio" accessibilityRole="progressbar" style={styles.loadingState}>
      <ThemedView type="backgroundElement" style={styles.loadingSpotlight}>
        <ActivityIndicator color="#2364d2" />
        <View style={styles.loadingText}>
          <ThemedText type="smallBold">Preparando recomendaciones</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Buscando novedades y mangas populares…
          </ThemedText>
        </View>
      </ThemedView>
      <View style={styles.loadingCards}>
        {[0, 1, 2, 3].map((item) => (
          <ThemedView key={item} type="backgroundElement" style={styles.loadingCard} />
        ))}
      </View>
    </View>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View style={styles.pill}>
      <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
        {text.toUpperCase()}
      </ThemedText>
    </View>
  );
}

function DarkPill({ text }: { text: string }) {
  return (
    <View style={styles.darkPill}>
      <ThemedText type="code" style={styles.darkPillText} numberOfLines={1}>
        {text.toUpperCase()}
      </ThemedText>
    </View>
  );
}

function EmptyRail() {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyRail}>
      <ThemedText type="smallBold">Sin resultados por ahora</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Prueba otro idioma o vuelve a intentarlo más tarde.
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
    gap: Spacing.five,
  },
  compactContent: {
    gap: Spacing.four,
  },
  hero: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  compactHero: {
    paddingTop: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2364d2',
  },
  eyebrowText: {
    color: '#2364d2',
    letterSpacing: 0.8,
  },
  title: {
    maxWidth: 680,
    fontSize: 48,
    lineHeight: 52,
  },
  compactTitle: {
    fontSize: 34,
    lineHeight: 38,
  },
  subtitle: {
    maxWidth: 650,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  primaryButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.16)',
  },
  primaryText: {
    color: '#ffffff',
  },
  languagePanel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.22)',
  },
  languageHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  languageHeadingText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  languageChip: {
    minWidth: 112,
    minHeight: 50,
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  languageChipSelected: {
    backgroundColor: '#2364d2',
  },
  languageCode: {
    color: '#2364d2',
  },
  spotlight: {
    minHeight: 292,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: Spacing.four,
    backgroundColor: '#111827',
  },
  spotlightContent: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  compactSpotlightContent: {
    gap: Spacing.one,
    padding: Spacing.three,
  },
  spotlightLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  spotlightDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#60a5fa',
  },
  spotlightLabelText: {
    color: '#93c5fd',
    letterSpacing: 0.6,
  },
  spotlightTitle: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 35,
  },
  compactSpotlightTitle: {
    fontSize: 22,
    lineHeight: 26,
  },
  spotlightDescription: {
    maxWidth: 460,
    color: '#cbd5e1',
  },
  spotlightMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  spotlightButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  spotlightCoverFrame: {
    width: 210,
    minHeight: 292,
    backgroundColor: '#1f2937',
  },
  compactSpotlightCoverFrame: {
    width: 124,
    minHeight: 292,
  },
  spotlightCover: {
    width: '100%',
    height: '100%',
  },
  darkPill: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  darkPillText: {
    color: '#dbeafe',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  quickAction: {
    minWidth: 220,
    minHeight: 76,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.28)',
    backgroundColor: 'rgba(120, 130, 150, 0.08)',
  },
  quickActionIndex: {
    color: '#2364d2',
  },
  quickActionText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  rail: {
    gap: Spacing.three,
  },
  railTop: {
    minHeight: 76,
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
  sectionEyebrow: {
    color: '#2364d2',
    letterSpacing: 0.6,
  },
  railTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  railSubtitle: {
    maxWidth: 590,
  },
  railActions: {
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  viewAllButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  railControls: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  railButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.16)',
  },
  mangaList: {
    gap: MANGA_CARD_GAP,
    paddingRight: Spacing.three,
    paddingBottom: Spacing.one,
  },
  mangaCard: {
    width: MANGA_CARD_WIDTH,
    minHeight: 352,
    overflow: 'hidden',
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 130, 150, 0.24)',
    backgroundColor: 'rgba(120, 130, 150, 0.10)',
  },
  coverFrame: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.12)',
  },
  cardBadge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
  },
  cardBadgeFresh: {
    backgroundColor: '#147d55',
  },
  cardBadgeText: {
    color: '#ffffff',
  },
  cardBody: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.two,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: 'auto',
  },
  pill: {
    minHeight: 24,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.16)',
  },
  loadingState: {
    gap: Spacing.three,
  },
  loadingSpotlight: {
    minHeight: 160,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  loadingText: {
    gap: Spacing.one,
  },
  loadingCards: {
    flexDirection: 'row',
    gap: Spacing.two,
    overflow: 'hidden',
  },
  loadingCard: {
    width: MANGA_CARD_WIDTH,
    height: 300,
    borderRadius: Spacing.three,
  },
  emptyRail: {
    width: 280,
    minHeight: 120,
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  errorPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderLeftWidth: 4,
    borderLeftColor: '#b72d3b',
  },
  errorText: {
    flex: 1,
    minWidth: 220,
    gap: Spacing.one,
  },
  retryButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  pressed: {
    opacity: 0.72,
  },
});

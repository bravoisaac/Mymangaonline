import { SymbolView } from 'expo-symbols';
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
  EXTENSIONS_INDEX_URL,
  buildExtensionStats,
  fetchExtensions,
  getDisplayName,
  type MangaExtension,
} from '@/services/extensions';

const API_FIELDS = [
  ['name', 'Nombre visible de la extension'],
  ['pkg', 'Paquete Android de la extension'],
  ['apk', 'Archivo instalable disponible en el repo'],
  ['lang', 'Idioma principal de la extension'],
  ['code', 'Version code numerico'],
  ['version', 'Version legible'],
  ['sources[]', 'Fuentes incluidas con name, lang, id y baseUrl'],
  ['nsfw', '1 indica contenido adulto, 0 indica contenido seguro'],
] as const;

export default function ApiInspectionScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const [extensions, setExtensions] = useState<MangaExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
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

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => buildExtensionStats(extensions), [extensions]);
  const contentInset = {
    top: Platform.select({ web: 92, default: safeAreaInsets.top + Spacing.three }),
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.five,
    left: safeAreaInsets.left,
    right: safeAreaInsets.right,
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
        <ThemedText type="small" themeColor="textSecondary">
          Inspeccionando API...
        </ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle" style={styles.centerText}>
          Error de API
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {error}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentInset={contentInset}
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
          API Keiyoushi
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          El endpoint es un indice de extensiones y fuentes. Sirve para listar conectores, abrir
          sitios de origen y descargar APKs, no entrega capitulos ni imagenes de manga directamente.
        </ThemedText>
      </View>

      <View style={styles.metrics}>
        <Metric label="Extensiones" value={stats.totalExtensions} />
        <Metric label="Fuentes" value={stats.totalSources} />
        <Metric label="Seguras" value={stats.safeExtensions} />
        <Metric label="NSFW" value={stats.nsfwExtensions} />
      </View>

      <ThemedView type="backgroundElement" style={styles.panel}>
        <View style={styles.panelHeader}>
          <ThemedText type="smallBold">Campos detectados</ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            JSON
          </ThemedText>
        </View>
        <View style={styles.fieldList}>
          {API_FIELDS.map(([field, description]) => (
            <View key={field} style={styles.fieldRow}>
              <ThemedText type="code" style={styles.fieldName}>
                {field}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.fieldDescription}>
                {description}
              </ThemedText>
            </View>
          ))}
        </View>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.panel}>
        <View style={styles.panelHeader}>
          <ThemedText type="smallBold">Idiomas principales</ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            TOP 12
          </ThemedText>
        </View>
        <View style={styles.languageGrid}>
          {stats.languages.slice(0, 12).map((language) => (
            <View key={language.lang} style={styles.languageItem}>
              <ThemedText type="code">{language.lang.toUpperCase()}</ThemedText>
              <ThemedText type="smallBold">{language.count}</ThemedText>
            </View>
          ))}
        </View>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.panel}>
        <View style={styles.panelHeader}>
          <ThemedText type="smallBold">Extensiones con mas fuentes</ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            TOP 8
          </ThemedText>
        </View>
        <View style={styles.topList}>
          {stats.topSources.map((extension, index) => (
            <View key={extension.pkg} style={styles.topRow}>
              <View style={styles.rank}>
                <ThemedText type="code">{index + 1}</ThemedText>
              </View>
              <View style={styles.topInfo}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {getDisplayName(extension)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {extension.pkg}
                </ThemedText>
              </View>
              <ThemedText type="smallBold">{extension.sources.length}</ThemedText>
            </View>
          ))}
        </View>
      </ThemedView>

      <Pressable style={styles.endpointButton} onPress={() => Linking.openURL(EXTENSIONS_INDEX_URL)}>
        <SymbolView
          tintColor="#ffffff"
          name={{ ios: 'arrow.up.right.square', android: 'link', web: 'link' }}
          size={16}
        />
        <ThemedText type="smallBold" style={styles.endpointText}>
          Abrir endpoint original
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <ThemedView type="backgroundElement" style={styles.metric}>
      <ThemedText type="subtitle" style={styles.metricValue}>
        {value}
      </ThemedText>
      <ThemedText type="code" themeColor="textSecondary">
        {label.toUpperCase()}
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
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metric: {
    minWidth: 150,
    flex: 1,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  metricValue: {
    fontSize: 26,
    lineHeight: 32,
  },
  panel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  panelHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  fieldList: {
    gap: Spacing.two,
  },
  fieldRow: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(120, 130, 150, 0.35)',
  },
  fieldName: {
    color: '#2364d2',
  },
  fieldDescription: {
    flexShrink: 1,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  languageItem: {
    minWidth: 88,
    minHeight: 56,
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  topList: {
    gap: Spacing.two,
  },
  topRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rank: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  topInfo: {
    flex: 1,
    minWidth: 0,
  },
  endpointButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  endpointText: {
    color: '#ffffff',
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
});

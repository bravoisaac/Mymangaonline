import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
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
  createEmailAccount,
  getCurrentUser,
  getSavedMangas,
  loginWithEmail,
  loginWithGoogleProfile,
  logoutUser,
  removeSavedManga,
  type LocalUser,
  type SavedManga,
} from '@/services/user-library';

type AuthMode = 'login' | 'create';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

function loadGoogleIdentityServices() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google solo esta disponible en navegador web'));
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Google')), { once: true });
      return;
    }

    const script = document.createElement('script');

    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google'));

    document.head.appendChild(script);
  });
}

export default function LibraryScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();
  const [user, setUser] = useState<LocalUser | null>(() => getCurrentUser());
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [savedMangas, setSavedMangas] = useState<SavedManga[]>(() => (user ? getSavedMangas(user.id) : []));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const [googleTokenClient, setGoogleTokenClient] = useState<GoogleTokenClient | null>(null);

  const contentInset = useMemo(
    () => ({
      top: Platform.select({ web: 92, default: safeAreaInsets.top + Spacing.three }),
      bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.five,
      left: safeAreaInsets.left,
      right: safeAreaInsets.right,
    }),
    [safeAreaInsets],
  );

  async function handleEmailSubmit() {
    try {
      setIsSubmitting(true);
      const nextUser =
        authMode === 'create'
          ? await createEmailAccount(name, email, password)
          : await loginWithEmail(email, password);

      setUser(nextUser);
      setSavedMangas(getSavedMangas(nextUser.id));
      setError(null);
      setPassword('');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'No se pudo iniciar sesion');
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleGoogleToken = useCallback(async (response: GoogleTokenResponse) => {
    try {
      if (response.error) {
        throw new Error(response.error_description || response.error);
      }

      if (!response.access_token) {
        throw new Error('Google no devolvio acceso a la cuenta');
      }

      const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: {
          Authorization: `Bearer ${response.access_token}`,
        },
      });

      if (!profileResponse.ok) {
        throw new Error('No se pudo leer el perfil de Google');
      }

      const profile = (await profileResponse.json()) as GoogleUserInfo;

      if (!profile.email) {
        throw new Error('La cuenta de Google no entrego correo');
      }

      const nextUser = loginWithGoogleProfile({
        email: profile.email,
        name: profile.name,
        pictureUrl: profile.picture,
        googleId: profile.sub,
      });

      setUser(nextUser);
      setName(nextUser.name);
      setEmail(nextUser.email);
      setSavedMangas(getSavedMangas(nextUser.id));
      setGoogleStatus('Cuenta de Google conectada');
      setError(null);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'No se pudo entrar con Google');
    }
  }, []);

  useEffect(() => {
    if (user || !GOOGLE_CLIENT_ID || Platform.OS !== 'web') {
      return;
    }

    let isCurrentRequest = true;
    const googleClientId = GOOGLE_CLIENT_ID;

    async function connectGoogle() {
      try {
        await loadGoogleIdentityServices();

        if (!isCurrentRequest || !window.google?.accounts?.oauth2) {
          return;
        }

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          callback: (response) => {
            void handleGoogleToken(response);
          },
        });

        setGoogleTokenClient(tokenClient);
        setIsGoogleReady(true);
        setGoogleStatus('Google listo para abrir la autenticacion');
      } catch (googleError) {
        if (isCurrentRequest) {
          setGoogleStatus(googleError instanceof Error ? googleError.message : 'No se pudo cargar Google');
        }
      }
    }

    void connectGoogle();

    return () => {
      isCurrentRequest = false;
    };
  }, [handleGoogleToken, user]);

  function handleGoogleLogin() {
    if (!GOOGLE_CLIENT_ID) {
      setError('Configura EXPO_PUBLIC_GOOGLE_CLIENT_ID para entrar con Google real');
      return;
    }

    if (Platform.OS !== 'web') {
      setError('El login con Google esta disponible en navegador web');
      return;
    }

    if (!isGoogleReady || !googleTokenClient) {
      setError('Google todavia esta cargando. Intenta de nuevo en unos segundos.');
      return;
    }

    setError(null);
    googleTokenClient.requestAccessToken({ prompt: 'select_account' });
  }

  function handleLogout() {
    logoutUser();
    setUser(null);
    setSavedMangas([]);
  }

  function openManga(manga: SavedManga) {
    router.push({
      pathname: '/manga',
      params: {
        mangaId: manga.id,
        language: manga.language,
      },
    });
  }

  function removeManga(mangaId: string) {
    if (!user) {
      return;
    }

    setSavedMangas(removeSavedManga(user.id, mangaId));
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
          Mis mangas
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          Guarda mangas en tu biblioteca local y vuelve a abrirlos desde aqui.
        </ThemedText>
      </View>

      {!user ? (
        <ThemedView type="backgroundElement" style={styles.loginPanel}>
          <View style={styles.loginHeader}>
            <ThemedText type="subtitle" style={styles.panelTitle}>
              {authMode === 'create' ? 'Crear cuenta' : 'Entrar'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Tu sesion queda guardada en este navegador.
            </ThemedText>
          </View>

          <View style={styles.authModeRow}>
            <Pressable
              onPress={() => setAuthMode('login')}
              style={[
                styles.authModeButton,
                authMode === 'login' && styles.authModeButtonActive,
              ]}>
              <ThemedText type="smallBold" style={authMode === 'login' && styles.primaryButtonText}>
                Entrar
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setAuthMode('create')}
              style={[
                styles.authModeButton,
                authMode === 'create' && styles.authModeButtonActive,
              ]}>
              <ThemedText type="smallBold" style={authMode === 'create' && styles.primaryButtonText}>
                Crear cuenta
              </ThemedText>
            </Pressable>
          </View>

          {authMode === 'create' && (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nombre"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="words"
              autoCorrect={false}
              style={[styles.input, { color: theme.text }]}
            />
          )}

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Correo"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={[styles.input, { color: theme.text }]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Contrasena"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType={authMode === 'create' ? 'newPassword' : 'password'}
            onSubmitEditing={() => void handleEmailSubmit()}
            style={[styles.input, { color: theme.text }]}
          />

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Pressable
            disabled={isSubmitting}
            onPress={() => void handleEmailSubmit()}
            style={({ pressed }) => [
              styles.primaryButton,
              isSubmitting && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                {authMode === 'create' ? 'Crear cuenta' : 'Entrar con correo'}
              </ThemedText>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <ThemedText type="code" themeColor="textSecondary">
              O
            </ThemedText>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={handleGoogleLogin}
            style={({ pressed }) => [
              styles.googleButton,
              !GOOGLE_CLIENT_ID && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">Entrar con Google</ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary">
            {GOOGLE_CLIENT_ID
              ? googleStatus ?? 'Google abrira una ventana y creara el usuario con la cuenta elegida.'
              : 'Falta EXPO_PUBLIC_GOOGLE_CLIENT_ID para conectar Google real.'}
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            GOOGLE CREA EL USUARIO AUTOMATICAMENTE
          </ThemedText>
        </ThemedView>
      ) : (
        <>
          <ThemedView type="backgroundElement" style={styles.userPanel}>
            <View style={styles.userSummary}>
              {user.pictureUrl && (
                <Image source={{ uri: user.pictureUrl }} style={styles.userAvatar} contentFit="cover" />
              )}
              <View style={styles.userInfo}>
                <ThemedText type="smallBold">Usuario: {user.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {user.email} - {user.provider === 'google' ? 'Google' : 'Correo'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {savedMangas.length} mangas guardados
                </ThemedText>
              </View>
            </View>
            <Pressable onPress={handleLogout} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Cerrar sesion
              </ThemedText>
            </Pressable>
          </ThemedView>

          {savedMangas.length > 0 ? (
            <View style={styles.libraryGrid}>
              {savedMangas.map((manga) => (
                <ThemedView key={manga.id} type="backgroundElement" style={styles.mangaCard}>
                  <Pressable onPress={() => openManga(manga)} style={({ pressed }) => pressed && styles.pressed}>
                    <Image source={{ uri: manga.coverUrl }} style={styles.cover} contentFit="cover" />
                  </Pressable>
                  <View style={styles.mangaInfo}>
                    <Pressable onPress={() => openManga(manga)} style={({ pressed }) => pressed && styles.pressed}>
                      <ThemedText type="smallBold" numberOfLines={2}>
                        {manga.title || 'Sin titulo'}
                      </ThemedText>
                    </Pressable>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                      {manga.description || 'Sin descripcion disponible.'}
                    </ThemedText>
                    <View style={styles.cardFooter}>
                      <View style={styles.pill}>
                        <ThemedText type="code" themeColor="textSecondary">
                          {manga.language.toUpperCase()}
                        </ThemedText>
                      </View>
                      <Pressable onPress={() => removeManga(manga.id)} style={({ pressed }) => pressed && styles.pressed}>
                        <ThemedText type="linkPrimary">Quitar</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                </ThemedView>
              ))}
            </View>
          ) : (
            <ThemedView type="backgroundElement" style={styles.emptyPanel}>
              <ThemedText type="smallBold">Todavia no guardaste mangas</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Abre un lobby de manga y presiona Guardar para agregarlo aqui.
              </ThemedText>
              <Pressable onPress={() => router.push('/reader')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  Explorar mangas
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        </>
      )}
    </ScrollView>
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
  loginPanel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  loginHeader: {
    gap: Spacing.one,
  },
  panelTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
    fontSize: 16,
  },
  authModeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.one,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.14)',
  },
  authModeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  authModeButtonActive: {
    backgroundColor: '#2364d2',
  },
  primaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#2364d2',
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  googleButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.24)',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(120, 130, 150, 0.22)',
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  userPanel: {
    minHeight: 72,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  userInfo: {
    gap: Spacing.one,
  },
  userSummary: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  libraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  mangaCard: {
    flexGrow: 1,
    flexBasis: 240,
    maxWidth: 256,
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.2)',
  },
  mangaInfo: {
    flex: 1,
    minHeight: 128,
    gap: Spacing.one,
  },
  cardFooter: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  pill: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    backgroundColor: 'rgba(120, 130, 150, 0.18)',
  },
  emptyPanel: {
    gap: Spacing.two,
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
});

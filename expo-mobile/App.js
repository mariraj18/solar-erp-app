import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  BackHandler,
  Platform,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { StatusBar } from 'expo-status-bar';

// Configure foreground notifications presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#014025',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for notification!');
      return null;
    }
    try {
      const res = await Notifications.getExpoPushTokenAsync();
      token = res.data;
      console.log('[Expo Mobile] Push token generated:', token);
    } catch (e) {
      console.warn('Error fetching Expo push token:', e);
    }
  } else {
    console.log('Physical device required for Push Notifications');
  }

  return token;
}

// Default to Labour portal (workers see OTP by default; admins can tap 'Admin Sign In')
const DEFAULT_URL = 'http://192.168.0.38:3000/labour';

export default function App() {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_URL);
  const [inputUrl, setInputUrl] = useState(DEFAULT_URL);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  // Initialize Push Notifications
  useEffect(() => {
    registerForPushNotificationsAsync().then((t) => {
      if (t) setExpoPushToken(t);
    });
  }, []);

  // Request native GPS permission upfront so the WebView has access immediately
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          setHasLocationPermission(true);
        } else {
          Alert.alert(
            'GPS Permission Required',
            'Solar ERP needs access to your location to mark labour attendance inside worksite geofences.',
            [{ text: 'OK' }]
          );
        }
      } catch (err) {
        console.warn('Location permission request failed:', err);
      }
    })();
  }, []);

  // Handle Android physical back button
  useEffect(() => {
    if (Platform.OS === 'android') {
      const onBackPress = () => {
        if (showConfig) {
          setShowConfig(false);
          return true;
        }
        if (canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [canGoBack, showConfig]);

  const handleApplyUrl = () => {
    let clean = inputUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    setServerUrl(clean);
    setInputUrl(clean);
    setHasError(false);
    setShowConfig(false);
    setIsLoading(true);
  };

  const handleRetry = () => {
    setHasError(false);
    setIsLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" backgroundColor="#014025" />

      {/* Top Bar for quick server connection settings */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Solar ERP • {serverUrl.replace(/^https?:\/\//, '')}
        </Text>
        <TouchableOpacity
          style={styles.configBtn}
          onPress={() => setShowConfig(!showConfig)}
        >
          <Text style={styles.configBtnText}>{showConfig ? 'Close' : '⚙ Server'}</Text>
        </TouchableOpacity>
      </View>

      {/* Server URL Config Modal / Drawer */}
      {showConfig && (
        <View style={styles.configContainer}>
          <Text style={styles.configLabel}>Server Address (PC IP + Port):</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.urlInput}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="e.g. http://192.168.0.38:3000"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.applyBtn} onPress={handleApplyUrl}>
              <Text style={styles.applyBtnText}>Connect</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.configHint}>
            Make sure your PC server is running (`npx tsx server.ts`) and your phone is on the same Wi-Fi.
          </Text>
        </View>
      )}

      {/* WebView or Error Screen */}
      {hasError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Cannot Connect to Server</Text>
          <Text style={styles.errorSubtext}>
            Unable to reach {serverUrl}.{'\n'}
            {errorMessage ? `Error: ${errorMessage}\n\n` : ''}
            Please check:
          </Text>
          <View style={styles.checklist}>
            <Text style={styles.checkItem}>1. Is the web server running on your PC? (`npx tsx server.ts`)</Text>
            <Text style={styles.checkItem}>2. Is your phone on the same Wi-Fi network?</Text>
            <Text style={styles.checkItem}>3. Did your PC IP change? Current IP: 192.168.0.38</Text>
          </View>
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.changeUrlBtn}
              onPress={() => setShowConfig(true)}
            >
              <Text style={styles.changeUrlBtnText}>Edit Server IP</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: serverUrl }}
          style={styles.webview}
          geolocationEnabled={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          injectedJavaScriptBeforeContentLoaded={`window.EXPO_PUSH_TOKEN = ${JSON.stringify(expoPushToken || '')}; true;`}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
          }}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => {
            setIsLoading(false);
            if (expoPushToken && webViewRef.current) {
              const script = `
                window.EXPO_PUSH_TOKEN = ${JSON.stringify(expoPushToken)};
                window.postMessage(JSON.stringify({ type: 'EXPO_PUSH_TOKEN', token: ${JSON.stringify(expoPushToken)} }), '*');
                true;
              `;
              webViewRef.current.injectJavaScript(script);
            }
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            setIsLoading(false);
            setHasError(true);
            setErrorMessage(nativeEvent.description || 'Connection failed');
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            if (nativeEvent.statusCode >= 400) {
              console.warn('HTTP error: ', nativeEvent.statusCode);
            }
          }}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#014025" />
              <Text style={styles.loadingText}>Connecting to Solar ERP...</Text>
            </View>
          )}
        />
      )}

      {/* Floating loading overlay for initial connection */}
      {isLoading && !hasError && (
        <View style={styles.initialOverlay}>
          <View style={styles.card}>
            <ActivityIndicator size="large" color="#014025" />
            <Text style={styles.brandTitle}>Solar ERP</Text>
            <Text style={styles.loadingSubtext}>Connecting to {serverUrl.replace(/^https?:\/\//, '')}...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#014025',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#01321d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingTop: Platform.OS === 'android' ? 32 : 8,
  },
  headerTitle: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  configBtn: {
    backgroundColor: '#036238',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  configBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  configContainer: {
    backgroundColor: '#022616',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#034a2b',
  },
  configLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    color: '#0F172A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  applyBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 6,
  },
  applyBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  configHint: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 6,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#014025',
  },
  initialOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(1, 64, 37, 0.4)',
  },
  card: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#014025',
    marginTop: 14,
  },
  loadingSubtext: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  checklist: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 10,
    width: '100%',
    marginVertical: 16,
  },
  checkItem: {
    color: '#CBD5E1',
    fontSize: 12,
    marginVertical: 3,
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  retryBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  changeUrlBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  changeUrlBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 14,
  },
});

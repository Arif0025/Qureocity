import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as Notifications from 'expo-notifications';

const WEB_ORIGIN = 'https://qureocity.vercel.app';
const WEB_ENTRY = `${WEB_ORIGIN}/employee`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function isInternalUrl(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname === 'qureocity.vercel.app';
  } catch {
    return rawUrl === 'about:blank' || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:');
  }
}

function WebWorkspace() {
  const webView = useRef<WebView<{}>>(null);
  const canGoBack = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) {
        webView.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, []);

  const onNavigationStateChange = (navigation: WebViewNavigation) => {
    canGoBack.current = navigation.canGoBack;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <WebView<{}>
        ref={webView}
        source={{ uri: WEB_ENTRY }}
        style={styles.webView}
        originWhitelist={['https://*', 'http://*', 'tel:*', 'mailto:*', 'whatsapp:*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        cacheEnabled
        incognito={false}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        startInLoadingState={false}
        onLoadStart={() => { setLoading(true); setLoadFailed(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setLoadFailed(true); }}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= 500) setLoadFailed(true);
        }}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={(request) => {
          if (isInternalUrl(request.url)) return true;
          void Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        onOpenWindow={(event) => {
          const url = event.nativeEvent.targetUrl;
          if (url && !isInternalUrl(url)) void Linking.openURL(url).catch(() => undefined);
        }}
      />
      {loading && !loadFailed ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color="#7A558C" />
        </View>
      ) : null}
      {loadFailed ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Can’t reach QureoCity</Text>
          <Text style={styles.errorCopy}>Check your internet connection and try again.</Text>
          <Text accessibilityRole="button" onPress={() => webView.current?.reload()} style={styles.retry}>Try again</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <WebWorkspace />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF5D8' },
  webView: { flex: 1, backgroundColor: '#FFF5D8' },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5D8' },
  errorOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: '#FFF5D8' },
  errorTitle: { color: '#15130F', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  errorCopy: { color: '#716B5E', fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: 'center' },
  retry: { overflow: 'hidden', color: '#FFFDEF', fontSize: 14, fontWeight: '700', marginTop: 20, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 22, backgroundColor: '#15130F' },
});

/** Full-screen QR scanner in a modal. Calls `onScan` once with the decoded text. */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';

type Props = { open: boolean; onClose: () => void; onScan: (data: string) => void; title: string };

export function QrScanner({ open, ...rest }: Props) {
  // Mounted only while open, so each opening starts with a fresh "scanned" flag.
  return open ? <Scanner {...rest} /> : null;
}

function Scanner({ onClose, onScan, title }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const done = useRef(false);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (done.current || !data) return;
              done.current = true;
              onScan(data);
            }}
          />
        ) : (
          <View style={styles.center}>
            <Text style={{ color: '#fff', textAlign: 'center' }}>{t('access.cameraNeeded')}</Text>
            <Button title={t('access.allowCamera')} onPress={() => void request()} />
          </View>
        )}
        <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
          <Text variant="h3" style={{ color: '#fff', flex: 1 }}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <X size={22} color="#fff" />
          </Pressable>
        </View>
        {permission?.granted ? (
          <View pointerEvents="none" style={styles.frameWrap}>
            <View style={styles.frame} />
            <Text style={{ color: '#fff', marginTop: 18, textAlign: 'center' }}>{t('access.pointCamera')}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  top: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  frameWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 40 },
  frame: { width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: '#fff' },
});

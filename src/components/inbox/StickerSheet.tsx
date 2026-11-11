/**
 * Picks a sticker to send: one sent before or seen in a chat (sent again by its
 * link, nothing uploaded), or a new one made from a photo on the phone
 * (square-cropped to a 512×512 WebP under 100 KB, as WhatsApp requires).
 * A long press takes a sticker off the "sent before" list.
 */
import { Image } from 'expo-image';
import { ImagePlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { pickStickerImage, prepareSticker } from '@/services/inbox/media';
import { forgetSticker, stickersFor } from '@/services/inbox/stickers';
import type { UploadSource } from '@/services/inbox/upload';
import { useTheme } from '@/theme/ThemeProvider';

export function StickerSheet({
  acct,
  onSend,
  onClose,
}: {
  acct: string;
  onSend: (from: { link: string } | { file: UploadSource }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [links, setLinks] = useState(() => stickersFor(acct));
  const [making, setMaking] = useState(false);

  const fromPhone = async () => {
    const picked = await pickStickerImage().catch(() => null);
    if (!picked) return;
    setMaking(true);
    try {
      const file = await prepareSticker(picked);
      if (!file) return showAlert(t('inbox.cannotSend'), t('inbox.stickerTooBig'));
      onSend({ file });
    } catch (e) {
      showAlert(t('inbox.cannotSend'), e instanceof Error ? e.message : '');
    } finally {
      setMaking(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('inbox.stickers')} locked={making}>
      <Button
        title={t('inbox.stickerFromPhone')}
        variant="secondary"
        icon={making ? <ActivityIndicator color={colors.primary} /> : <ImagePlus size={16} color={colors.primary} />}
        onPress={() => void fromPhone()}
        disabled={making}
      />
      {links.length ? (
        <View style={styles.grid}>
          {links.map((link) => (
            <Pressable
              key={link}
              onPress={() => onSend({ link })}
              onLongPress={() => {
                forgetSticker(acct, link);
                setLinks(stickersFor(acct));
              }}
              style={({ pressed }) => [styles.cell, { borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
              accessibilityRole="button"
              accessibilityLabel={t('inbox.sendSticker')}
            >
              <Image source={{ uri: link }} style={styles.sticker} contentFit="contain" />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="muted" center style={{ marginTop: 16 }}>
          {t('inbox.noStickers')}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
  cell: { width: 84, height: 84, padding: 6 },
  sticker: { width: '100%', height: '100%' },
});

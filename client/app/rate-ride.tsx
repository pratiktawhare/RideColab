// ─────────────────────────────────────────────────────────────
// Rate Ride Screen (Phase 10)
// Allows rating a completed trip (1-5 stars, tags, comment)
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { ratingsApi } from '@/services/api';
import { AppButton } from '@/components/AppButton';

const DEFAULT_TAGS = [
  'Punctual',
  'Safe Driver',
  'Clean Vehicle',
  'Friendly',
  'Good Communicator',
  'Late',
  'Unsafe Driving',
  'Rude',
];

export default function RateRideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    bookingId: string;
    revieweeName?: string;
    revieweeRole?: string;
  }>();

  const { theme } = useThemeStore();
  const c = theme.colors;

  const [rating, setRating] = useState<number>(5);
  const [availableTags, setAvailableTags] = useState<string[]>(DEFAULT_TAGS);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loadingTags, setLoadingTags] = useState<boolean>(true);

  const revieweeName = params.revieweeName ?? 'Co-commuter';
  const revieweeRole = params.revieweeRole ?? 'rider';

  useEffect(() => {
    ratingsApi
      .getTags()
      .then((tags) => {
        if (tags && tags.length > 0) setAvailableTags(tags);
      })
      .catch(() => {
        // Fallback to default tags
      })
      .finally(() => setLoadingTags(false));
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = async () => {
    if (!params.bookingId) {
      Alert.alert('Error', 'Missing booking ID');
      return;
    }
    if (rating < 1 || rating > 5) {
      Alert.alert('Error', 'Please select a star rating between 1 and 5');
      return;
    }

    setSubmitting(true);
    try {
      await ratingsApi.rate(params.bookingId, {
        rating,
        tags: selectedTags,
        comment: comment.trim() || undefined,
      });

      Alert.alert(
        'Thank You! ⭐',
        `Your rating helps build trust in the ${revieweeName} and the RideColab community.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'Failed to submit rating';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Rate Your Ride</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* User Card */}
        <View style={[styles.userCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={styles.avatarEmoji}>{revieweeRole === 'rider' ? '🚗' : '👤'}</Text>
          <Text style={[styles.userName, { color: c.text }]}>
            How was your trip with {revieweeName}?
          </Text>
          <Text style={[styles.userSub, { color: c.textSecondary }]}>
            Ratings are anonymous to the co-commuter and help calculate their Trust Score.
          </Text>
        </View>

        {/* Star Rating Section */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>Rating</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = star <= rating;
              return (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  style={styles.starBtn}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.starEmoji, { opacity: filled ? 1 : 0.3 }]}>
                    ⭐
                  </Text>
                  <Text
                    style={[
                      styles.starLabel,
                      { color: filled ? c.accent : c.textMuted },
                    ]}
                  >
                    {star}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.ratingDescription, { color: c.textSecondary }]}>
            {rating === 5 && '🌟 Excellent experience'}
            {rating === 4 && '👍 Good and comfortable'}
            {rating === 3 && '👌 Average trip'}
            {rating === 2 && '👎 Below expectations'}
            {rating === 1 && '⚠️ Poor experience'}
          </Text>
        </View>

        {/* Tags Section */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>Tags (Select all that apply)</Text>
          {loadingTags ? (
            <ActivityIndicator color={c.accent} size="small" />
          ) : (
            <View style={styles.tagsContainer}>
              {availableTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                const isNegative = ['Late', 'Unsafe Driving', 'Rude'].includes(tag);
                const activeColor = isNegative ? c.danger : c.accent;
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: isSelected ? activeColor : c.inputBg,
                        borderColor: isSelected ? activeColor : c.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagText,
                        { color: isSelected ? '#FFFFFF' : c.text },
                      ]}
                    >
                      {isSelected ? '✓ ' : ''}{tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Comment Section */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>
            Additional Comments (Optional)
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: c.inputBg,
                borderColor: c.border,
                color: c.text,
              },
            ]}
            placeholder="Share feedback to help them improve..."
            placeholderTextColor={c.textMuted}
            multiline
            numberOfLines={4}
            maxLength={500}
            value={comment}
            onChangeText={setComment}
          />
          <Text style={[styles.charCount, { color: c.textMuted }]}>
            {comment.length} / 500
          </Text>
        </View>

        {/* Submit Button */}
        <View style={{ marginTop: 16 }}>
          <AppButton
            label="Submit Rating"
            variant="primary"
            loading={submitting}
            onPress={handleSubmit}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16, gap: 16 },
  userCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    gap: 6,
  },
  avatarEmoji: { fontSize: 44, marginBottom: 4 },
  userName: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  userSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionLabel: { fontSize: 14, fontWeight: '700' },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  starBtn: { alignItems: 'center', gap: 4, padding: 6 },
  starEmoji: { fontSize: 36 },
  starLabel: { fontSize: 12, fontWeight: '700' },
  ratingDescription: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tagText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 90,
  },
  charCount: { alignSelf: 'flex-end', fontSize: 12 },
});

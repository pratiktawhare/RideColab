// ─────────────────────────────────────────────────────────────
// Public User Profile Screen (Phase 10)
// Shows trust score, badge, reviews, and block/report actions
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { trustApi, ratingsApi, PublicUserProfile, Review } from '@/services/api';
import { AppButton } from '@/components/AppButton';

const BADGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  New:      { bg: '#F3F4F6', text: '#4B5563', label: '🌱 New Member' },
  Regular:  { bg: '#E0E7FF', text: '#3730A3', label: '⭐ Regular' },
  Trusted:  { bg: '#D1FAE5', text: '#065F46', label: '🛡️ Trusted' },
  Verified: { bg: '#FEF3C7', text: '#92400E', label: '🏆 Verified' },
};

const REPORT_REASONS = [
  { key: 'unsafe_driving', label: '⚠️ Unsafe Driving' },
  { key: 'harassment', label: '🚫 Harassment / Abuse' },
  { key: 'no_show', label: '⏰ No Show' },
  { key: 'wrong_fare', label: '💰 Overcharging / Wrong Fare' },
  { key: 'inappropriate_behaviour', label: '🛑 Inappropriate Behaviour' },
  { key: 'other', label: '📝 Other' },
];

export default function UserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { theme } = useThemeStore();
  const c = theme.colors;

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [blockLoading, setBlockLoading] = useState<boolean>(false);

  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('unsafe_driving');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [reportSubmitting, setReportSubmitting] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [profData, ratingsData] = await Promise.all([
        trustApi.getPublicProfile(id),
        ratingsApi.getUserRatings(id).catch(() => ({ reviews: [], total: 0, page: 1 })),
      ]);
      setProfile(profData);
      setReviews(ratingsData.reviews);
    } catch (err: unknown) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to load user profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleBlock = async () => {
    if (!id) return;
    const action = isBlocked ? 'Unblock' : 'Block';
    Alert.alert(
      `${action} User?`,
      isBlocked
        ? 'They will be able to see and request your rides again.'
        : 'They will no longer be able to match or book rides with you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setBlockLoading(true);
            try {
              if (isBlocked) {
                await trustApi.unblockUser(id);
                setIsBlocked(false);
                Alert.alert('User Unblocked', 'You can now match with this user again.');
              } else {
                await trustApi.blockUser(id);
                setIsBlocked(true);
                Alert.alert('User Blocked', 'This user is blocked from future rides.');
              }
            } catch (err: unknown) {
              Alert.alert('Error', (err as Error).message ?? 'Action failed');
            } finally {
              setBlockLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleFileReport = async () => {
    if (!id) return;
    setReportSubmitting(true);
    try {
      await trustApi.fileReport({
        reported_id: id,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setReportModalVisible(false);
      setReportDetails('');
      Alert.alert(
        'Report Submitted',
        'Thank you. Our safety moderation team will review this report.',
      );
    } catch (err: unknown) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to submit report');
    } finally {
      setReportSubmitting(false);
    }
  };

  const getBadgeTier = (score: number) => {
    if (score >= 76) return BADGE_COLORS.Verified;
    if (score >= 51) return BADGE_COLORS.Trusted;
    if (score >= 21) return BADGE_COLORS.Regular;
    return BADGE_COLORS.New;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[styles.subText, { color: c.textSecondary }]}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={[styles.title, { color: c.text }]}>Profile Not Found</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: c.accent, fontWeight: '700' }}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const badgeInfo = getBadgeTier(profile.trust_score);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Commuter Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={[styles.profileName, { color: c.text }]}>{profile.name}</Text>

          {/* Badge Pill */}
          <View style={[styles.badgePill, { backgroundColor: badgeInfo.bg }]}>
            <Text style={[styles.badgeText, { color: badgeInfo.text }]}>{badgeInfo.label}</Text>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: c.inputBg }]}>
              <Text style={[styles.statVal, { color: c.text }]}>{profile.trust_score}</Text>
              <Text style={[styles.statLabel, { color: c.textSecondary }]}>Trust Score</Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: c.inputBg }]}>
              <Text style={[styles.statVal, { color: '#F59E0B' }]}>
                ⭐ {Number(profile.avg_rating).toFixed(1)}
              </Text>
              <Text style={[styles.statLabel, { color: c.textSecondary }]}>
                ({profile.total_ratings} rating{profile.total_ratings !== 1 ? 's' : ''})
              </Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: c.inputBg }]}>
              <Text style={[styles.statVal, { color: c.text }]}>{profile.total_trips}</Text>
              <Text style={[styles.statLabel, { color: c.textSecondary }]}>Trips</Text>
            </View>
          </View>

          {profile.community_member && (
            <View style={[styles.communityPill, { backgroundColor: c.accentMuted }]}>
              <Text style={[styles.communityText, { color: c.accent }]}>
                🏛️ Verified Community Member
              </Text>
            </View>
          )}
        </View>

        {/* Reviews Section */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionHeading, { color: c.text }]}>
            Community Reviews ({reviews.length})
          </Text>

          {reviews.length === 0 ? (
            <Text style={[styles.emptyReviews, { color: c.textMuted }]}>
              No reviews yet. Completed trips with feedback will appear here.
            </Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={[styles.reviewItem, { borderBottomColor: c.border }]}>
                <View style={styles.reviewTop}>
                  <Text style={[styles.reviewerName, { color: c.text }]}>
                    {r.reviewer_name ?? 'Co-commuter'}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#F59E0B', fontWeight: '700' }}>
                    {'⭐'.repeat(r.rating)}
                  </Text>
                </View>

                {r.tags && r.tags.length > 0 && (
                  <View style={styles.tagChipsRow}>
                    {r.tags.map((t) => (
                      <View key={t} style={[styles.tagMiniChip, { backgroundColor: c.inputBg }]}>
                        <Text style={[styles.tagMiniText, { color: c.textSecondary }]}>
                          {t}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {r.comment ? (
                  <Text style={[styles.reviewComment, { color: c.text }]}>
                    "{r.comment}"
                  </Text>
                ) : null}

                <Text style={[styles.reviewDate, { color: c.textMuted }]}>
                  {new Date(r.created_at).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Safety & Moderation Actions */}
        <View style={styles.safetyRow}>
          <TouchableOpacity
            style={[
              styles.safetyBtn,
              {
                borderColor: isBlocked ? c.accent : c.danger,
                backgroundColor: isBlocked ? c.accentMuted : 'transparent',
              },
            ]}
            onPress={handleToggleBlock}
            disabled={blockLoading}
          >
            {blockLoading ? (
              <ActivityIndicator size="small" color={isBlocked ? c.accent : c.danger} />
            ) : (
              <Text
                style={[
                  styles.safetyBtnText,
                  { color: isBlocked ? c.accent : c.danger },
                ]}
              >
                {isBlocked ? '✓ User Blocked (Unblock)' : '🚫 Block User'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.safetyBtn, { borderColor: c.border }]}
            onPress={() => setReportModalVisible(true)}
          >
            <Text style={[styles.safetyBtnText, { color: c.textSecondary }]}>
              ⚠️ Report User
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Report Modal */}
      <Modal visible={reportModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              Report {profile.name}
            </Text>
            <Text style={[styles.modalSub, { color: c.textSecondary }]}>
              Help us keep RideColab safe. Please select a reason:
            </Text>

            <ScrollView style={{ maxHeight: 220, marginVertical: 8 }}>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.key}
                  style={[
                    styles.reasonOption,
                    {
                      backgroundColor: reportReason === reason.key ? c.accentMuted : c.inputBg,
                      borderColor: reportReason === reason.key ? c.accent : c.border,
                    },
                  ]}
                  onPress={() => setReportReason(reason.key)}
                >
                  <Text
                    style={[
                      styles.reasonText,
                      { color: reportReason === reason.key ? c.accent : c.text },
                    ]}
                  >
                    {reason.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[
                styles.reportInput,
                {
                  backgroundColor: c.inputBg,
                  borderColor: c.border,
                  color: c.text,
                },
              ]}
              placeholder="Additional details (optional)..."
              placeholderTextColor={c.textMuted}
              multiline
              numberOfLines={3}
              value={reportDetails}
              onChangeText={setReportDetails}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: c.border }]}
                onPress={() => setReportModalVisible(false)}
              >
                <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: c.danger }]}
                onPress={handleFileReport}
                disabled={reportSubmitting}
              >
                {reportSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  subText: { fontSize: 14 },
  content: { padding: 16, gap: 16 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 40 },
  profileName: { fontSize: 22, fontWeight: '800' },
  badgePill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: { fontSize: 13, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 6,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600' },
  communityPill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  communityText: { fontSize: 12, fontWeight: '600' },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionHeading: { fontSize: 16, fontWeight: '700' },
  emptyReviews: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  reviewItem: { paddingVertical: 12, borderBottomWidth: 1, gap: 6 },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { fontSize: 14, fontWeight: '700' },
  tagChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagMiniChip: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  tagMiniText: { fontSize: 11, fontWeight: '600' },
  reviewComment: { fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  reviewDate: { fontSize: 11 },
  safetyRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  safetyBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyBtnText: { fontSize: 13, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSub: { fontSize: 13 },
  reasonOption: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginVertical: 4,
  },
  reasonText: { fontSize: 13, fontWeight: '600' },
  reportInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    minHeight: 60,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSubmitBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
});

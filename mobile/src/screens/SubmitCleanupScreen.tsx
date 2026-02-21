import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { haversineKm } from '../lib/haversine';
import { Drive } from '../types';

type Step = 'intro' | 'camera_before' | 'preview_before' | 'cleaning' | 'camera_after' | 'preview_after' | 'submitting' | 'done';

const ROUND_TO_GRID = (val: number) => Math.round(val * 5000) / 5000; // ~22m grid cells

export default function SubmitCleanupScreen() {
  const { user, refreshProfile } = useAuth();
  const route = useRoute();
  // When navigated from "Clean This Spot" (CleanSpot stack screen), these are set
  const spotParams = route.params as { locationId?: string; lat?: number; lng?: number } | undefined;
  const presetLocationId = spotParams?.locationId ?? null;
  const presetLat = spotParams?.lat ?? null;
  const presetLng = spotParams?.lng ?? null;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>('intro');
  const [beforePhotoUri, setBeforePhotoUri] = useState<string | null>(null);
  const [afterPhotoUri, setAfterPhotoUri] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const requestPermissions = async () => {
    if (!permission?.granted) await requestPermission();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') Alert.alert('Location required', 'Please allow location access.');
  };

  const computeHash = async (uri: string): Promise<string> => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as any,
    });
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
  };

  const uploadImage = async (uri: string, bucket: string, path: string): Promise<string> => {
    // Resize before upload to save bandwidth
    const resized = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    // Read as base64 then convert to Uint8Array — most reliable method in React Native
    const base64 = await FileSystem.readAsStringAsync(resized.uri, { encoding: 'base64' });
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  // ─── Step handlers ────────────────────────────────────────────────────────

  const handleStart = async () => {
    await requestPermissions();
    if (!permission?.granted) {
      Alert.alert('Camera permission required', 'Please allow camera access to continue.');
      return;
    }
    setStep('camera_before');
  };

  const captureBeforePhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
    if (!photo) return;

    // Capture GPS simultaneously
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setGps({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? 999 });
    setBeforePhotoUri(photo.uri);
    setStep('preview_before');
  };

  const confirmBeforeAndCreateSession = async () => {
    if (!beforePhotoUri || !gps || !user) return;
    setStep('submitting');

    try {
      const hash = await computeHash(beforePhotoUri);
      const path = `before/${user.id}/${Date.now()}.jpg`;
      const publicUrl = await uploadImage(beforePhotoUri, 'cleanup-images', path);

      let locId: string;

      if (presetLocationId) {
        // "Clean This Spot" flow — use the pre-set location directly
        locId = presetLocationId;
      } else {
        // Normal flow — resolve or create location using grid dedup
        const latGrid = ROUND_TO_GRID(gps.lat);
        const lngGrid = ROUND_TO_GRID(gps.lng);

        const { data: existing } = await supabase
          .from('locations')
          .select('id')
          .eq('lat_grid', latGrid)
          .eq('lng_grid', lngGrid)
          .maybeSingle();

        if (existing) {
          locId = existing.id;
        } else {
          const { data: newLoc, error: locErr } = await supabase
            .from('locations')
            .insert({ lat: gps.lat, lng: gps.lng, lat_grid: latGrid, lng_grid: lngGrid, status: 'pending' })
            .select('id')
            .single();
          if (locErr || !newLoc) throw new Error('Could not create location');
          locId = newLoc.id;
        }
      }
      setLocationId(locId);

      // Check for duplicate image hash (anti-cheat)
      const { data: dupCheck } = await supabase
        .from('cleanup_reports')
        .select('id')
        .eq('before_image_hash', hash)
        .maybeSingle();
      if (dupCheck) throw new Error('This photo has already been submitted.');

      // Insert pending session directly (before_time defaults to now() server-side)
      const { data: session, error: sessionErr } = await supabase
        .from('pending_sessions')
        .insert({
          user_id: user.id,
          location_id: locId,
          before_image: publicUrl,
          before_image_hash: hash,
          gps_lat: gps.lat,
          gps_lng: gps.lng,
          gps_accuracy: gps.accuracy,
        })
        .select('id')
        .single();
      if (sessionErr || !session?.id) throw new Error(sessionErr?.message ?? 'Session creation failed');
      setSessionId(session.id);
      setStep('cleaning');
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setStep('preview_before');
    }
  };

  const captureAfterPhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
    if (!photo) return;
    setAfterPhotoUri(photo.uri);
    setStep('preview_after');
  };

  const submitReport = async () => {
    if (!afterPhotoUri || !user || !sessionId || !locationId || !gps) return;
    setStep('submitting');

    try {
      const hash = await computeHash(afterPhotoUri);
      const path = `after/${user.id}/${Date.now()}.jpg`;
      const publicUrl = await uploadImage(afterPhotoUri, 'cleanup-images', path);

      // Fetch pending session so we have before_image / before_time
      const { data: session, error: sessionErr } = await supabase
        .from('pending_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      if (sessionErr || !session) throw new Error('Session not found. Please start over.');

      // Insert cleanup report directly
      const { error: reportErr } = await supabase.from('cleanup_reports').insert({
        user_id: user.id,
        location_id: locationId,
        before_image: session.before_image,
        before_image_hash: session.before_image_hash,
        after_image: publicUrl,
        after_image_hash: hash,
        before_time: session.before_time,
        after_time: new Date().toISOString(),
        verified: true,
        gps_low_confidence: false,
      });
      if (reportErr) throw new Error(reportErr.message);

      // Award points + drive bonus ─────────────────────────────────────────
      const { data: currentUser } = await supabase
        .from('users')
        .select('total_points, cleanups_done')
        .eq('id', user.id)
        .single();
      const month = new Date().toISOString().slice(0, 7);

      // Check if within any active drive zone
      const now2 = new Date().toISOString();
      const { data: driveData } = await supabase
        .from('drives')
        .select('*')
        .eq('status', 'active')
        .lte('start_time', now2)
        .gte('end_time', now2);
      const activeDriveList = (driveData ?? []) as Drive[];
      const matchedDrive = activeDriveList.find(
        (d) => gps && haversineKm(gps.lat, gps.lng, d.lat, d.lng) <= d.radius_km,
      );

      const basePoints = 10;
      const bonusPoints = matchedDrive ? (matchedDrive.points_multiplier - 1) * basePoints : 0;
      const totalNewPoints = basePoints + bonusPoints;

      const pointsOps: any[] = [
        supabase.from('users').update({
          total_points: (currentUser?.total_points ?? 0) + totalNewPoints,
          cleanups_done: (currentUser?.cleanups_done ?? 0) + 1,
        }).eq('id', user.id),
        supabase.from('points_log').insert({
          user_id: user.id,
          points: basePoints,
          reason: 'verified_cleanup',
          location_id: locationId,
          month,
        }),
      ];
      if (matchedDrive && bonusPoints > 0) {
        pointsOps.push(
          supabase.from('points_log').insert({
            user_id: user.id,
            points: bonusPoints,
            reason: `drive_bonus_${matchedDrive.id}`,
            location_id: locationId,
            month,
          }),
          supabase.from('user_badges').upsert(
            {
              user_id: user.id,
              drive_id: matchedDrive.id,
              badge_name: matchedDrive.badge_name,
              badge_color: matchedDrive.badge_color,
              badge_icon: matchedDrive.badge_icon,
            },
            { onConflict: 'user_id,drive_id' },
          ),
        );
      }
      await Promise.all(pointsOps);

      // Mark location clean
      await supabase.from('locations').update({
        status: 'clean',
        last_cleaned_at: new Date().toISOString(),
      }).eq('id', locationId);

      // Clean up the pending session
      await supabase.from('pending_sessions').delete().eq('id', sessionId);

      const driveMsg = matchedDrive
        ? ` +${bonusPoints} drive bonus! ${matchedDrive.badge_icon} "${matchedDrive.badge_name}" badge earned!`
        : '';
      setResultMessage(`Cleanup verified! +${basePoints} points earned.${driveMsg}`);
      await refreshProfile();
      setStep('done');
    } catch (err: any) {
      Alert.alert('Submission failed', err.message);
      setStep('preview_after');
    }
  };

  const resetFlow = () => {
    setStep('intro');
    setBeforePhotoUri(null);
    setAfterPhotoUri(null);
    setGps(null);
    setSessionId(null);
    setLocationId(null);
    setResultMessage('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (step === 'camera_before' || step === 'camera_after') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraLabel}>
            {step === 'camera_before' ? 'BEFORE — Capture the dirty area' : 'AFTER — Capture the cleaned area'}
          </Text>
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={step === 'camera_before' ? captureBeforePhoto : captureAfterPhoto}
          >
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(step === 'camera_before' ? 'intro' : 'cleaning')}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'submitting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.waitText}>Processing…</Text>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.center}>
        <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
        <Text style={styles.doneTitle}>Cleanup Submitted!</Text>
        <Text style={styles.doneMsg}>{resultMessage}</Text>
        <TouchableOpacity style={styles.btn} onPress={resetFlow}>
          <Text style={styles.btnText}>Submit Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* INTRO */}
      {step === 'intro' && (
        <>
          <Text style={styles.title}>
            {presetLocationId ? 'Clean This Spot' : 'Start a Cleanup'}
          </Text>
          <Text style={styles.desc}>
            {presetLocationId
              ? `You\'re cleaning a confirmed dirty location at ${presetLat?.toFixed(4)}, ${presetLng?.toFixed(4)}. Capture a BEFORE photo, clean the area, then take an AFTER photo.`
              : 'Capture a BEFORE photo, clean the area, then capture an AFTER photo to earn points.'}
          </Text>
          <View style={styles.stepList}>
            {[
              { icon: 'camera-outline', text: 'Take BEFORE photo (in-app camera)' },
              { icon: 'brush-outline', text: 'Clean the area' },
              { icon: 'camera-outline', text: 'Take AFTER photo' },
              { icon: 'checkmark-circle-outline', text: 'Submit & earn +10 pts' },
            ].map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <Ionicons name={s.icon as any} size={18} color="#16a34a" style={{ marginRight: 10 }} />
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.btn} onPress={handleStart}>
            <Text style={styles.btnText}>Start Cleanup</Text>
          </TouchableOpacity>
        </>
      )}

      {/* BEFORE PREVIEW */}
      {step === 'preview_before' && beforePhotoUri && (
        <>
          <Text style={styles.title}>Before Photo</Text>
          <Image source={{ uri: beforePhotoUri }} style={styles.preview} />
          {gps && (
            <Text style={styles.gpsInfo}>
              GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} ({String.fromCharCode(0xb1)}{gps.accuracy.toFixed(0)}m)
            </Text>
          )}
          <TouchableOpacity style={styles.btn} onPress={confirmBeforeAndCreateSession}>
            <Text style={styles.btnText}>Confirm & Start Timer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('camera_before')}>
            <Text style={styles.btnSecondaryText}>Retake</Text>
          </TouchableOpacity>
        </>
      )}

      {/* CLEANING STEP */}
      {step === 'cleaning' && (
        <>
          <Text style={styles.title}>Now Clean the Area</Text>
          <Text style={styles.desc}>You have between 2 and 45 minutes. Once done, capture the AFTER photo.</Text>
          <Image source={{ uri: beforePhotoUri! }} style={styles.previewSmall} />
          <Text style={styles.tagSmall}>Before photo captured</Text>
          <TouchableOpacity style={styles.btn} onPress={() => setStep('camera_after')}>
            <Text style={styles.btnText}>Take AFTER Photo</Text>
          </TouchableOpacity>
        </>
      )}

      {/* AFTER PREVIEW */}
      {step === 'preview_after' && afterPhotoUri && (
        <>
          <Text style={styles.title}>After Photo</Text>
          <View style={styles.compareRow}>
            <View style={styles.compareItem}>
              <Text style={styles.compareLabel}>Before</Text>
              <Image source={{ uri: beforePhotoUri! }} style={styles.compareImg} />
            </View>
            <View style={styles.compareItem}>
              <Text style={styles.compareLabel}>After</Text>
              <Image source={{ uri: afterPhotoUri }} style={styles.compareImg} />
            </View>
          </View>
          <TouchableOpacity style={styles.btn} onPress={submitReport}>
            <Text style={styles.btnText}>Submit Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('camera_after')}>
            <Text style={styles.btnSecondaryText}>Retake After Photo</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4' },
  content: { padding: 20 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 48,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  cameraLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 16,
  },
  captureBtnInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  cancelText: { color: '#fff', fontSize: 15, marginTop: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f0fdf4' },
  waitText: { marginTop: 12, color: '#6b7280', fontSize: 15 },
  doneIcon: { fontSize: 64 },
  doneTitle: { fontSize: 24, fontWeight: '700', color: '#16a34a', marginTop: 12 },
  doneMsg: { fontSize: 14, color: '#374151', marginTop: 8, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 10 },
  desc: { fontSize: 14, color: '#6b7280', marginBottom: 20, lineHeight: 20 },
  stepList: { gap: 10, marginBottom: 24 },
  stepRow: { backgroundColor: '#dcfce7', padding: 12, borderRadius: 10 },
  stepText: { fontSize: 14, color: '#166534' },
  preview: { width: '100%', height: 260, borderRadius: 12, marginBottom: 10 },
  previewSmall: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  tagSmall: { fontSize: 12, color: '#16a34a', fontWeight: '600', marginBottom: 16 },
  gpsInfo: { fontSize: 12, color: '#6b7280', marginBottom: 16, textAlign: 'center' },
  compareRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  compareItem: { flex: 1 },
  compareLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 4, textAlign: 'center' },
  compareImg: { width: '100%', height: 180, borderRadius: 10 },
  btn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnSecondary: {
    borderWidth: 1.5,
    borderColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#16a34a', fontWeight: '600', fontSize: 15 },
});

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteParams = { locationId: string; lat: number; lng: number };

type Step = 'intro' | 'camera' | 'preview' | 'submitting' | 'done';

export default function DirtyReportScreen() {
  const route = useRoute();
  const navigation = useNavigation<Nav>();
  const { locationId } = route.params as RouteParams;
  const { user } = useAuth();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [step, setStep] = useState<Step>('intro');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const handleStart = async () => {
    if (!permission?.granted) await requestPermission();
    if (!permission?.granted) {
      Alert.alert('Camera required', 'Camera access is needed to report dirty locations.');
      return;
    }
    setStep('camera');
  };

  const capturePhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (!photo) return;
    setPhotoUri(photo.uri);
    setStep('preview');
  };

  const submitReport = async () => {
    if (!photoUri || !user) return;
    setStep('submitting');
    try {
      // Prevent same user reporting same spot twice in 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from('dirty_reports')
        .select('id')
        .eq('user_id', user.id)
        .eq('location_id', locationId)
        .gte('created_at', since)
        .maybeSingle();
      if (existing) {
        setStep('preview');
        Alert.alert('Already reported', 'You have already reported this location in the last 24 hours.');
        return;
      }
      const resized = await ImageManipulator.manipulateAsync(photoUri, [{ resize: { width: 800 } }], {
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

      const path = `dirty/${user.id}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('dirty-reports')
        .upload(path, bytes, { contentType: 'image/jpeg' });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage.from('dirty-reports').getPublicUrl(path);

      // Insert dirty report
      const { error: insertErr } = await supabase.from('dirty_reports').insert({
        user_id: user.id,
        location_id: locationId,
        photo_url: urlData.publicUrl,
        report_date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
      });
      if (insertErr) throw new Error(insertErr.message);

      // Call edge function to check consensus and update status if needed
      await supabase.functions.invoke('check-dirty-consensus', { body: { location_id: locationId } });

      setStep('done');
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setStep('preview');
    }
  };

  if (step === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.overlay}>
          <Text style={styles.cameraLabel}>Capture the dirty area</Text>
          <TouchableOpacity style={styles.captureBtn} onPress={capturePhoto}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep('intro')}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'submitting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.waitText}>Submitting report…</Text>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.center}>
        <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
        <Text style={styles.doneTitle}>Report Submitted</Text>
        <Text style={styles.doneMsg}>
          Your report has been recorded. If 3 users confirm within 24 hours, the area will be marked dirty.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Back to Map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Report Dirty Location</Text>
      <Text style={styles.desc}>
        Take a photo of the dirty area using the in-app camera. If 3 independent users confirm within 24 hours, the location will be marked dirty and guardians will be notified.
      </Text>

      <View style={styles.rulesBox}>
        <Text style={styles.rulesTitle}>Rules</Text>
        {[
          '📷 Photo must be taken in-app (no gallery)',
          '👥 3 confirmations needed within 24h',
          '🏅 You earn +3 points per confirmed report',
        ].map((r, i) => (
          <Text key={i} style={styles.rule}>{r}</Text>
        ))}
      </View>

      {photoUri && (
        <>
          <Image source={{ uri: photoUri }} style={styles.preview} />
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#ef4444' }]} onPress={submitReport}>
            <Text style={styles.btnText}>Submit Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('camera')}>
            <Text style={styles.btnSecondaryText}>Retake Photo</Text>
          </TouchableOpacity>
        </>
      )}

      {!photoUri && (
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#ef4444' }]} onPress={handleStart}>
          <Text style={styles.btnText}>Take Photo to Report</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff7f7' },
  content: { padding: 20 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 48,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  cameraLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  captureBtnInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#ef4444' },
  cancelText: { color: '#fff', fontSize: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff7f7' },
  waitText: { marginTop: 12, color: '#6b7280' },
  doneIcon: { fontSize: 56 },
  doneTitle: { fontSize: 22, fontWeight: '700', color: '#16a34a', marginTop: 12 },
  doneMsg: { fontSize: 14, color: '#374151', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 10 },
  desc: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 20 },
  rulesBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 6,
  },
  rulesTitle: { fontWeight: '700', color: '#b91c1c', marginBottom: 4 },
  rule: { fontSize: 13, color: '#374151' },
  preview: { width: '100%', height: 240, borderRadius: 12, marginBottom: 14 },
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
    borderColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
});

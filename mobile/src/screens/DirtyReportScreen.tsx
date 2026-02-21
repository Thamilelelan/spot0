import React, { useMemo, useRef, useState } from 'react';
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
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteParams = { locationId: string; lat: number; lng: number };
type Step = 'intro' | 'camera' | 'preview' | 'submitting' | 'done';

export default function DirtyReportScreen() {
  const route = useRoute();
  const navigation = useNavigation<Nav>();
  const { locationId } = route.params as RouteParams;
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

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
      const todayStr = new Date().toISOString().slice(0, 10);

      // Check if this user already reported this location today (matches DB unique index)
      const { data: existing } = await supabase
        .from('dirty_reports').select('id')
        .eq('user_id', user.id).eq('location_id', locationId)
        .eq('report_date', todayStr)
        .maybeSingle();
      if (existing) {
        setStep('preview');
        Alert.alert('Already reported', 'You have already reported this location today. Try again tomorrow.');
        return;
      }
      const resized = await ImageManipulator.manipulateAsync(photoUri, [{ resize: { width: 800 } }], {
        compress: 0.8, format: ImageManipulator.SaveFormat.JPEG,
      });
      const base64 = await FileSystem.readAsStringAsync(resized.uri, { encoding: 'base64' });
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const filePath = `dirty/${user.id}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('dirty-reports').upload(filePath, bytes, { contentType: 'image/jpeg' });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: urlData } = supabase.storage.from('dirty-reports').getPublicUrl(filePath);
      const { error: insertErr } = await supabase.from('dirty_reports').insert({
        user_id: user.id,
        location_id: locationId,
        photo_url: urlData.publicUrl,
        report_date: new Date().toISOString().slice(0, 10),
      });
      if (insertErr) {
        // Catch DB unique constraint violation (duplicate report_date for same user+location)
        if (insertErr.code === '23505') {
          setStep('preview');
          Alert.alert('Already reported', 'You have already reported this location today.');
          return;
        }
        throw new Error(insertErr.message);
      }
      await supabase.functions.invoke('check-dirty-consensus', { body: { location_id: locationId } });

      // If location was clean, flip it to pending so the map shows a yellow tag
      await supabase
        .from('locations')
        .update({ status: 'pending' })
        .eq('id', locationId)
        .eq('status', 'clean');

      setStep('done');
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setStep('preview');
    }
  };

  if (step === 'camera') {
    return (
      <View style={s.cameraContainer}>
        <CameraView ref={cameraRef} style={s.camera} facing="back" />
        <View style={s.cameraOverlay}>
          <View style={s.cameraLabelWrap}>
            <Ionicons name="scan-outline" size={16} color="#fff" />
            <Text style={s.cameraLabel}>Frame the dirty area clearly</Text>
          </View>
          <TouchableOpacity style={s.captureBtn} onPress={capturePhoto} activeOpacity={0.85}>
            <View style={s.captureBtnInner} />
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setStep('intro')}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'submitting') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.danger} />
        <Text style={s.waitText}>Submitting report…</Text>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={s.center}>
        <View style={s.doneIconRing}>
          <Ionicons name="checkmark" size={40} color={colors.primary} />
        </View>
        <Text style={s.doneTitle}>Report Submitted</Text>
        <Text style={s.doneMsg}>
          Your report has been recorded. If 3 users confirm within 24 hours, the area will be marked dirty.
        </Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.goBack()}>
          <Text style={s.btnText}>Back to Map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Report Dirty Location</Text>
      <Text style={s.desc}>
        Take a photo of the dirty area using the in-app camera. 3 independent user reports within 24 hours will mark this location dirty and notify guardians.
      </Text>

      <View style={s.rulesBox}>
        <View style={s.rulesTitleRow}>
          <Ionicons name="information-circle" size={16} color={colors.danger} />
          <Text style={s.rulesTitle}>How it works</Text>
        </View>
        {[
          { icon: 'camera-outline', text: 'Photo must be taken in-app (no gallery uploads)' },
          { icon: 'people-outline', text: '3 confirmations needed within 24 h to confirm dirty' },
          { icon: 'medal-outline', text: 'You earn +3 points per confirmed dirty report' },
        ].map((r, i) => (
          <View key={i} style={s.ruleRow}>
            <Ionicons name={r.icon as any} size={15} color={colors.dangerDark} />
            <Text style={s.ruleText}>{r.text}</Text>
          </View>
        ))}
      </View>

      {photoUri && (
        <>
          <Image source={{ uri: photoUri }} style={s.preview} />
          <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={submitReport} activeOpacity={0.85}>
            <Ionicons name="warning-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.btnText}>Submit Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnOutline} onPress={() => setStep('camera')}>
            <Text style={s.btnOutlineText}>Retake Photo</Text>
          </TouchableOpacity>
        </>
      )}

      {!photoUri && (
        <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={handleStart} activeOpacity={0.85}>
          <Ionicons name="camera-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={s.btnText}>Take Photo to Report</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    cameraContainer: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1 },
    cameraOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingBottom: 52,
      backgroundColor: 'rgba(0,0,0,0.15)',
    },
    cameraLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 24,
      marginBottom: 28,
    },
    cameraLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
    captureBtn: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: 'rgba(255,255,255,0.25)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: '#fff',
      marginBottom: 18,
    },
    captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.danger },
    cancelBtn: { paddingVertical: 8, paddingHorizontal: 20 },
    cancelText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '500' },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      backgroundColor: c.bg,
    },
    waitText: { marginTop: 14, color: c.textSub, fontSize: 15 },
    doneIconRing: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: c.primaryLight,
      borderWidth: 2,
      borderColor: c.primaryMid,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    doneTitle: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 8 },
    doneMsg: { fontSize: 14, color: c.textSub, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
    title: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 8 },
    desc: { fontSize: 14, color: c.textSub, lineHeight: 21, marginBottom: 20 },
    rulesBox: {
      backgroundColor: c.dangerBg,
      borderRadius: 14,
      padding: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: c.danger + '33',
      gap: 10,
    },
    rulesTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    rulesTitle: { fontWeight: '700', color: c.danger, fontSize: 13 },
    ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    ruleText: { flex: 1, fontSize: 13, color: c.textSub, lineHeight: 18 },
    preview: { width: '100%', height: 220, borderRadius: 14, marginBottom: 14 },
    btn: {
      borderRadius: 12,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      backgroundColor: c.primary,
    },
    btnDanger: { backgroundColor: c.danger },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnOutline: {
      borderWidth: 1.5,
      borderColor: c.danger,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    btnOutlineText: { color: c.danger, fontWeight: '600', fontSize: 15 },
  });
}

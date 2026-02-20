import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const otpRef = useRef<TextInput>(null);

  const sendOtp = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep('otp');
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 8) {
      Alert.alert('Error', 'Enter the 8-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'email',
      });
      if (error) throw error;
      // AuthContext will detect the session and navigate automatically
    } catch (err: any) {
      Alert.alert('Invalid code', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Brand mark */}
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="leaf" size={32} color="#16a34a" />
          </View>
          <Text style={styles.brandName}>CityClean</Text>
          <Text style={styles.brandTagline}>Verify your civic impact</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {step === 'email' ? (
            <>
              <Text style={styles.cardTitle}>Sign in</Text>
              <Text style={styles.cardSub}>Enter your email to receive a one-time code</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                  returnKeyType="send"
                  onSubmitEditing={sendOtp}
                />
              </View>
              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={sendOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnText}>Send Code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Check your email</Text>
              <Text style={styles.cardSub}>
                We sent an 8-digit code to{' '}
                <Text style={styles.emailHighlight}>{email}</Text>
              </Text>
              <TextInput
                ref={otpRef}
                style={styles.otpInput}
                placeholder="00000000"
                placeholderTextColor="#cbd5e1"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={verifyOtp}
              />
              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={verifyOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnText}>Verify & Continue</Text>
                )}
              </TouchableOpacity>
              <View style={styles.secondaryRow}>
                <TouchableOpacity onPress={() => { setStep('email'); setOtp(''); }}>
                  <Text style={styles.secondaryLink}>Change email</Text>
                </TouchableOpacity>
                <Text style={styles.dot}>·</Text>
                <TouchableOpacity onPress={sendOtp} disabled={loading}>
                  <Text style={styles.secondaryLink}>Resend code</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brand: { alignItems: 'center', marginBottom: 32 },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandName: { fontSize: 26, fontWeight: '700', color: '#0f172a', letterSpacing: -0.5 },
  brandTagline: { fontSize: 13, color: '#64748b', marginTop: 3 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 18 },
  emailHighlight: { color: '#16a34a', fontWeight: '600' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 13 },
  otpInput: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
    paddingVertical: 14,
    color: '#0f172a',
    marginBottom: 14,
  },
  btn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  secondaryLink: { color: '#16a34a', fontSize: 13, fontWeight: '500' },
  dot: { color: '#cbd5e1', fontSize: 13 },
});

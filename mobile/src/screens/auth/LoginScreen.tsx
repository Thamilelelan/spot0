import React, { useMemo, useState, useRef } from 'react';
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
import { useTheme, ThemeColors } from '../../context/ThemeContext';

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const otpRef = useRef<TextInput>(null);

  const sendOtp = async () => {
    if (!email.trim()) { Alert.alert('Error', 'Please enter your email.'); return; }
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
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (otp.length !== 8) { Alert.alert('Error', 'Enter the 8-digit code from your email.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'email',
      });
      if (error) throw error;
    } catch (err: any) {
      Alert.alert('Invalid code', err.message);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Brand */}
        <View style={s.brand}>
          <View style={s.brandIcon}>
            <Ionicons name="leaf" size={34} color={colors.primary} />
          </View>
          <Text style={s.brandName}>SpotZero</Text>
          <Text style={s.brandTagline}>Zero dirt. Full credit.</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          {step === 'email' ? (
            <>
              <Text style={s.cardTitle}>Welcome back</Text>
              <Text style={s.cardSub}>Enter your email to receive a one-time sign-in code</Text>
              <View style={s.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
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
                style={[s.btn, loading && s.btnDisabled]}
                onPress={sendOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnText}>Send Code</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.cardTitle}>Check your email</Text>
              <Text style={s.cardSub}>
                We sent an 8-digit code to{' '}
                <Text style={s.emailHighlight}>{email}</Text>
              </Text>
              <TextInput
                ref={otpRef}
                style={s.otpInput}
                placeholder="00000000"
                placeholderTextColor={colors.textMuted}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={verifyOtp}
              />
              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={verifyOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnText}>Verify & Continue</Text>}
              </TouchableOpacity>
              <View style={s.secondaryRow}>
                <TouchableOpacity onPress={() => { setStep('email'); setOtp(''); }}>
                  <Text style={s.secondaryLink}>Change email</Text>
                </TouchableOpacity>
                <Text style={s.dot}>·</Text>
                <TouchableOpacity onPress={sendOtp} disabled={loading}>
                  <Text style={s.secondaryLink}>Resend code</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <Text style={s.footer}>
          By continuing you agree to our{' '}
          <Text style={s.footerLink}>Terms of Service</Text>
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    brand: { alignItems: 'center', marginBottom: 36 },
    brandIcon: {
      width: 68,
      height: 68,
      borderRadius: 20,
      backgroundColor: c.primaryLight,
      borderWidth: 1,
      borderColor: c.primaryMid,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    brandName: { fontSize: 28, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    brandTagline: { fontSize: 13, color: c.textSub, marginTop: 4, fontWeight: '500' },
    card: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 20,
      elevation: 4,
    },
    cardTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 4 },
    cardSub: { fontSize: 13, color: c.textSub, marginBottom: 20, lineHeight: 19 },
    emailHighlight: { color: c.primary, fontWeight: '600' },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      borderRadius: 12,
      backgroundColor: c.inputBg,
      paddingHorizontal: 12,
      marginBottom: 14,
    },
    inputIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 13 },
    otpInput: {
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      borderRadius: 12,
      backgroundColor: c.inputBg,
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: 10,
      textAlign: 'center',
      paddingVertical: 14,
      color: c.text,
      marginBottom: 14,
    },
    btn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnDisabled: { opacity: 0.55 },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    secondaryRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
      gap: 8,
    },
    secondaryLink: { color: c.primary, fontSize: 13, fontWeight: '600' },
    dot: { color: c.textMuted, fontSize: 16 },
    footer: { textAlign: 'center', color: c.textMuted, fontSize: 11, marginTop: 28 },
    footerLink: { color: c.textSub, textDecorationLine: 'underline' },
  });
}

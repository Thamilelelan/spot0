import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// ─── Replace with your actual Supabase project values ────────────────────────
const SUPABASE_URL = 'https://bvbhatxddakrmihjyxrb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2YmhhdHhkZGFrcm1paGp5eHJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1ODE3OTEsImV4cCI6MjA4NzE1Nzc5MX0.KqU6W7UuDPuXR7dfTz9jY0aS7jRXpspMwhzN7tluLUQ';
// ─────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

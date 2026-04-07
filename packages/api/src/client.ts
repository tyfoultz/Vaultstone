import { createClient } from '@supabase/supabase-js';
import type { Database } from '@vaultstone/types';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

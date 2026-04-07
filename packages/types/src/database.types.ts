// Auto-generated from Supabase schema — do not edit by hand.
// Run `supabase gen types typescript` to regenerate after migrations.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      game_systems: {
        Row: {
          id: string;
          display_name: string;
          version: string;
          license: string;
          is_bundled: boolean;
          definition: Json;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['game_systems']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['game_systems']['Insert']>;
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          dm_user_id: string;
          join_code: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['campaigns']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['campaigns']['Insert']>;
      };
      characters: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string;
          name: string;
          system: string;
          base_stats: Json;
          resources: Json;
          conditions: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['characters']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['characters']['Insert']>;
      };
      sessions: {
        Row: {
          id: string;
          campaign_id: string;
          started_at: string;
          ended_at: string | null;
          round: number;
        };
        Insert: Omit<Database['public']['Tables']['sessions']['Row'], 'id' | 'started_at'>;
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>;
      };
      initiative_order: {
        Row: {
          id: string;
          session_id: string;
          character_id: string | null;
          display_name: string;
          init_value: number;
          hp_current: number;
          hp_max: number;
          ac: number;
          is_active_turn: boolean;
          sort_order: number;
        };
        Insert: Omit<Database['public']['Tables']['initiative_order']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['initiative_order']['Insert']>;
      };
      session_events: {
        Row: {
          id: string;
          session_id: string;
          event_type: string;
          actor_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['session_events']['Row'], 'id' | 'created_at'>;
        Update: never;
      };
      homebrew_content: {
        Row: {
          id: string;
          campaign_id: string | null;
          user_id: string;
          content_type: string;
          name: string;
          data: Json;
          is_published: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['homebrew_content']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['homebrew_content']['Insert']>;
      };
    };
  };
}

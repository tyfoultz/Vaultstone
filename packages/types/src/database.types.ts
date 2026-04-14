// Hand-written types mirroring Supabase's generated format.
// Replace with `supabase gen types typescript` output once the project is connected.

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
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
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
        Insert: {
          id: string;
          display_name: string;
          version: string;
          license: string;
          is_bundled: boolean;
          definition: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          version?: string;
          license?: string;
          is_bundled?: boolean;
          definition?: Json;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          dm_user_id: string;
          join_code: string;
          system_label: string | null;
          description: string | null;
          cover_image_url: string | null;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          dm_user_id: string;
          join_code: string;
          system_label?: string | null;
          description?: string | null;
          cover_image_url?: string | null;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          dm_user_id?: string;
          join_code?: string;
          system_label?: string | null;
          description?: string | null;
          cover_image_url?: string | null;
          is_archived?: boolean;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          campaign_id: string | null;
          user_id: string;
          name: string;
          system: string;
          base_stats: Json;
          resources: Json;
          conditions: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id?: string | null;
          user_id: string;
          name: string;
          system: string;
          base_stats: Json;
          resources: Json;
          conditions?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          user_id?: string;
          name?: string;
          system?: string;
          base_stats?: Json;
          resources?: Json;
          conditions?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          campaign_id: string;
          started_at: string;
          ended_at: string | null;
          round: number;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          started_at?: string;
          ended_at?: string | null;
          round?: number;
        };
        Update: {
          ended_at?: string | null;
          round?: number;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          session_id: string;
          character_id?: string | null;
          display_name: string;
          init_value: number;
          hp_current: number;
          hp_max: number;
          ac: number;
          is_active_turn?: boolean;
          sort_order: number;
        };
        Update: {
          character_id?: string | null;
          display_name?: string;
          init_value?: number;
          hp_current?: number;
          hp_max?: number;
          ac?: number;
          is_active_turn?: boolean;
          sort_order?: number;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          session_id: string;
          event_type: string;
          actor_id?: string | null;
          payload: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
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
        Insert: {
          id?: string;
          campaign_id?: string | null;
          user_id: string;
          content_type: string;
          name: string;
          data: Json;
          is_published?: boolean;
          created_at?: string;
        };
        Update: {
          campaign_id?: string | null;
          content_type?: string;
          name?: string;
          data?: Json;
          is_published?: boolean;
        };
        Relationships: [];
      };
      campaign_members: {
        Row: {
          campaign_id: string;
          user_id: string;
          role: 'gm' | 'player' | 'co_gm';
          character_id: string | null;
          joined_at: string;
        };
        Insert: {
          campaign_id: string;
          user_id: string;
          role?: 'gm' | 'player' | 'co_gm';
          character_id?: string | null;
          joined_at?: string;
        };
        Update: {
          role?: 'gm' | 'player' | 'co_gm';
          character_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      get_campaign_by_join_code: {
        Args: { p_join_code: string };
        Returns: Database['public']['Tables']['campaigns']['Row'][];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

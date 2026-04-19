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
          storage_used_bytes: number;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          storage_used_bytes?: number;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          storage_used_bytes?: number;
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
          content_sources: Json | null;
          party_view_settings: Json | null;
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
          content_sources?: Json | null;
          party_view_settings?: Json | null;
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
          content_sources?: Json | null;
          party_view_settings?: Json | null;
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
          combat_started_at: string | null;
          summary: string | null;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          started_at?: string;
          ended_at?: string | null;
          round?: number;
          combat_started_at?: string | null;
          summary?: string | null;
        };
        Update: {
          ended_at?: string | null;
          round?: number;
          combat_started_at?: string | null;
          summary?: string | null;
        };
        Relationships: [];
      };
      session_participants: {
        Row: {
          session_id: string;
          user_id: string;
          added_at: string;
        };
        Insert: {
          session_id: string;
          user_id: string;
          added_at?: string;
        };
        Update: {
          added_at?: string;
        };
        Relationships: [];
      };
      session_notes: {
        Row: {
          session_id: string;
          user_id: string;
          body: string;
          updated_at: string;
        };
        Insert: {
          session_id: string;
          user_id: string;
          body?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          updated_at?: string;
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
          init_roll: number | null;
          init_override: number | null;
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
          init_roll?: number | null;
          init_override?: number | null;
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
          init_roll?: number | null;
          init_override?: number | null;
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
      worlds: {
        Row: {
          id: string;
          owner_user_id: string;
          name: string;
          description: string | null;
          cover_image_url: string | null;
          primary_map_id: string | null;
          primary_timeline_page_id: string | null;
          is_archived: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_user_id: string;
          name: string;
          description?: string | null;
          cover_image_url?: string | null;
          primary_map_id?: string | null;
          primary_timeline_page_id?: string | null;
          is_archived?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          cover_image_url?: string | null;
          primary_map_id?: string | null;
          primary_timeline_page_id?: string | null;
          is_archived?: boolean;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      world_campaigns: {
        Row: {
          world_id: string;
          campaign_id: string;
          created_at: string;
        };
        Insert: {
          world_id: string;
          campaign_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      world_sections: {
        Row: {
          id: string;
          world_id: string;
          name: string;
          template_key: 'locations' | 'npcs' | 'players' | 'factions' | 'lore' | 'blank';
          section_view: 'grid' | 'list';
          sort_order: number;
          force_hidden_from_players: boolean;
          default_pages_visible: boolean;
          deleted_at: string | null;
          hard_delete_after: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          world_id: string;
          name: string;
          template_key: 'locations' | 'npcs' | 'players' | 'factions' | 'lore' | 'blank';
          section_view?: 'grid' | 'list';
          sort_order?: number;
          force_hidden_from_players?: boolean;
          default_pages_visible?: boolean;
          deleted_at?: string | null;
          hard_delete_after?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          template_key?: 'locations' | 'npcs' | 'players' | 'factions' | 'lore' | 'blank';
          section_view?: 'grid' | 'list';
          sort_order?: number;
          force_hidden_from_players?: boolean;
          default_pages_visible?: boolean;
          deleted_at?: string | null;
          hard_delete_after?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      world_pages: {
        Row: {
          id: string;
          world_id: string;
          section_id: string;
          parent_page_id: string | null;
          title: string;
          page_kind:
            | 'custom'
            | 'location'
            | 'npc'
            | 'faction'
            | 'religion'
            | 'organization'
            | 'item'
            | 'lore'
            | 'timeline'
            | 'pc_stub'
            | 'player_character';
          template_key: string;
          template_version: number;
          body: Json;
          body_text: string | null;
          body_refs: string[];
          structured_fields: Json;
          visible_to_players: boolean;
          sort_order: number;
          pc_user_id: string | null;
          character_id: string | null;
          campaign_id: string | null;
          title_overridden: boolean;
          is_orphaned: boolean;
          editing_user_id: string | null;
          editing_since: string | null;
          deleted_at: string | null;
          hard_delete_after: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          world_id: string;
          section_id: string;
          parent_page_id?: string | null;
          title: string;
          page_kind:
            | 'custom'
            | 'location'
            | 'npc'
            | 'faction'
            | 'religion'
            | 'organization'
            | 'item'
            | 'lore'
            | 'timeline'
            | 'pc_stub'
            | 'player_character';
          template_key: string;
          template_version: number;
          body?: Json;
          body_text?: string | null;
          body_refs?: string[];
          structured_fields?: Json;
          visible_to_players?: boolean;
          sort_order?: number;
          pc_user_id?: string | null;
          character_id?: string | null;
          campaign_id?: string | null;
          title_overridden?: boolean;
          is_orphaned?: boolean;
          editing_user_id?: string | null;
          editing_since?: string | null;
          deleted_at?: string | null;
          hard_delete_after?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          section_id?: string;
          parent_page_id?: string | null;
          title?: string;
          page_kind?:
            | 'custom'
            | 'location'
            | 'npc'
            | 'faction'
            | 'religion'
            | 'organization'
            | 'item'
            | 'lore'
            | 'timeline'
            | 'pc_stub'
            | 'player_character';
          template_key?: string;
          template_version?: number;
          body?: Json;
          body_text?: string | null;
          body_refs?: string[];
          structured_fields?: Json;
          visible_to_players?: boolean;
          sort_order?: number;
          pc_user_id?: string | null;
          character_id?: string | null;
          campaign_id?: string | null;
          title_overridden?: boolean;
          is_orphaned?: boolean;
          editing_user_id?: string | null;
          editing_since?: string | null;
          deleted_at?: string | null;
          hard_delete_after?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      world_page_permissions: {
        Row: {
          page_id: string;
          user_id: string;
          permission: 'view' | 'edit';
          cascade: boolean;
          granted_by: string;
          granted_at: string;
        };
        Insert: {
          page_id: string;
          user_id: string;
          permission?: 'view' | 'edit';
          cascade?: boolean;
          granted_by: string;
          granted_at?: string;
        };
        Update: {
          permission?: 'view' | 'edit';
          cascade?: boolean;
        };
        Relationships: [];
      };
      world_maps: {
        Row: {
          id: string;
          world_id: string;
          owner_page_id: string | null;
          campaign_id: string | null;
          label: string;
          image_key: string;
          image_width: number;
          image_height: number;
          aspect_ratio: number;
          byte_size: number;
          deleted_at: string | null;
          hard_delete_after: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          world_id: string;
          owner_page_id?: string | null;
          campaign_id?: string | null;
          label: string;
          image_key: string;
          image_width: number;
          image_height: number;
          aspect_ratio: number;
          byte_size: number;
          deleted_at?: string | null;
          hard_delete_after?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          image_key?: string;
          image_width?: number;
          image_height?: number;
          aspect_ratio?: number;
          byte_size?: number;
          owner_page_id?: string | null;
          campaign_id?: string | null;
          deleted_at?: string | null;
          hard_delete_after?: string | null;
        };
        Relationships: [];
      };
      pin_types: {
        Row: {
          key: string;
          label: string;
          default_icon_key: string;
          default_color_hex: string;
          sort_order: number;
        };
        Insert: {
          key: string;
          label: string;
          default_icon_key: string;
          default_color_hex: string;
          sort_order?: number;
        };
        Update: {
          label?: string;
          default_icon_key?: string;
          default_color_hex?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      map_pins: {
        Row: {
          id: string;
          map_id: string;
          world_id: string;
          pin_type: string;
          x_pct: number;
          y_pct: number;
          label: string | null;
          icon_key_override: string | null;
          color_override: string | null;
          linked_page_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          map_id: string;
          world_id: string;
          pin_type: string;
          x_pct: number;
          y_pct: number;
          label?: string | null;
          icon_key_override?: string | null;
          color_override?: string | null;
          linked_page_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          pin_type?: string;
          x_pct?: number;
          y_pct?: number;
          label?: string | null;
          icon_key_override?: string | null;
          color_override?: string | null;
          linked_page_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_campaign_with_gm: {
        Args: { p_name: string; p_system_label?: string | null; p_description?: string | null };
        Returns: Database['public']['Tables']['campaigns']['Row'];
      };
      get_campaign_by_join_code: {
        Args: { p_join_code: string };
        Returns: Database['public']['Tables']['campaigns']['Row'][];
      };
      roll_combatant_initiative: {
        Args: { combatant_id: string; roll_value: number };
        Returns: undefined;
      };
      update_character_state: {
        Args: { character_id: string; patch: Json };
        Returns: undefined;
      };
      is_world_owner: {
        Args: { p_world_id: string };
        Returns: boolean;
      };
      create_world_with_owner: {
        Args: {
          p_name: string;
          p_description?: string | null;
          p_campaign_ids?: string[] | null;
        };
        Returns: Database['public']['Tables']['worlds']['Row'];
      };
      trash_world_section: {
        Args: { p_section_id: string };
        Returns: undefined;
      };
      trash_world_page: {
        Args: { p_page_id: string };
        Returns: undefined;
      };
      move_world_page: {
        Args: {
          p_page_id: string;
          p_new_section_id: string;
          p_new_parent_id: string | null;
          p_new_sort_order: number;
        };
        Returns: undefined;
      };
      claim_world_page_edit: {
        Args: { p_page_id: string };
        Returns: Database['public']['Tables']['world_pages']['Row'];
      };
      release_world_page_edit: {
        Args: { p_page_id: string };
        Returns: undefined;
      };
      user_can_view_page: {
        Args: { p_user_id: string; p_page_id: string };
        Returns: boolean;
      };
      user_can_edit_page: {
        Args: { p_user_id: string; p_page_id: string };
        Returns: boolean;
      };
      effective_page_permission: {
        Args: { p_user_id: string; p_page_id: string };
        Returns: 'view' | 'edit' | null;
      };
      materialize_pc_stub: {
        Args: { p_world_id: string; p_character_id: string; p_campaign_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      world_page_permission_level: 'view' | 'edit';
    };
    CompositeTypes: Record<never, never>;
  };
}

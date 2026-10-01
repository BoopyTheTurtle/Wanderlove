export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      couple_members: {
        Row: {
          couple_id: string;
          joined_at: string;
          user_id: string;
        };
        Insert: {
          couple_id: string;
          joined_at?: string;
          user_id: string;
        };
        Update: {
          couple_id?: string;
          joined_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "couple_members_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "couple_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "couple_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      couple_stats: {
        Row: {
          challenges_done: number;
          couple_id: string;
          photos_taken: number;
          points: number;
          quests_done: number;
          updated_at: string;
        };
        Insert: {
          challenges_done?: number;
          couple_id: string;
          photos_taken?: number;
          points?: number;
          quests_done?: number;
          updated_at?: string;
        };
        Update: {
          challenges_done?: number;
          couple_id?: string;
          photos_taken?: number;
          points?: number;
          quests_done?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "couple_stats_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: true;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
        ];
      };
      couples: {
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      invite_attempts: {
        Row: {
          attempted_at: string;
          user_id: string;
        };
        Insert: {
          attempted_at?: string;
          user_id: string;
        };
        Update: {
          attempted_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invite_attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invite_attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          code_hash: string;
          created_at: string;
          expires_at: string;
          id: string;
          inviter_id: string;
          redeemed_at: string | null;
          redeemed_by: string | null;
        };
        Insert: {
          code_hash: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          inviter_id: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          inviter_id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invites_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_redeemed_by_fkey";
            columns: ["redeemed_by"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_redeemed_by_fkey";
            columns: ["redeemed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      link_requests: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          invitee_id: string;
          inviter_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          invitee_id: string;
          inviter_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          invitee_id?: string;
          inviter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "link_requests_invitee_id_fkey";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "link_requests_invitee_id_fkey";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "link_requests_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "link_requests_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_hidden: {
        Row: {
          photo_id: string;
          user_id: string;
        };
        Insert: {
          photo_id: string;
          user_id?: string;
        };
        Update: {
          photo_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_hidden_photo_id_fkey";
            columns: ["photo_id"];
            isOneToOne: false;
            referencedRelation: "photos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photo_hidden_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photo_hidden_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      photos: {
        Row: {
          created_at: string;
          height: number;
          id: string;
          nonce: string | null;
          run_id: string;
          stop_id: string;
          storage_path: string;
          uploader_id: string;
          width: number;
        };
        Insert: {
          created_at?: string;
          height: number;
          id?: string;
          nonce?: string | null;
          run_id: string;
          stop_id: string;
          storage_path: string;
          uploader_id?: string;
          width: number;
        };
        Update: {
          created_at?: string;
          height?: number;
          id?: string;
          nonce?: string | null;
          run_id?: string;
          stop_id?: string;
          storage_path?: string;
          uploader_id?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "photos_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "trail_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_uploader_id_fkey";
            columns: ["uploader_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_uploader_id_fkey";
            columns: ["uploader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          age_confirmed_at: string | null;
          appearance: Json | null;
          avatar_path: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          mobility: boolean;
          terms_accepted_at: string | null;
          terms_version: string | null;
          username: string | null;
        };
        Insert: {
          age_confirmed_at?: string | null;
          appearance?: Json | null;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          mobility?: boolean;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          username?: string | null;
        };
        Update: {
          age_confirmed_at?: string | null;
          appearance?: Json | null;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          mobility?: boolean;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
      quest_points: {
        Row: {
          couple_id: string;
          finish_points: number;
          photo_points: number;
          run_id: string;
          stop_points: number;
          total: number | null;
          updated_at: string;
          week_bonus: number;
          week_start: string;
        };
        Insert: {
          couple_id: string;
          finish_points?: number;
          photo_points?: number;
          run_id: string;
          stop_points?: number;
          total?: never;
          updated_at?: string;
          week_bonus?: number;
          week_start: string;
        };
        Update: {
          couple_id?: string;
          finish_points?: number;
          photo_points?: number;
          run_id?: string;
          stop_points?: number;
          total?: never;
          updated_at?: string;
          week_bonus?: number;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quest_points_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quest_points_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: true;
            referencedRelation: "trail_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      run_invites: {
        Row: {
          created_at: string;
          run_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          run_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          run_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_invites_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "trail_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_invites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_invites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      run_keys: {
        Row: {
          created_at: string;
          ephemeral_public_key: string;
          for_key_id: string;
          run_id: string;
          user_id: string;
          wrapped_by: string | null;
          wrapped_key: string;
        };
        Insert: {
          created_at?: string;
          ephemeral_public_key: string;
          for_key_id: string;
          run_id: string;
          user_id: string;
          wrapped_by?: string | null;
          wrapped_key: string;
        };
        Update: {
          created_at?: string;
          ephemeral_public_key?: string;
          for_key_id?: string;
          run_id?: string;
          user_id?: string;
          wrapped_by?: string | null;
          wrapped_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_keys_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "trail_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_keys_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_keys_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_keys_wrapped_by_fkey";
            columns: ["wrapped_by"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_keys_wrapped_by_fkey";
            columns: ["wrapped_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stop_completions: {
        Row: {
          completed_at: string;
          completed_by: string;
          run_id: string;
          stop_id: string;
        };
        Insert: {
          completed_at?: string;
          completed_by?: string;
          run_id: string;
          stop_id: string;
        };
        Update: {
          completed_at?: string;
          completed_by?: string;
          run_id?: string;
          stop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stop_completions_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stop_completions_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stop_completions_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "trail_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      stop_reports: {
        Row: {
          created_at: string;
          id: string;
          lat: number;
          lng: number;
          note: string | null;
          reason: string;
          reporter: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          lat: number;
          lng: number;
          note?: string | null;
          reason: string;
          reporter?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          lat?: number;
          lng?: number;
          note?: string | null;
          reason?: string;
          reporter?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stop_reports_reporter_fkey";
            columns: ["reporter"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stop_reports_reporter_fkey";
            columns: ["reporter"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_history: {
        Row: {
          at: string;
          id: number;
          outcome: string;
          person_high: string;
          person_low: string;
          task_id: string;
        };
        Insert: {
          at?: string;
          id?: never;
          outcome: string;
          person_high: string;
          person_low: string;
          task_id: string;
        };
        Update: {
          at?: string;
          id?: never;
          outcome?: string;
          person_high?: string;
          person_low?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_history_person_high_fkey";
            columns: ["person_high"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_history_person_high_fkey";
            columns: ["person_high"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_history_person_low_fkey";
            columns: ["person_low"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_history_person_low_fkey";
            columns: ["person_low"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      trail_run_members: {
        Row: {
          run_id: string;
          user_id: string;
        };
        Insert: {
          run_id: string;
          user_id: string;
        };
        Update: {
          run_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trail_run_members_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "trail_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trail_run_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trail_run_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      trail_runs: {
        Row: {
          abandoned_at: string | null;
          completed_at: string | null;
          couple_id: string | null;
          details_ciphertext: string | null;
          details_nonce: string | null;
          id: string;
          photos_purged_at: string | null;
          started_at: string;
          started_by: string | null;
          stop_count: number | null;
          summary_ciphertext: string | null;
          summary_nonce: string | null;
          trail_id: string;
          trail_snapshot: Json | null;
        };
        Insert: {
          abandoned_at?: string | null;
          completed_at?: string | null;
          couple_id?: string | null;
          details_ciphertext?: string | null;
          details_nonce?: string | null;
          id?: string;
          photos_purged_at?: string | null;
          started_at?: string;
          started_by?: string | null;
          stop_count?: number | null;
          summary_ciphertext?: string | null;
          summary_nonce?: string | null;
          trail_id: string;
          trail_snapshot?: Json | null;
        };
        Update: {
          abandoned_at?: string | null;
          completed_at?: string | null;
          couple_id?: string | null;
          details_ciphertext?: string | null;
          details_nonce?: string | null;
          id?: string;
          photos_purged_at?: string | null;
          started_at?: string;
          started_by?: string | null;
          stop_count?: number | null;
          summary_ciphertext?: string | null;
          summary_nonce?: string | null;
          trail_id?: string;
          trail_snapshot?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "trail_runs_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trail_runs_started_by_fkey";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trail_runs_started_by_fkey";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_keys: {
        Row: {
          key_id: string;
          public_key: string;
          recovery_blob: string | null;
          recovery_iv: string | null;
          recovery_salt: string | null;
          recovery_viewed_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          key_id: string;
          public_key: string;
          recovery_blob?: string | null;
          recovery_iv?: string | null;
          recovery_salt?: string | null;
          recovery_viewed_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          key_id?: string;
          public_key?: string;
          recovery_blob?: string | null;
          recovery_iv?: string | null;
          recovery_salt?: string | null;
          recovery_viewed_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_keys_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_keys_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      profile_cards: {
        Row: {
          appearance: Json | null;
          avatar_path: string | null;
          display_name: string | null;
          id: string | null;
          key_id: string | null;
          public_key: string | null;
          username: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_run: { Args: { p_run_id: string }; Returns: string };
      accept_terms: { Args: { p_version: string }; Returns: undefined };
      clear_couple_name: { Args: Record<PropertyKey, never>; Returns: undefined };
      confirm_couple_name: { Args: { p_name?: string }; Returns: string };
      confirm_link: { Args: { p_request: string }; Returns: string };
      couple_name: {
        Args: Record<PropertyKey, never>;
        Returns: {
          name: string;
          proposal: string;
          proposed_by_me: boolean;
        }[];
      };
      create_invite: { Args: Record<PropertyKey, never>; Returns: string };
      decline_link: { Args: { p_request: string }; Returns: undefined };
      decline_run: { Args: { p_run_id: string }; Returns: undefined };
      expired_photos: {
        Args: { p_limit?: number };
        Returns: {
          photo_id: string;
          run_id: string;
          storage_path: string;
        }[];
      };
      join_leaderboard: { Args: Record<PropertyKey, never>; Returns: string };
      leaderboard_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          in_league: boolean;
          my_yes: boolean;
          needs_name: boolean;
          partner_yes: boolean;
        }[];
      };
      leave_leaderboard: { Args: Record<PropertyKey, never>; Returns: undefined };
      mark_recovery_viewed: { Args: Record<PropertyKey, never>; Returns: string };
      my_league: {
        Args: Record<PropertyKey, never>;
        Returns: {
          couple_name: string;
          is_me: boolean;
          league_quests: number;
          my_band: string;
          weekly_points: number;
        }[];
      };
      peek_invite: { Args: { p_code: string }; Returns: Json };
      purge_photos: {
        Args: { p_photo_ids: string[] };
        Returns: {
          photos_deleted: number;
          runs_purged: number;
        }[];
      };
      redeem_invite_pending: { Args: { p_code: string }; Returns: string };
      report_stop: { Args: { p_lat: number; p_lng: number; p_note?: string; p_reason: string }; Returns: undefined };
      reported_places: {
        Args: Record<PropertyKey, never>;
        Returns: {
          lat: number;
          lng: number;
        }[];
      };
      set_couple_name: { Args: { p_name: string }; Returns: string };
      share_run_keys: { Args: { p_keys: Json }; Returns: undefined };
      start_run: {
        Args: {
          p_details?: string;
          p_details_nonce?: string;
          p_keys?: Json;
          p_partner?: string;
          p_run_id?: string;
          p_snapshot: Json;
          p_stop_count?: number;
          p_summary?: string;
          p_summary_nonce?: string;
          p_trail_id: string;
        };
        Returns: string;
      };
      unlink: { Args: Record<PropertyKey, never>; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;

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
      couples: {
        Row: {
          created_at: string;
          ended_at: string | null;
          ended_by: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "couples_ended_by_fkey";
            columns: ["ended_by"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "couples_ended_by_fkey";
            columns: ["ended_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
          avatar_path: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          terms_accepted_at: string | null;
          terms_version: string | null;
          username: string | null;
        };
        Insert: {
          age_confirmed_at?: string | null;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          username?: string | null;
        };
        Update: {
          age_confirmed_at?: string | null;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          username?: string | null;
        };
        Relationships: [];
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
          id: string;
          photos_purged_at: string | null;
          started_at: string;
          started_by: string | null;
          trail_id: string;
          trail_snapshot: NonNullable<Json>;
        };
        Insert: {
          abandoned_at?: string | null;
          completed_at?: string | null;
          couple_id?: string | null;
          id?: string;
          photos_purged_at?: string | null;
          started_at?: string;
          started_by?: string | null;
          trail_id: string;
          trail_snapshot: NonNullable<Json>;
        };
        Update: {
          abandoned_at?: string | null;
          completed_at?: string | null;
          couple_id?: string | null;
          id?: string;
          photos_purged_at?: string | null;
          started_at?: string;
          started_by?: string | null;
          trail_id?: string;
          trail_snapshot?: NonNullable<Json>;
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
          updated_at: string;
          user_id: string;
        };
        Insert: {
          key_id: string;
          public_key: string;
          recovery_blob?: string | null;
          recovery_iv?: string | null;
          recovery_salt?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          key_id?: string;
          public_key?: string;
          recovery_blob?: string | null;
          recovery_iv?: string | null;
          recovery_salt?: string | null;
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
      accept_terms: { Args: { p_version: string }; Returns: undefined };
      create_invite: { Args: Record<PropertyKey, never>; Returns: string };
      expired_photos: {
        Args: { p_limit?: number };
        Returns: {
          photo_id: string;
          run_id: string;
          storage_path: string;
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
      redeem_invite: { Args: { p_code: string }; Returns: string };
      share_run_keys: { Args: { p_keys: Json }; Returns: undefined };
      start_run: { Args: { p_keys?: Json; p_run_id?: string; p_snapshot: Json; p_trail_id: string }; Returns: string };
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

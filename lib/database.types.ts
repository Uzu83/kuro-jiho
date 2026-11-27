/**
 * `supabase gen types --lang typescript` と同じ形。
 * 列は supabase/migrations/20261127073300_articles_revisions_rate_limits.sql に合わせる。
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admin_allowlist: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      api_rate_limits: {
        Row: {
          count: number;
          key: string;
          window_start: string;
        };
        Insert: {
          count: number;
          key: string;
          window_start: string;
        };
        Update: {
          count?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      article_revisions: {
        Row: {
          actor: string;
          article_id: string;
          change_type: string;
          created_at: string;
          id: string;
          note: string | null;
          snapshot: Json;
          version: number;
        };
        Insert: {
          actor: string;
          article_id: string;
          change_type: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          snapshot: Json;
          version: number;
        };
        Update: {
          actor?: string;
          article_id?: string;
          change_type?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          snapshot?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          ai_generated: boolean;
          author: string;
          body_md: string;
          date: string;
          id: string;
          published_at: string | null;
          related: string[];
          slug: string;
          slot: string;
          sources: Json;
          status: string;
          summary: string[];
          theme: string;
          title: string;
          updated_at: string;
          verification: Json;
          version: number;
        };
        Insert: {
          ai_generated?: boolean;
          author: string;
          body_md: string;
          date: string;
          id?: string;
          published_at?: string | null;
          related?: string[];
          slug: string;
          slot: string;
          sources: Json;
          status: string;
          summary: string[];
          theme: string;
          title: string;
          updated_at?: string;
          verification: Json;
          version?: number;
        };
        Update: {
          ai_generated?: boolean;
          author?: string;
          body_md?: string;
          date?: string;
          id?: string;
          published_at?: string | null;
          related?: string[];
          slug?: string;
          slot?: string;
          sources?: Json;
          status?: string;
          summary?: string[];
          theme?: string;
          title?: string;
          updated_at?: string;
          verification?: Json;
          version?: number;
        };
        Relationships: [];
      };
      slot_logs: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          reason: string | null;
          slot: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          id?: string;
          reason?: string | null;
          slot: string;
          status: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          reason?: string | null;
          slot?: string;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      article_corrections: {
        Row: {
          actor: string;
          article_id: string;
          change_type: string;
          created_at: string;
          id: string;
          note: string | null;
          version: number;
        };
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      slot_logs_public: {
        Row: {
          date: string;
          slot: string;
          status: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_session_allowed: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      consume_rate_limit: {
        Args: {
          key: string;
          limit: number;
          window_seconds: number;
        };
        Returns: boolean;
      };
      kuro_apply_article_update: {
        Args: {
          target_id: string;
          patch: Json;
          change_type: string;
          change_note: string | null;
          expected_version: number;
        };
        Returns: Database["public"]["Tables"]["articles"]["Row"][];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<
  Name extends keyof (PublicSchema["Tables"] & PublicSchema["Views"]),
> = (PublicSchema["Tables"] & PublicSchema["Views"])[Name] extends {
  Row: infer Row;
}
  ? Row
  : never;

export type TablesInsert<Name extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][Name] extends { Insert: infer Insert } ? Insert : never;

export type TablesUpdate<Name extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][Name] extends { Update: infer Update } ? Update : never;

export type Enums<Name extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][Name];

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

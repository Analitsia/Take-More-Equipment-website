/**
 * GENERATED — do not edit.
 *
 *   npm run db:types
 *
 * Regenerate after every migration. A stale file here is a type system that
 * confidently describes a schema that no longer exists.
 *
 * Two things the generator cannot know, both handled in the schema rather than
 * worked around at call sites:
 *   - trigger-populated NOT NULL columns look required on insert, which is why
 *     items.sku and items.slug carry column defaults;
 *   - a view's nullability is unknowable, so every column of public_items
 *     arrives as `T | null`. Narrow once, in a typed query helper.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          summary: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: never
          summary?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: never
          summary?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          blurb: string | null
          icon: string
          id: string
          name: string
          position: number
          slug: string
        }
        Insert: {
          active?: boolean
          blurb?: string | null
          icon?: string
          id?: string
          name: string
          position?: number
          slug: string
        }
        Update: {
          active?: boolean
          blurb?: string | null
          icon?: string
          id?: string
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
      item_costs: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          incurred_on: string
          item_id: string
          kind: Database["public"]["Enums"]["cost_kind"]
          labour_hours: number | null
          note: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          incurred_on?: string
          item_id: string
          kind: Database["public"]["Enums"]["cost_kind"]
          labour_hours?: number | null
          note?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          incurred_on?: string
          item_id?: string
          kind?: Database["public"]["Enums"]["cost_kind"]
          labour_hours?: number | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_media: {
        Row: {
          alt_text: string | null
          created_at: string
          duration_seconds: number | null
          external_url: string | null
          height: number | null
          id: string
          is_placeholder: boolean
          item_id: string
          kind: Database["public"]["Enums"]["media_kind"]
          position: number
          storage_path: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          height?: number | null
          id?: string
          is_placeholder?: boolean
          item_id: string
          kind?: Database["public"]["Enums"]["media_kind"]
          position?: number
          storage_path?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          height?: number | null
          id?: string
          is_placeholder?: boolean
          item_id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          position?: number
          storage_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_status_transitions: {
        Row: {
          from_status: Database["public"]["Enums"]["item_status"]
          label: string
          min_role: Database["public"]["Enums"]["app_role"]
          to_status: Database["public"]["Enums"]["item_status"]
        }
        Insert: {
          from_status: Database["public"]["Enums"]["item_status"]
          label: string
          min_role: Database["public"]["Enums"]["app_role"]
          to_status: Database["public"]["Enums"]["item_status"]
        }
        Update: {
          from_status?: Database["public"]["Enums"]["item_status"]
          label?: string
          min_role?: Database["public"]["Enums"]["app_role"]
          to_status?: Database["public"]["Enums"]["item_status"]
        }
        Relationships: []
      }
      item_tags: {
        Row: {
          item_id: string
          tag_id: string
        }
        Insert: {
          item_id: string
          tag_id: string
        }
        Update: {
          item_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          arrived_at: string
          brand: string | null
          capacity: string | null
          category_id: string | null
          condition_grade: Database["public"]["Enums"]["condition_grade"] | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          depth_mm: number | null
          description: string | null
          featured: boolean
          height_mm: number | null
          id: string
          list_price_cents: number | null
          location_code: string | null
          model: string | null
          power: string | null
          published_at: string | null
          reserved_until: string | null
          retail_price_cents: number | null
          sale_price_cents: number | null
          sku: string
          slug: string
          sold_at: string | null
          specs: Json
          status: Database["public"]["Enums"]["item_status"]
          title: string
          updated_at: string
          weight_kg: number | null
          width_mm: number | null
          workshop_notes: string[]
        }
        Insert: {
          arrived_at?: string
          brand?: string | null
          capacity?: string | null
          category_id?: string | null
          condition_grade?:
            | Database["public"]["Enums"]["condition_grade"]
            | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          depth_mm?: number | null
          description?: string | null
          featured?: boolean
          height_mm?: number | null
          id?: string
          list_price_cents?: number | null
          location_code?: string | null
          model?: string | null
          power?: string | null
          published_at?: string | null
          reserved_until?: string | null
          retail_price_cents?: number | null
          sale_price_cents?: number | null
          sku?: string
          slug?: string
          sold_at?: string | null
          specs?: Json
          status?: Database["public"]["Enums"]["item_status"]
          title?: string
          updated_at?: string
          weight_kg?: number | null
          width_mm?: number | null
          workshop_notes?: string[]
        }
        Update: {
          arrived_at?: string
          brand?: string | null
          capacity?: string | null
          category_id?: string | null
          condition_grade?:
            | Database["public"]["Enums"]["condition_grade"]
            | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          depth_mm?: number | null
          description?: string | null
          featured?: boolean
          height_mm?: number | null
          id?: string
          list_price_cents?: number | null
          location_code?: string | null
          model?: string | null
          power?: string | null
          published_at?: string | null
          reserved_until?: string | null
          retail_price_cents?: number | null
          sale_price_cents?: number | null
          sku?: string
          slug?: string
          sold_at?: string | null
          specs?: Json
          status?: Database["public"]["Enums"]["item_status"]
          title?: string
          updated_at?: string
          weight_kg?: number | null
          width_mm?: number | null
          workshop_notes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "public_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          active: boolean
          id: string
          name: string
          position: number
          slug: string
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          position?: number
          slug: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      item_economics: {
        Row: {
          arrived_at: string | null
          days_to_sale: number | null
          item_id: string | null
          list_price_cents: number | null
          margin_cents: number | null
          margin_percent: number | null
          sale_price_cents: number | null
          sku: string | null
          slug: string | null
          sold_at: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          title: string | null
          total_cost_cents: number | null
        }
        Relationships: []
      }
      public_categories: {
        Row: {
          blurb: string | null
          icon: string | null
          id: string | null
          item_count: number | null
          name: string | null
          position: number | null
          slug: string | null
        }
        Relationships: []
      }
      public_item_media: {
        Row: {
          alt_text: string | null
          duration_seconds: number | null
          external_url: string | null
          height: number | null
          id: string | null
          item_id: string | null
          kind: Database["public"]["Enums"]["media_kind"] | null
          position: number | null
          storage_path: string | null
          width: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      public_items: {
        Row: {
          brand: string | null
          capacity: string | null
          category_name: string | null
          category_slug: string | null
          condition_grade: Database["public"]["Enums"]["condition_grade"] | null
          depth_mm: number | null
          description: string | null
          featured: boolean | null
          height_mm: number | null
          id: string | null
          list_price_cents: number | null
          model: string | null
          power: string | null
          primary_image_path: string | null
          primary_image_url: string | null
          published_at: string | null
          retail_price_cents: number | null
          sale_price_cents: number | null
          sku: string | null
          slug: string | null
          sold: boolean | null
          sold_at: string | null
          specs: Json | null
          status: Database["public"]["Enums"]["item_status"] | null
          tag_slugs: string[] | null
          title: string | null
          weight_kg: number | null
          width_mm: number | null
          workshop_notes: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      record_item_cost: {
        Args: {
          p_amount_cents: number
          p_incurred_on?: string
          p_item_id: string
          p_kind: Database["public"]["Enums"]["cost_kind"]
          p_labour_hours?: number
          p_note?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      activity_action:
        | "created"
        | "updated"
        | "status_changed"
        | "published"
        | "unpublished"
        | "price_changed"
        | "deleted"
      app_role: "staff" | "manager" | "owner"
      condition_grade: "A" | "B" | "C"
      cost_kind:
        | "auction"
        | "buyers_premium"
        | "transport"
        | "parts"
        | "labour"
        | "other"
      item_status:
        | "intake"
        | "refurbishing"
        | "ready"
        | "listed"
        | "reserved"
        | "sold"
        | "handed_over"
      media_kind: "photo" | "video"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_action: [
        "created",
        "updated",
        "status_changed",
        "published",
        "unpublished",
        "price_changed",
        "deleted",
      ],
      app_role: ["staff", "manager", "owner"],
      condition_grade: ["A", "B", "C"],
      cost_kind: [
        "auction",
        "buyers_premium",
        "transport",
        "parts",
        "labour",
        "other",
      ],
      item_status: [
        "intake",
        "refurbishing",
        "ready",
        "listed",
        "reserved",
        "sold",
        "handed_over",
      ],
      media_kind: ["photo", "video"],
    },
  },
} as const

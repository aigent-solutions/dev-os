export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_usage_logs: {
        Row: {
          attempts: number
          completion_tokens: number
          contract_id: string | null
          cost_usd: number
          created_at: string
          error_code: string | null
          id: number
          latency_ms: number
          model: string
          operation: Database["public"]["Enums"]["ai_operation"]
          prompt_tokens: number
          prompt_version: string
          success: boolean
          user_id: string
        }
        Insert: {
          attempts?: number
          completion_tokens?: number
          contract_id?: string | null
          cost_usd?: number
          created_at?: string
          error_code?: string | null
          id?: never
          latency_ms: number
          model: string
          operation: Database["public"]["Enums"]["ai_operation"]
          prompt_tokens?: number
          prompt_version: string
          success: boolean
          user_id: string
        }
        Update: {
          attempts?: number
          completion_tokens?: number
          contract_id?: string | null
          cost_usd?: number
          created_at?: string
          error_code?: string | null
          id?: never
          latency_ms?: number
          model?: string
          operation?: Database["public"]["Enums"]["ai_operation"]
          prompt_tokens?: number
          prompt_version?: string
          success?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          citation_missing: boolean
          cited_pages: number[]
          completion_tokens: number | null
          content: string
          contract_id: string
          created_at: string
          id: string
          is_not_found: boolean
          prompt_tokens: number | null
          query_type: Database["public"]["Enums"]["chat_query_type"] | null
          role: Database["public"]["Enums"]["chat_role"]
          session_id: string
          status: Database["public"]["Enums"]["message_status"]
          user_id: string
        }
        Insert: {
          citation_missing?: boolean
          cited_pages?: number[]
          completion_tokens?: number | null
          content: string
          contract_id: string
          created_at?: string
          id?: string
          is_not_found?: boolean
          prompt_tokens?: number | null
          query_type?: Database["public"]["Enums"]["chat_query_type"] | null
          role: Database["public"]["Enums"]["chat_role"]
          session_id: string
          status?: Database["public"]["Enums"]["message_status"]
          user_id: string
        }
        Update: {
          citation_missing?: boolean
          cited_pages?: number[]
          completion_tokens?: number | null
          content?: string
          contract_id?: string
          created_at?: string
          id?: string
          is_not_found?: boolean
          prompt_tokens?: number | null
          query_type?: Database["public"]["Enums"]["chat_query_type"] | null
          role?: Database["public"]["Enums"]["chat_role"]
          session_id?: string
          status?: Database["public"]["Enums"]["message_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          contract_text: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          detected_contract_type:
            | Database["public"]["Enums"]["detected_contract_type"]
            | null
          error_code: string | null
          error_message: string | null
          file_deleted_at: string | null
          file_name: string
          file_path: string | null
          file_size_bytes: number
          id: string
          last_accessed_at: string
          page_count: number | null
          processing_attempts: number
          processing_completed_at: string | null
          processing_stage:
            | Database["public"]["Enums"]["processing_stage"]
            | null
          processing_started_at: string | null
          prompt_version: string | null
          review_completed_at: string | null
          status: Database["public"]["Enums"]["contract_status"]
          token_count: number | null
          type_mismatch: boolean
          updated_at: string
          user_id: string
          word_count: number | null
        }
        Insert: {
          contract_text?: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          detected_contract_type?:
            | Database["public"]["Enums"]["detected_contract_type"]
            | null
          error_code?: string | null
          error_message?: string | null
          file_deleted_at?: string | null
          file_name: string
          file_path?: string | null
          file_size_bytes: number
          id?: string
          last_accessed_at?: string
          page_count?: number | null
          processing_attempts?: number
          processing_completed_at?: string | null
          processing_stage?:
            | Database["public"]["Enums"]["processing_stage"]
            | null
          processing_started_at?: string | null
          prompt_version?: string | null
          review_completed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          token_count?: number | null
          type_mismatch?: boolean
          updated_at?: string
          user_id: string
          word_count?: number | null
        }
        Update: {
          contract_text?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          detected_contract_type?:
            | Database["public"]["Enums"]["detected_contract_type"]
            | null
          error_code?: string | null
          error_message?: string | null
          file_deleted_at?: string | null
          file_name?: string
          file_path?: string | null
          file_size_bytes?: number
          id?: string
          last_accessed_at?: string
          page_count?: number | null
          processing_attempts?: number
          processing_completed_at?: string | null
          processing_stage?:
            | Database["public"]["Enums"]["processing_stage"]
            | null
          processing_started_at?: string | null
          prompt_version?: string | null
          review_completed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          token_count?: number | null
          type_mismatch?: boolean
          updated_at?: string
          user_id?: string
          word_count?: number | null
        }
        Relationships: []
      }
      custom_key_terms: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          is_manual: boolean
          term_name: string
          user_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          is_manual?: boolean
          term_name: string
          user_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          is_manual?: boolean
          term_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_key_terms_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      key_terms: {
        Row: {
          confidence_score: number
          contract_id: string
          created_at: string
          custom_key_term_id: string | null
          display_order: number
          edited_at: string | null
          id: string
          is_custom: boolean
          is_edited: boolean
          original_page_number: number | null
          original_value: string | null
          page_number: number | null
          source_sentence: string | null
          source_verified: boolean
          term_key: string
          term_name: string
          updated_at: string
          user_id: string
          value: string | null
        }
        Insert: {
          confidence_score: number
          contract_id: string
          created_at?: string
          custom_key_term_id?: string | null
          display_order: number
          edited_at?: string | null
          id?: string
          is_custom?: boolean
          is_edited?: boolean
          original_page_number?: number | null
          original_value?: string | null
          page_number?: number | null
          source_sentence?: string | null
          source_verified?: boolean
          term_key: string
          term_name: string
          updated_at?: string
          user_id: string
          value?: string | null
        }
        Update: {
          confidence_score?: number
          contract_id?: string
          created_at?: string
          custom_key_term_id?: string | null
          display_order?: number
          edited_at?: string | null
          id?: string
          is_custom?: boolean
          is_edited?: boolean
          original_page_number?: number | null
          original_value?: string | null
          page_number?: number | null
          source_sentence?: string | null
          source_verified?: boolean
          term_key?: string
          term_name?: string
          updated_at?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_terms_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_terms_custom_key_term_id_fkey"
            columns: ["custom_key_term_id"]
            isOneToOne: false
            referencedRelation: "custom_key_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          feedback_opt_in: boolean
          full_name: string | null
          id: string
          onboarding_completed_at: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          feedback_opt_in?: boolean
          full_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          feedback_opt_in?: boolean
          full_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          accuracy_rating: Database["public"]["Enums"]["accuracy_rating"] | null
          comment: string | null
          contract_id: string
          created_at: string
          id: string
          nps_score: number | null
          rating: Database["public"]["Enums"]["feedback_rating"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_rating?:
            | Database["public"]["Enums"]["accuracy_rating"]
            | null
          comment?: string | null
          contract_id: string
          created_at?: string
          id?: string
          nps_score?: number | null
          rating: Database["public"]["Enums"]["feedback_rating"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_rating?:
            | Database["public"]["Enums"]["accuracy_rating"]
            | null
          comment?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          nps_score?: number | null
          rating?: Database["public"]["Enums"]["feedback_rating"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contract_analysis_costs: {
        Row: {
          call_count: number | null
          chat_cost_usd: number | null
          completion_tokens: number | null
          contract_id: string | null
          extraction_cost_usd: number | null
          first_call_at: string | null
          last_call_at: string | null
          prompt_tokens: number | null
          total_cost_usd: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      term_correction_rate_7d: {
        Row: {
          correction_rate: number | null
          edited_terms_7d: number | null
          extracted_terms_7d: number | null
        }
        Relationships: []
      }
      term_corrections: {
        Row: {
          confidence_score: number | null
          contract_id: string | null
          corrected_value: string | null
          edited_at: string | null
          id: string | null
          is_custom: boolean | null
          original_page_number: number | null
          original_value: string | null
          page_number: number | null
          term_key: string | null
          term_name: string | null
          user_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          contract_id?: string | null
          corrected_value?: string | null
          edited_at?: string | null
          id?: string | null
          is_custom?: boolean | null
          original_page_number?: number | null
          original_value?: string | null
          page_number?: number | null
          term_key?: string | null
          term_name?: string | null
          user_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          contract_id?: string | null
          corrected_value?: string | null
          edited_at?: string | null
          id?: string | null
          is_custom?: boolean | null
          original_page_number?: number | null
          original_value?: string | null
          page_number?: number | null
          term_key?: string | null
          term_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_terms_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      term_corrections_anonymised: {
        Row: {
          confidence_score: number | null
          contract_hash: string | null
          corrected_value: string | null
          edited_at: string | null
          is_custom: boolean | null
          original_page_number: number | null
          original_value: string | null
          page_number: number | null
          term_key: string | null
          term_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_limit: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      get_dashboard_summary: {
        Args: never
        Returns: {
          completed_count: number
          msa_count: number
          nda_count: number
          reviewed_count: number
          total: number
        }[]
      }
      save_extraction_results: {
        Args: {
          p_contract_id: string
          p_detected_type: string
          p_prompt_version: string
          p_terms: Json
          p_type_mismatch: boolean
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      accuracy_rating: "yes" | "partially" | "no"
      ai_operation: "extraction" | "extraction_repair" | "chat"
      chat_query_type: "contract" | "history" | "both"
      chat_role: "user" | "assistant"
      contract_status:
        | "pending_upload"
        | "ready"
        | "processing"
        | "completed"
        | "error"
      contract_type: "nda" | "msa"
      detected_contract_type: "nda" | "msa" | "other"
      feedback_rating: "up" | "down"
      message_status: "complete" | "error"
      plan_tier: "trial" | "starter" | "growth" | "pro"
      processing_stage: "analysing" | "compiling"
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
      accuracy_rating: ["yes", "partially", "no"],
      ai_operation: ["extraction", "extraction_repair", "chat"],
      chat_query_type: ["contract", "history", "both"],
      chat_role: ["user", "assistant"],
      contract_status: [
        "pending_upload",
        "ready",
        "processing",
        "completed",
        "error",
      ],
      contract_type: ["nda", "msa"],
      detected_contract_type: ["nda", "msa", "other"],
      feedback_rating: ["up", "down"],
      message_status: ["complete", "error"],
      plan_tier: ["trial", "starter", "growth", "pro"],
      processing_stage: ["analysing", "compiling"],
    },
  },
} as const


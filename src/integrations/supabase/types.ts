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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bo_settings: {
        Row: {
          created_at: string
          custos_operacionais_anual: number
          dias_uteis: number
          horas_dia: number
          id: string
          margem_lucro_pct: number
          notas: string | null
          singleton: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          custos_operacionais_anual?: number
          dias_uteis?: number
          horas_dia?: number
          id?: string
          margem_lucro_pct?: number
          notas?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          custos_operacionais_anual?: number
          dias_uteis?: number
          horas_dia?: number
          id?: string
          margem_lucro_pct?: number
          notas?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      collaborators: {
        Row: {
          created_at: string
          data_nascimento: string | null
          departamento: Database["public"]["Enums"]["department"]
          id: string
          inicio_carreira: string | null
          margem_lucro_pct_override: number | null
          nome: string
          numero_colaborador: string | null
          situacao_contractual: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_nascimento?: string | null
          departamento?: Database["public"]["Enums"]["department"]
          id?: string
          inicio_carreira?: string | null
          margem_lucro_pct_override?: number | null
          nome: string
          numero_colaborador?: string | null
          situacao_contractual?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_nascimento?: string | null
          departamento?: Database["public"]["Enums"]["department"]
          id?: string
          inicio_carreira?: string | null
          margem_lucro_pct_override?: number | null
          nome?: string
          numero_colaborador?: string | null
          situacao_contractual?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      salary_snapshots: {
        Row: {
          ajudas_custo_anual: number
          beneficio_carro: number
          beneficio_ticket: number
          collaborator_id: string
          created_at: string
          dias_uteis: number
          id: string
          irs_pct: number
          is_effective: boolean
          label: string
          meses_pagos: number
          notas: string | null
          outros_beneficios: number
          premio_associado: number
          reference_date: string
          ss_atelier_pct: number
          ss_colaborador_pct: number
          subsidio_alimentacao_diario: number
          updated_at: string
          valor_base: number
        }
        Insert: {
          ajudas_custo_anual?: number
          beneficio_carro?: number
          beneficio_ticket?: number
          collaborator_id: string
          created_at?: string
          dias_uteis?: number
          id?: string
          irs_pct?: number
          is_effective?: boolean
          label: string
          meses_pagos?: number
          notas?: string | null
          outros_beneficios?: number
          premio_associado?: number
          reference_date: string
          ss_atelier_pct?: number
          ss_colaborador_pct?: number
          subsidio_alimentacao_diario?: number
          updated_at?: string
          valor_base?: number
        }
        Update: {
          ajudas_custo_anual?: number
          beneficio_carro?: number
          beneficio_ticket?: number
          collaborator_id?: string
          created_at?: string
          dias_uteis?: number
          id?: string
          irs_pct?: number
          is_effective?: boolean
          label?: string
          meses_pagos?: number
          notas?: string | null
          outros_beneficios?: number
          premio_associado?: number
          reference_date?: string
          ss_atelier_pct?: number
          ss_colaborador_pct?: number
          subsidio_alimentacao_diario?: number
          updated_at?: string
          valor_base?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_snapshots_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      department: "Projecto" | "Backoffice"
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
      department: ["Projecto", "Backoffice"],
    },
  },
} as const

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
      benefit_expenses: {
        Row: {
          ano_fiscal: number
          aprovado_em: string | null
          aprovado_por: string | null
          categoria: Database["public"]["Enums"]["benefit_category"]
          collaborator_id: string
          created_at: string
          data_despesa: string
          descricao: string
          estado: Database["public"]["Enums"]["expense_status"]
          foto_path: string | null
          id: string
          notas_aprovacao: string | null
          notas_colaborador: string | null
          pago_em: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano_fiscal?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria: Database["public"]["Enums"]["benefit_category"]
          collaborator_id: string
          created_at?: string
          data_despesa: string
          descricao: string
          estado?: Database["public"]["Enums"]["expense_status"]
          foto_path?: string | null
          id?: string
          notas_aprovacao?: string | null
          notas_colaborador?: string | null
          pago_em?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          ano_fiscal?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria?: Database["public"]["Enums"]["benefit_category"]
          collaborator_id?: string
          created_at?: string
          data_despesa?: string
          descricao?: string
          estado?: Database["public"]["Enums"]["expense_status"]
          foto_path?: string | null
          id?: string
          notas_aprovacao?: string | null
          notas_colaborador?: string | null
          pago_em?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "benefit_expenses_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
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
          ano_fiscal: number
          created_at: string
          data_nascimento: string | null
          departamento: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia: number
          dias_ferias_anuais: number
          dias_ferias_extra: number
          email: string | null
          estado_civil: string
          id: string
          inicio_carreira: string | null
          localizacao: string
          margem_lucro_pct_override: number | null
          nome: string
          numero_colaborador: string | null
          numero_dependentes: number
          numero_titulares: number
          saldo_ferias_anterior: number
          situacao_contractual: string | null
          updated_at: string
        }
        Insert: {
          ano_fiscal?: number
          created_at?: string
          data_nascimento?: string | null
          departamento?: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia?: number
          dias_ferias_anuais?: number
          dias_ferias_extra?: number
          email?: string | null
          estado_civil?: string
          id?: string
          inicio_carreira?: string | null
          localizacao?: string
          margem_lucro_pct_override?: number | null
          nome: string
          numero_colaborador?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          saldo_ferias_anterior?: number
          situacao_contractual?: string | null
          updated_at?: string
        }
        Update: {
          ano_fiscal?: number
          created_at?: string
          data_nascimento?: string | null
          departamento?: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia?: number
          dias_ferias_anuais?: number
          dias_ferias_extra?: number
          email?: string | null
          estado_civil?: string
          id?: string
          inicio_carreira?: string | null
          localizacao?: string
          margem_lucro_pct_override?: number | null
          nome?: string
          numero_colaborador?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          saldo_ferias_anterior?: number
          situacao_contractual?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          industria: string | null
          morada: string | null
          nome: string
          notas: string | null
          status: Database["public"]["Enums"]["company_status"]
          telefone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industria?: string | null
          morada?: string | null
          nome: string
          notas?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          telefone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industria?: string | null
          morada?: string | null
          nome?: string
          notas?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          telefone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          apelido: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          notas: string | null
          posicao: string | null
          primeiro_nome: string
          telefone: string | null
          telemovel: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          notas?: string | null
          posicao?: string | null
          primeiro_nome: string
          telefone?: string | null
          telemovel?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          notas?: string | null
          posicao?: string | null
          primeiro_nome?: string
          telefone?: string | null
          telemovel?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          data: string
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: string
          id?: string
          nome: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      irs_tax_brackets: {
        Row: {
          ano_fiscal: number
          created_at: string
          id: string
          localizacao: string
          notas: string | null
          numero_dependentes: number
          parcela_abater: number
          parcela_adicional_por_dependente: number
          rendimento_max: number | null
          rendimento_min: number
          tabela: string
          taxa: number
          updated_at: string
        }
        Insert: {
          ano_fiscal: number
          created_at?: string
          id?: string
          localizacao: string
          notas?: string | null
          numero_dependentes?: number
          parcela_abater?: number
          parcela_adicional_por_dependente?: number
          rendimento_max?: number | null
          rendimento_min: number
          tabela: string
          taxa: number
          updated_at?: string
        }
        Update: {
          ano_fiscal?: number
          created_at?: string
          id?: string
          localizacao?: string
          notas?: string | null
          numero_dependentes?: number
          parcela_abater?: number
          parcela_adicional_por_dependente?: number
          rendimento_max?: number | null
          rendimento_min?: number
          tabela?: string
          taxa?: number
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          codigo: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string | null
          id: string
          nome: string
          notas: string | null
          orcamento: number | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome: string
          notas?: string | null
          orcamento?: number | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome?: string
          notas?: string | null
          orcamento?: number | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_snapshots: {
        Row: {
          ajudas_custo_anual: number
          ano_fiscal: number
          beneficio_carro: number
          beneficio_ticket: number
          collaborator_id: string
          created_at: string
          dependentes_com_deficiencia: number
          dias_uteis: number
          estado_civil: string
          id: string
          irs_calculado_auto: boolean
          irs_pct: number
          is_effective: boolean
          label: string
          localizacao: string
          meses_pagos: number
          notas: string | null
          numero_dependentes: number
          numero_titulares: number
          outros_beneficios: number
          premio_associado: number
          reference_date: string
          ss_atelier_pct: number
          ss_colaborador_pct: number
          subsidio_alimentacao_diario: number
          subsidios_modo: Database["public"]["Enums"]["subsidios_modo"]
          updated_at: string
          valor_base: number
        }
        Insert: {
          ajudas_custo_anual?: number
          ano_fiscal?: number
          beneficio_carro?: number
          beneficio_ticket?: number
          collaborator_id: string
          created_at?: string
          dependentes_com_deficiencia?: number
          dias_uteis?: number
          estado_civil?: string
          id?: string
          irs_calculado_auto?: boolean
          irs_pct?: number
          is_effective?: boolean
          label: string
          localizacao?: string
          meses_pagos?: number
          notas?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          outros_beneficios?: number
          premio_associado?: number
          reference_date: string
          ss_atelier_pct?: number
          ss_colaborador_pct?: number
          subsidio_alimentacao_diario?: number
          subsidios_modo?: Database["public"]["Enums"]["subsidios_modo"]
          updated_at?: string
          valor_base?: number
        }
        Update: {
          ajudas_custo_anual?: number
          ano_fiscal?: number
          beneficio_carro?: number
          beneficio_ticket?: number
          collaborator_id?: string
          created_at?: string
          dependentes_com_deficiencia?: number
          dias_uteis?: number
          estado_civil?: string
          id?: string
          irs_calculado_auto?: boolean
          irs_pct?: number
          is_effective?: boolean
          label?: string
          localizacao?: string
          meses_pagos?: number
          notas?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          outros_beneficios?: number
          premio_associado?: number
          reference_date?: string
          ss_atelier_pct?: number
          ss_colaborador_pct?: number
          subsidio_alimentacao_diario?: number
          subsidios_modo?: Database["public"]["Enums"]["subsidios_modo"]
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vacation_requests: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          collaborator_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          dias_uteis: number
          estado: string
          id: string
          notas: string | null
          tipo: Database["public"]["Enums"]["absence_type"]
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          collaborator_id: string
          created_at?: string
          data_fim: string
          data_inicio: string
          dias_uteis?: number
          estado?: string
          id?: string
          notas?: string | null
          tipo?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          collaborator_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          dias_uteis?: number
          estado?: string
          id?: string
          notas?: string | null
          tipo?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_requests_collaborator_id_fkey"
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
      get_my_collaborator_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_users_with_roles: {
        Args: never
        Returns: {
          collaborator_departamento: string
          collaborator_id: string
          collaborator_nome: string
          created_at: string
          email: string
          is_admin: boolean
          user_id: string
        }[]
      }
      set_user_admin: {
        Args: { _is_admin: boolean; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      absence_type:
        | "ferias"
        | "casamento"
        | "falecimento_familiar"
        | "assistencia_filho"
        | "nascimento_filho"
        | "trabalhador_estudante"
        | "doacao_sangue"
        | "autorizada_paga"
        | "autorizada_nao_paga"
      app_role: "admin" | "user"
      benefit_category: "carro" | "ticket" | "premio" | "outros"
      company_status: "activo" | "prospecto" | "inactivo"
      department: "Projecto" | "Backoffice"
      expense_status: "pendente" | "aprovada" | "rejeitada" | "paga"
      project_status:
        | "proposta"
        | "em_curso"
        | "pausado"
        | "concluido"
        | "cancelado"
      subsidios_modo: "tradicional" | "duodecimos_50" | "duodecimos_100"
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
      absence_type: [
        "ferias",
        "casamento",
        "falecimento_familiar",
        "assistencia_filho",
        "nascimento_filho",
        "trabalhador_estudante",
        "doacao_sangue",
        "autorizada_paga",
        "autorizada_nao_paga",
      ],
      app_role: ["admin", "user"],
      benefit_category: ["carro", "ticket", "premio", "outros"],
      company_status: ["activo", "prospecto", "inactivo"],
      department: ["Projecto", "Backoffice"],
      expense_status: ["pendente", "aprovada", "rejeitada", "paga"],
      project_status: [
        "proposta",
        "em_curso",
        "pausado",
        "concluido",
        "cancelado",
      ],
      subsidios_modo: ["tradicional", "duodecimos_50", "duodecimos_100"],
    },
  },
} as const

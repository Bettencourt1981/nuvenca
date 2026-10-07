
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "file_shares": {
                  Row: {
                    "created_at": string,"created_by": string | null,"email": string,"file_id": string,"id": string,"role": Database["public"]['Enums']["share_role"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"email": string,"file_id": string,"id"?: string,"role": Database["public"]['Enums']["share_role"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"email"?: string,"file_id"?: string,"id"?: string,"role"?: Database["public"]['Enums']["share_role"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_shares_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
                  ]
                },"file_stars": {
                  Row: {
                    "created_at": string,"file_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"file_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_stars_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
                  ]
                },"file_versions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_id": string,"id": string,"mime_type": string | null,"size_bytes": number,"status": Database["public"]['Enums']["file_status"],"storage_path": string,"version_number": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_id": string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"storage_path": string,"version_number": number,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_id"?: string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"storage_path"?: string,"version_number"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_versions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_versions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"files": {
                  Row: {
                    "ancestor_ids": (string)[],"created_at": string,"created_by": string | null,"current_version_id": string | null,"id": string,"in_trash": boolean,"kind": Database["public"]['Enums']["file_kind"],"mime_type": string | null,"name": string,"parent_id": string | null,"size_bytes": number,"status": Database["public"]['Enums']["file_status"],"trashed_at": string | null,"trashed_by": string | null,"updated_at": string,"updated_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ancestor_ids"?: (string)[],"created_at"?: string,"created_by"?: string | null,"current_version_id"?: string | null,"id"?: string,"in_trash"?: boolean,"kind": Database["public"]['Enums']["file_kind"],"mime_type"?: string | null,"name": string,"parent_id"?: string | null,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"trashed_at"?: string | null,"trashed_by"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "ancestor_ids"?: (string)[],"created_at"?: string,"created_by"?: string | null,"current_version_id"?: string | null,"id"?: string,"in_trash"?: boolean,"kind"?: Database["public"]['Enums']["file_kind"],"mime_type"?: string | null,"name"?: string,"parent_id"?: string | null,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"trashed_at"?: string | null,"trashed_by"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "files_current_version_fkey"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "file_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "created_at": string,"currency": string,"features": NonNullable<Json>,"id": string,"is_public": boolean,"max_file_size_bytes": number,"max_members": number,"name": string,"price_monthly_cents": number | null,"price_yearly_cents": number | null,"sort_order": number,"storage_quota_bytes": number,"trash_retention_days": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"features"?: NonNullable<Json>,"id": string,"is_public"?: boolean,"max_file_size_bytes": number,"max_members": number,"name": string,"price_monthly_cents"?: number | null,"price_yearly_cents"?: number | null,"sort_order"?: number,"storage_quota_bytes": number,"trash_retention_days"?: number
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"features"?: NonNullable<Json>,"id"?: string,"is_public"?: boolean,"max_file_size_bytes"?: number,"max_members"?: number,"name"?: string,"price_monthly_cents"?: number | null,"price_yearly_cents"?: number | null,"sort_order"?: number,"storage_quota_bytes"?: number,"trash_retention_days"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"full_name": string | null,"id": string,"locale": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"locale"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"locale"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"share_links": {
                  Row: {
                    "created_at": string,"created_by": string | null,"enabled": boolean,"expires_at": string | null,"file_id": string,"id": string,"role": Database["public"]['Enums']["share_role"],"token": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"expires_at"?: string | null,"file_id": string,"id"?: string,"role"?: Database["public"]['Enums']["share_role"],"token"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"expires_at"?: string | null,"file_id"?: string,"id"?: string,"role"?: Database["public"]['Enums']["share_role"],"token"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_file_id_fkey"
      columns: ["file_id"]
isOneToOne: true
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"created_at": string,"current_period_end": string | null,"current_period_start": string | null,"id": string,"plan_id": string,"provider": string,"provider_customer_id": string | null,"provider_subscription_id": string | null,"status": Database["public"]['Enums']["subscription_status"],"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_at_period_end"?: boolean,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"id"?: string,"plan_id": string,"provider"?: string,"provider_customer_id"?: string | null,"provider_subscription_id"?: string | null,"status": Database["public"]['Enums']["subscription_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"id"?: string,"plan_id"?: string,"provider"?: string,"provider_customer_id"?: string | null,"provider_subscription_id"?: string | null,"status"?: Database["public"]['Enums']["subscription_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["workspace_role"],"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["workspace_role"],"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["workspace_role"],"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["workspace_kind"],"name": string,"owner_id": string,"plan_id": string,"storage_used_bytes": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["workspace_kind"],"name": string,"owner_id": string,"plan_id"?: string,"storage_used_bytes"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["workspace_kind"],"name"?: string,"owner_id"?: string,"plan_id"?: string,"storage_used_bytes"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspaces_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_workspace_member":
{ Args: { "p_email": string,"p_role": Database["public"]['Enums']["workspace_role"],"p_workspace_id": string }; Returns: {
              "created_at": string,
"role": Database["public"]['Enums']["workspace_role"],
"user_id": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "workspace_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"assert_file_access":
{ Args: { "p_file_id": string,"p_min_level": number }; Returns: {
              "ancestor_ids": (string)[],
"created_at": string,
"created_by": string | null,
"current_version_id": string | null,
"id": string,
"in_trash": boolean,
"kind": Database["public"]['Enums']["file_kind"],
"mime_type": string | null,
"name": string,
"parent_id": string | null,
"size_bytes": number,
"status": Database["public"]['Enums']["file_status"],
"trashed_at": string | null,
"trashed_by": string | null,
"updated_at": string,
"updated_by": string | null,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "files"
        isOneToOne: true
        isSetofReturn: false
      } },
"begin_upload":
{ Args: { "p_mime_type": string,"p_name": string,"p_parent_id": string,"p_size_bytes": number,"p_workspace_id": string }; Returns: {
              "file_id": string,"storage_path": string,"version_id": string
            }[]
                           },
"cancel_upload":
{ Args: { "p_file_id": string }; Returns: string
                           },
"claim_pending_shares":
{ Args: { "p_email": string,"p_user_id": string }; Returns: undefined
                           },
"clean_name":
{ Args: { "p_name": string }; Returns: string
                           },
"complete_upload":
{ Args: { "p_mime_type": string,"p_size_bytes": number,"p_version_id": string }; Returns: {
              "ancestor_ids": (string)[],
"created_at": string,
"created_by": string | null,
"current_version_id": string | null,
"id": string,
"in_trash": boolean,
"kind": Database["public"]['Enums']["file_kind"],
"mime_type": string | null,
"name": string,
"parent_id": string | null,
"size_bytes": number,
"status": Database["public"]['Enums']["file_status"],
"trashed_at": string | null,
"trashed_by": string | null,
"updated_at": string,
"updated_by": string | null,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "files"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_folder":
{ Args: { "p_name": string,"p_parent_id": string,"p_workspace_id": string }; Returns: {
              "ancestor_ids": (string)[],
"created_at": string,
"created_by": string | null,
"current_version_id": string | null,
"id": string,
"in_trash": boolean,
"kind": Database["public"]['Enums']["file_kind"],
"mime_type": string | null,
"name": string,
"parent_id": string | null,
"size_bytes": number,
"status": Database["public"]['Enums']["file_status"],
"trashed_at": string | null,
"trashed_by": string | null,
"updated_at": string,
"updated_by": string | null,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "files"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_team_workspace":
{ Args: { "p_name": string }; Returns: {
              "created_at": string,
"id": string,
"kind": Database["public"]['Enums']["workspace_kind"],
"name": string,
"owner_id": string,
"plan_id": string,
"storage_used_bytes": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "workspaces"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_files_forever":
{ Args: { "p_file_ids": (string)[] }; Returns: (string)[]
                           },
"empty_trash":
{ Args: { "p_workspace_id": string }; Returns: (string)[]
                           },
"file_access_level":
{ Args: { "p_file_id": string }; Returns: number
                           },
"file_path_access_level":
{ Args: { "p_path": (string)[],"p_workspace_id": string }; Returns: number
                           },
"get_file_access_list":
{ Args: { "p_file_id": string }; Returns: {
              "avatar_url": string,"email": string,"full_name": string,"inherited_from": string,"is_pending": boolean,"role": Database["public"]['Enums']["share_role"],"share_id": string,"user_id": string
            }[]
                           },
"get_profiles":
{ Args: { "p_user_ids": (string)[] }; Returns: {
              "avatar_url": string,"email": string,"full_name": string,"id": string
            }[]
                           },
"get_workspace_members":
{ Args: { "p_workspace_id": string }; Returns: {
              "avatar_url": string,"created_at": string,"email": string,"full_name": string,"role": Database["public"]['Enums']["workspace_role"],"user_id": string
            }[]
                           },
"is_workspace_member":
{ Args: { "p_workspace_id": string }; Returns: boolean
                           },
"move_files":
{ Args: { "p_file_ids": (string)[],"p_target_parent_id": string }; Returns: number
                           },
"purge_expired_items":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"remove_share":
{ Args: { "p_share_id": string }; Returns: undefined
                           },
"remove_workspace_member":
{ Args: { "p_user_id": string,"p_workspace_id": string }; Returns: undefined
                           },
"rename_file":
{ Args: { "p_file_id": string,"p_name": string }; Returns: {
              "ancestor_ids": (string)[],
"created_at": string,
"created_by": string | null,
"current_version_id": string | null,
"id": string,
"in_trash": boolean,
"kind": Database["public"]['Enums']["file_kind"],
"mime_type": string | null,
"name": string,
"parent_id": string | null,
"size_bytes": number,
"status": Database["public"]['Enums']["file_status"],
"trashed_at": string | null,
"trashed_by": string | null,
"updated_at": string,
"updated_by": string | null,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "files"
        isOneToOne: true
        isSetofReturn: false
      } },
"rename_workspace":
{ Args: { "p_name": string,"p_workspace_id": string }; Returns: {
              "created_at": string,
"id": string,
"kind": Database["public"]['Enums']["workspace_kind"],
"name": string,
"owner_id": string,
"plan_id": string,
"storage_used_bytes": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "workspaces"
        isOneToOne: true
        isSetofReturn: false
      } },
"require_user":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"resolve_target_workspace":
{ Args: { "p_parent_id": string,"p_workspace_id": string }; Returns: string
                           },
"restore_files":
{ Args: { "p_file_ids": (string)[] }; Returns: number
                           },
"set_share_link":
{ Args: { "p_enabled": boolean,"p_file_id": string,"p_role": Database["public"]['Enums']["share_role"] }; Returns: {
              "created_at": string,
"created_by": string | null,
"enabled": boolean,
"expires_at": string | null,
"file_id": string,
"id": string,
"role": Database["public"]['Enums']["share_role"],
"token": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "share_links"
        isOneToOne: true
        isSetofReturn: false
      } },
"share_file":
{ Args: { "p_email": string,"p_file_id": string,"p_role": Database["public"]['Enums']["share_role"] }; Returns: {
              "created_at": string,
"created_by": string | null,
"email": string,
"file_id": string,
"id": string,
"role": Database["public"]['Enums']["share_role"],
"updated_at": string,
"user_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "file_shares"
        isOneToOne: true
        isSetofReturn: false
      } },
"share_role_level":
{ Args: { "p_role": Database["public"]['Enums']["share_role"] }; Returns: number
                           },
"shared_with_me":
{ Args: Record<PropertyKey, never>; Returns: {
              "ancestor_ids": (string)[],
"created_at": string,
"created_by": string | null,
"current_version_id": string | null,
"id": string,
"in_trash": boolean,
"kind": Database["public"]['Enums']["file_kind"],
"mime_type": string | null,
"name": string,
"parent_id": string | null,
"size_bytes": number,
"status": Database["public"]['Enums']["file_status"],
"trashed_at": string | null,
"trashed_by": string | null,
"updated_at": string,
"updated_by": string | null,
"workspace_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "files"
        isOneToOne: false
        isSetofReturn: true
      } },
"trash_files":
{ Args: { "p_file_ids": (string)[] }; Returns: number
                           },
"update_profile":
{ Args: { "p_full_name": string,"p_locale": string }; Returns: {
              "avatar_url": string | null,
"created_at": string,
"email": string,
"full_name": string | null,
"id": string,
"locale": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_share":
{ Args: { "p_role": Database["public"]['Enums']["share_role"],"p_share_id": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"email": string,
"file_id": string,
"id": string,
"role": Database["public"]['Enums']["share_role"],
"updated_at": string,
"user_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "file_shares"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_workspace_member":
{ Args: { "p_role": Database["public"]['Enums']["workspace_role"],"p_user_id": string,"p_workspace_id": string }; Returns: undefined
                           },
"workspace_role_of":
{ Args: { "p_workspace_id": string }; Returns: Database["public"]['Enums']["workspace_role"]
                           }
          }
          Enums: {
            "file_kind": "folder"|"file","file_status": "uploading"|"ready","share_role": "viewer"|"commenter"|"editor","subscription_status": "trialing"|"active"|"past_due"|"canceled","workspace_kind": "personal"|"team","workspace_role": "owner"|"admin"|"member"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "file_kind": ["folder", "file"],"file_status": ["uploading", "ready"],"share_role": ["viewer", "commenter", "editor"],"subscription_status": ["trialing", "active", "past_due", "canceled"],"workspace_kind": ["personal", "team"],"workspace_role": ["owner", "admin", "member"]
          }
        }
} as const

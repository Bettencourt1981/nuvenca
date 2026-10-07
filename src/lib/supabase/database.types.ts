
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
            "document_assets": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_id": string,"id": string,"mime_type": string | null,"size_bytes": number,"status": Database["public"]['Enums']["file_status"],"storage_path": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_id": string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"storage_path": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_id"?: string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"storage_path"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_assets_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_assets_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_assets_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"document_comments": {
                  Row: {
                    "anchor": Json | null,"body": string,"created_at": string,"created_by": string | null,"file_id": string,"id": string,"parent_id": string | null,"quote": string | null,"resolved_at": string | null,"resolved_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor"?: Json | null,"body": string,"created_at"?: string,"created_by"?: string | null,"file_id": string,"id"?: string,"parent_id"?: string | null,"quote"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "anchor"?: Json | null,"body"?: string,"created_at"?: string,"created_by"?: string | null,"file_id"?: string,"id"?: string,"parent_id"?: string | null,"quote"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_comments_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_comments_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "document_comments"
      referencedColumns: ["id"]
    }
                  ]
                },"document_states": {
                  Row: {
                    "file_id": string,"revision": number,"state": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "file_id": string,"revision"?: number,"state": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "file_id"?: string,"revision"?: number,"state"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_states_file_id_fkey"
      columns: ["file_id"]
isOneToOne: true
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_states_file_id_fkey"
      columns: ["file_id"]
isOneToOne: true
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_states_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"document_updates": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_id": string,"id": number,"payload": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_id": string,"id"?: never,"payload": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_id"?: string,"id"?: never,"payload"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_updates_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_updates_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
                  ]
                },"document_versions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_id": string,"id": string,"label": string | null,"state": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_id": string,"id"?: string,"label"?: string | null,"state": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_id"?: string,"id"?: string,"label"?: string | null,"state"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_versions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_versions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_versions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"file_shares": {
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
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
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
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
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
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
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
      referencedRelation: "drive_items"
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
      referencedRelation: "drive_items"
      referencedColumns: ["id"]
    },{
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
            "drive_items": {
                  Row: {
                    "access_level": number | null,"ancestor_ids": (string)[] | null,"created_at": string | null,"created_by": string | null,"id": string | null,"in_trash": boolean | null,"kind": Database["public"]['Enums']["file_kind"] | null,"mime_type": string | null,"name": string | null,"owner_name": string | null,"parent_id": string | null,"size_bytes": number | null,"starred": boolean | null,"status": Database["public"]['Enums']["file_status"] | null,"trashed_at": string | null,"updated_at": string | null,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "access_level"?: never,"ancestor_ids"?: (string)[] | null,"created_at"?: string | null,"created_by"?: string | null,"id"?: string | null,"in_trash"?: boolean | null,"kind"?: Database["public"]['Enums']["file_kind"] | null,"mime_type"?: string | null,"name"?: string | null,"owner_name"?: never,"parent_id"?: string | null,"size_bytes"?: number | null,"starred"?: never,"status"?: Database["public"]['Enums']["file_status"] | null,"trashed_at"?: string | null,"updated_at"?: string | null,"workspace_id"?: string | null
                         }
                        Update: {
                           "access_level"?: never,"ancestor_ids"?: (string)[] | null,"created_at"?: string | null,"created_by"?: string | null,"id"?: string | null,"in_trash"?: boolean | null,"kind"?: Database["public"]['Enums']["file_kind"] | null,"mime_type"?: string | null,"name"?: string | null,"owner_name"?: never,"parent_id"?: string | null,"size_bytes"?: number | null,"starred"?: never,"status"?: Database["public"]['Enums']["file_status"] | null,"trashed_at"?: string | null,"updated_at"?: string | null,"workspace_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "files_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "drive_items"
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
                }
          }
          Functions: {
            "add_comment":
{ Args: { "p_anchor": Json,"p_body": string,"p_file_id": string,"p_parent_id": string,"p_quote": string }; Returns: {
              "anchor": Json | null,
"body": string,
"created_at": string,
"created_by": string | null,
"file_id": string,
"id": string,
"parent_id": string | null,
"quote": string | null,
"resolved_at": string | null,
"resolved_by": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "document_comments"
        isOneToOne: true
        isSetofReturn: false
      } },
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
"append_document_update":
{ Args: { "p_file_id": string,"p_payload": string }; Returns: number
                           },
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
"assert_native_file":
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
"b64":
{ Args: { "p_data": string }; Returns: string
                           },
"begin_asset_upload":
{ Args: { "p_file_id": string,"p_mime_type": string,"p_size_bytes": number }; Returns: {
              "asset_id": string,"storage_path": string
            }[]
                           },
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
"compact_document":
{ Args: { "p_expected_revision": number,"p_file_id": string,"p_last_update_id": number,"p_state": string }; Returns: boolean
                           },
"complete_asset_upload":
{ Args: { "p_asset_id": string,"p_size_bytes": number }; Returns: undefined
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
"create_document_version":
{ Args: { "p_file_id": string,"p_label": string,"p_state": string }; Returns: string
                           },
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
"create_native_file":
{ Args: { "p_name": string,"p_parent_id": string,"p_state": string,"p_type": string,"p_workspace_id": string }; Returns: {
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
"delete_comment":
{ Args: { "p_comment_id": string }; Returns: undefined
                           },
"delete_files_forever":
{ Args: { "p_file_ids": (string)[] }; Returns: (string)[]
                           },
"edit_comment":
{ Args: { "p_body": string,"p_comment_id": string }; Returns: undefined
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
"get_document_version":
{ Args: { "p_version_id": string }; Returns: string
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
"is_native_mime":
{ Args: { "p_mime": string }; Returns: boolean
                           },
"is_workspace_member":
{ Args: { "p_workspace_id": string }; Returns: boolean
                           },
"join_via_link":
{ Args: { "p_token": string }; Returns: string
                           },
"label_document_version":
{ Args: { "p_label": string,"p_version_id": string }; Returns: undefined
                           },
"list_document_versions":
{ Args: { "p_file_id": string }; Returns: {
              "author_name": string,"created_at": string,"created_by": string,"id": string,"label": string,"size_bytes": number
            }[]
                           },
"load_document":
{ Args: { "p_file_id": string }; Returns: Json
                           },
"move_files":
{ Args: { "p_file_ids": (string)[],"p_target_parent_id": string }; Returns: number
                           },
"profile_display_name":
{ Args: { "p_user_id": string }; Returns: string
                           },
"purge_expired_items":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"realtime_file_access":
{ Args: { "p_topic": string }; Returns: number
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
"resolve_comment":
{ Args: { "p_comment_id": string,"p_resolved": boolean }; Returns: undefined
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
"unb64":
{ Args: { "p_text": string }; Returns: string
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

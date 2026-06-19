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
      alerts: {
        Row: {
          action: string;
          created_at: string;
          device_id: string | null;
          id: string;
          message: string;
          severity: "Critical" | "Warning" | "Informational";
          type: "high_turbidity" | "rapid_increase" | "sensor_stability";
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          device_id?: string | null;
          id?: string;
          message: string;
          severity: "Critical" | "Warning" | "Informational";
          type: "high_turbidity" | "rapid_increase" | "sensor_stability";
          user_id?: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          device_id?: string | null;
          id?: string;
          message?: string;
          severity?: "Critical" | "Warning" | "Informational";
          type?: "high_turbidity" | "rapid_increase" | "sensor_stability";
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      environment_settings: {
        Row: {
          container_type: "Glass" | "Plastic" | "Beaker" | "Bottle" | "Laboratory Tube" | "Other";
          created_at: string;
          id: string;
          light_condition: "Present" | "Not Present";
          notes: string | null;
          updated_at: string;
          user_id: string;
          water_type: "Distilled Water" | "Tap Water" | "River Water" | "Lake Water" | "Ground Water" | "Other";
          water_volume_ml: number | string | null;
        };
        Insert: {
          container_type: "Glass" | "Plastic" | "Beaker" | "Bottle" | "Laboratory Tube" | "Other";
          created_at?: string;
          id?: string;
          light_condition: "Present" | "Not Present";
          notes?: string | null;
          updated_at?: string;
          user_id: string;
          water_type: "Distilled Water" | "Tap Water" | "River Water" | "Lake Water" | "Ground Water" | "Other";
          water_volume_ml?: number | string | null;
        };
        Update: {
          container_type?: "Glass" | "Plastic" | "Beaker" | "Bottle" | "Laboratory Tube" | "Other";
          created_at?: string;
          id?: string;
          light_condition?: "Present" | "Not Present";
          notes?: string | null;
          updated_at?: string;
          user_id?: string;
          water_type?: "Distilled Water" | "Tap Water" | "River Water" | "Lake Water" | "Ground Water" | "Other";
          water_volume_ml?: number | string | null;
        };
        Relationships: [
          {
            foreignKeyName: "environment_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      monitoring_sessions: {
        Row: {
          created_at: string;
          id: string;
          started_at: string;
          status: "active" | "stopped";
          stopped_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          started_at?: string;
          status: "active" | "stopped";
          stopped_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          started_at?: string;
          status?: "active" | "stopped";
          stopped_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monitoring_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      predictions: {
        Row: {
          confidence: number;
          created_at: string;
          id: string;
          label: "Critical Condition Expected" | "Stable Trend" | "Rising Turbidity";
          projected_ntu: number;
          reading_id: string | number | null;
          user_id: string;
        };
        Insert: {
          confidence: number;
          created_at?: string;
          id?: string;
          label: "Critical Condition Expected" | "Stable Trend" | "Rising Turbidity";
          projected_ntu: number;
          reading_id?: string | number | null;
          user_id?: string;
        };
        Update: {
          confidence?: number;
          created_at?: string;
          id?: string;
          label?: "Critical Condition Expected" | "Stable Trend" | "Rising Turbidity";
          projected_ntu?: number;
          reading_id?: string | number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "predictions_reading_id_fkey";
            columns: ["reading_id"];
            isOneToOne: false;
            referencedRelation: "water_readings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "predictions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      sensor_health: {
        Row: {
          consecutive_failures: number;
          current_ip_address: string | null;
          current_ssid: string | null;
          device_id: string | null;
          device_ip_address: string | null;
          firmware_version: string | null;
          id: string;
          last_reading_at: string | null;
          last_successful_post_at: string | null;
          mac_address: string | null;
          sensor_status: "ONLINE" | "OFFLINE" | "UNKNOWN";
          setup_mode: boolean;
          signal_strength_dbm: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          consecutive_failures?: number;
          current_ip_address?: string | null;
          current_ssid?: string | null;
          device_id?: string | null;
          device_ip_address?: string | null;
          firmware_version?: string | null;
          id?: string;
          last_reading_at?: string | null;
          last_successful_post_at?: string | null;
          mac_address?: string | null;
          sensor_status?: "ONLINE" | "OFFLINE" | "UNKNOWN";
          setup_mode?: boolean;
          signal_strength_dbm?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          consecutive_failures?: number;
          current_ip_address?: string | null;
          current_ssid?: string | null;
          device_id?: string | null;
          device_ip_address?: string | null;
          firmware_version?: string | null;
          id?: string;
          last_reading_at?: string | null;
          last_successful_post_at?: string | null;
          mac_address?: string | null;
          sensor_status?: "ONLINE" | "OFFLINE" | "UNKNOWN";
          setup_mode?: boolean;
          signal_strength_dbm?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sensor_health_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      system_logs: {
        Row: {
          category: "reading" | "alert" | "prediction" | "system";
          created_at: string;
          id: string;
          message: string;
          severity: "Critical" | "Warning" | "Informational";
          user_id: string;
        };
        Insert: {
          category: "reading" | "alert" | "prediction" | "system";
          created_at?: string;
          id?: string;
          message: string;
          severity: "Critical" | "Warning" | "Informational";
          user_id?: string;
        };
        Update: {
          category?: "reading" | "alert" | "prediction" | "system";
          created_at?: string;
          id?: string;
          message?: string;
          severity?: "Critical" | "Warning" | "Informational";
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "system_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      water_readings: {
        Row: {
          container_type: "Glass" | "Plastic" | "Beaker" | "Bottle" | "Laboratory Tube" | "Other" | null;
          created_at: string;
          id: string | number;
          light_condition: "Present" | "Not Present" | null;
          monitoring_session_id: string | null;
          turbidity: number | string;
          user_id: string;
          water_type: "Distilled Water" | "Tap Water" | "River Water" | "Lake Water" | "Ground Water" | "Other" | null;
          water_volume_ml: number | string | null;
        };
        Insert: {
          container_type?: "Glass" | "Plastic" | "Beaker" | "Bottle" | "Laboratory Tube" | "Other" | null;
          created_at?: string;
          id?: string | number;
          light_condition?: "Present" | "Not Present" | null;
          monitoring_session_id?: string | null;
          turbidity: number;
          user_id?: string;
          water_type?: "Distilled Water" | "Tap Water" | "River Water" | "Lake Water" | "Ground Water" | "Other" | null;
          water_volume_ml?: number | string | null;
        };
        Update: {
          container_type?: "Glass" | "Plastic" | "Beaker" | "Bottle" | "Laboratory Tube" | "Other" | null;
          created_at?: string;
          id?: string | number;
          light_condition?: "Present" | "Not Present" | null;
          monitoring_session_id?: string | null;
          turbidity?: number;
          user_id?: string;
          water_type?: "Distilled Water" | "Tap Water" | "River Water" | "Lake Water" | "Ground Water" | "Other" | null;
          water_volume_ml?: number | string | null;
        };
        Relationships: [
          {
            foreignKeyName: "water_readings_monitoring_session_id_fkey";
            columns: ["monitoring_session_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "water_readings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

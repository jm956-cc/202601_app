import { adminApi } from "./httpClient";

/**
 * Admin Vault API
 * Reconstructed based on backend routes and proper typings.
 */

export interface VaultProgramResponse {
    key: string;
    name: string;
    duration_hours: number;
    expire_policy: string | null;
    is_active: boolean;
    unlock_rules_json: any;
    ui_copy_json: any;
    config_json: any;
}

export interface VaultStatsResponse {
    today_accrual: Record<string, { count: number; total: number }>;
    today_skips: Record<string, number>;
    expiring_soon_24h: number;
    today_unlock_cash: number;
    timestamp: string;
}

export interface VaultEligibilityResponse {
    user_id: number;
    eligible: boolean;
}

export interface VaultTimerState {
    user_id: number;
    eligible: boolean;
    vault_balance: number;
    locked_balance: number;
    available_balance: number;
    cash_balance: number;
    expires_at: string | null;
    locked_expires_at: string | null;
    accrual_multiplier?: number | null;
    program_key?: string | null;
}

export const getVaultDefaultProgram = async (): Promise<VaultProgramResponse> => {
    const { data } = await adminApi.get<VaultProgramResponse>("/admin/api/vault-programs/default/");
    return data;
};

export const getVaultProgramByKey = async (programKey: string): Promise<VaultProgramResponse> => {
    const { data } = await adminApi.get<VaultProgramResponse>(`/admin/api/vault-programs/${programKey}/`);
    return data;
};

export const updateVaultUnlockRules = async (
    programKey: string,
    unlockRulesJson: any
): Promise<VaultProgramResponse> => {
    const { data } = await adminApi.put<VaultProgramResponse>(`/admin/api/vault-programs/${programKey}/unlock-rules/`, {
        unlock_rules_json: unlockRulesJson,
    });
    return data;
};

export const updateVaultUiCopy = async (
    programKey: string,
    uiCopyJson: any
): Promise<VaultProgramResponse> => {
    const { data } = await adminApi.put<VaultProgramResponse>(`/admin/api/vault-programs/${programKey}/ui-copy/`, {
        ui_copy_json: uiCopyJson,
    });
    return data;
};

export const updateVaultConfig = async (
    programKey: string,
    configJson: any
): Promise<VaultProgramResponse> => {
    const { data } = await adminApi.put<VaultProgramResponse>(`/admin/api/vault-programs/${programKey}/config/`, {
        config_json: configJson,
    });
    return data;
};

export const toggleVaultGameEarn = async (
    programKey: string,
    enabled: boolean
): Promise<VaultProgramResponse> => {
    const { data } = await adminApi.post<VaultProgramResponse>(`/admin/api/vault-programs/${programKey}/game-earn-toggle/`, {
        enabled,
    });
    return data;
};

export const getVaultEligibility = async (
    programKey: string,
    userId: number
): Promise<VaultEligibilityResponse> => {
    const { data } = await adminApi.get<VaultEligibilityResponse>(`/admin/api/vault-programs/${programKey}/eligibility/${userId}/`);
    return data;
};

export const setVaultEligibility = async (
    programKey: string,
    userId: number,
    eligible: boolean
): Promise<VaultEligibilityResponse> => {
    const { data } = await adminApi.post<VaultEligibilityResponse>(`/admin/api/vault-programs/${programKey}/eligibility/${userId}/`, {
        eligible,
    });
    return data;
};

export const getVaultTimerState = async (userId: number): Promise<VaultTimerState> => {
    const { data } = await adminApi.get<VaultTimerState>(`/admin/api/vault/${userId}/`);
    return data;
};

export const postVaultTimerAction = async (
    userId: number,
    action: "reset" | "expire_now" | "start_now"
): Promise<VaultTimerState> => {
    const { data } = await adminApi.post<VaultTimerState>(`/admin/api/vault/${userId}/timer/`, { action });
    return data;
};

export const getVaultStats = async (): Promise<VaultStatsResponse> => {
    const { data } = await adminApi.get<VaultStatsResponse>("/admin/api/vault-programs/stats/");
    return data;
};

export const tickVaultTransitions = async (): Promise<{ updated: number }> => {
    const { data } = await adminApi.post<{ updated: number }>("/admin/api/vault2/tick/");
    return data;
};

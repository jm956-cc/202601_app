import apiClient from "./apiClient";
import { adminApi } from "../admin/api/httpClient";
import { TeamSeason, Team, LeaderboardEntry, ContributorEntry, TeamJoinResponse, TeamMembership } from "../types/teamBattle";

export const getActiveSeason = async (): Promise<TeamSeason | null> => {
  const res = await apiClient.get("/api/team-battle/seasons/active");
  return res.data || null;
};

export const listTeams = async (): Promise<Team[]> => {
  const res = await apiClient.get("/api/team-battle/teams");
  return res.data;
};

export const joinTeam = async (teamId: number): Promise<TeamJoinResponse> => {
  const res = await apiClient.post("/api/team-battle/teams/join", { team_id: teamId });
  return res.data;
};

export const autoAssignTeam = async (): Promise<TeamJoinResponse> => {
  const res = await apiClient.post("/api/team-battle/teams/auto-assign");
  return res.data;
};

export const leaveTeam = async (): Promise<{ left: boolean }> => {
  const res = await apiClient.post("/api/team-battle/teams/leave");
  return res.data;
};

export const getLeaderboard = async (seasonId?: number, limit = 20, offset = 0): Promise<LeaderboardEntry[]> => {
  const res = await apiClient.get("/api/team-battle/teams/leaderboard", { params: { season_id: seasonId, limit, offset } });
  return res.data;
};

export const getContributors = async (teamId: number, seasonId?: number, limit = 10, offset = 0): Promise<ContributorEntry[]> => {
  const res = await apiClient.get(`/api/team-battle/teams/${teamId}/contributors`, { params: { season_id: seasonId, limit, offset } });
  return res.data;
};

export const getMyContribution = async (teamId: number, seasonId?: number): Promise<ContributorEntry | null> => {
  const res = await apiClient.get(`/api/team-battle/teams/${teamId}/contributors/me`, { params: { season_id: seasonId } });
  return res.data || null;
};

export const getMyTeam = async (): Promise<TeamMembership | null> => {
  const res = await apiClient.get("/api/team-battle/teams/me");
  return res.data || null;
};

// Admin APIs
export const createSeason = async (payload: { name: string; starts_at: string; ends_at: string; is_active: boolean; rewards_schema?: Record<string, unknown> }) => {
  const res = await adminApi.post("/admin/api/team-battle/seasons", payload);
  return res.data as TeamSeason;
};

export const updateSeason = async (seasonId: number, payload: Partial<{ name: string; starts_at: string; ends_at: string; is_active: boolean; rewards_schema?: Record<string, unknown> }>) => {
  const res = await adminApi.patch(`/admin/api/team-battle/seasons/${seasonId}`, payload);
  return res.data as TeamSeason;
};

export const deleteSeason = async (seasonId: number) => {
  const res = await adminApi.delete(`/admin/api/team-battle/seasons/${seasonId}`);
  return res.data;
};

export const setSeasonActive = async (seasonId: number, isActive: boolean) => {
  const res = await adminApi.post(`/admin/api/team-battle/seasons/${seasonId}/active`, null, { params: { is_active: isActive } });
  return res.data as TeamSeason;
};

export const createTeam = async (payload: { name: string; icon?: string | null }, leaderUserId?: number) => {
  const res = await adminApi.post("/admin/api/team-battle/teams", payload, { params: { leader_user_id: leaderUserId } });
  return res.data as Team;
};

export const listTeamsAdmin = async (includeInactive = true): Promise<Team[]> => {
  const res = await adminApi.get("/admin/api/team-battle/teams", { params: { include_inactive: includeInactive } });
  return res.data as Team[];
};

export const updateTeam = async (teamId: number, payload: Partial<{ name: string; icon?: string | null; is_active: boolean }>) => {
  const res = await adminApi.patch(`/admin/api/team-battle/teams/${teamId}`, payload);
  return res.data as Team;
};

export const deleteTeam = async (teamId: number) => {
  const res = await adminApi.delete(`/admin/api/team-battle/teams/${teamId}`);
  return res.data;
};

export const settleSeason = async (seasonId: number) => {
  const res = await adminApi.post(`/admin/api/team-battle/seasons/${seasonId}/settle`);
  return res.data;
};

export const forceJoinTeam = async (payload: { team_id: number; user_id: number }) => {
  const res = await adminApi.post(`/admin/api/team-battle/teams/force-join`, payload);
  return res.data as TeamJoinResponse & { bypass_selection?: boolean };
};

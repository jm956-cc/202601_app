import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  createSeason,
  setSeasonActive,
  createTeam,
  settleSeason,
  getActiveSeason,
  updateSeason,
  deleteSeason,
  listTeamsAdmin,
  updateTeam,
  deleteTeam,
  forceJoinTeam,
  getLeaderboard,
  getContributors,
} from "../../api/teamBattleApi";
import { fetchUsers, AdminUser } from "../api/adminUserApi";
import { Team, TeamSeason, LeaderboardEntry, ContributorEntry } from "../../types/teamBattle";

type TabKey = "season" | "team" | "leaderboard" | "force";

const formatDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-");

const AdminTeamBattlePage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("season");
  const [season, setSeason] = useState<TeamSeason | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamEdits, setTeamEdits] = useState<Record<number, { name: string; icon: string; is_active: boolean }>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [contributors, setContributors] = useState<ContributorEntry[]>([]);
  const [selectedTeamForContrib, setSelectedTeamForContrib] = useState<number | "" | null>(null);
  const [contribLimit, setContribLimit] = useState(20);
  const [contribOffset, setContribOffset] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState({ name: "", starts_at: "", ends_at: "", is_active: false });
  const [seasonEditForm, setSeasonEditForm] = useState({ name: "", starts_at: "", ends_at: "", is_active: false });
  const [teamForm, setTeamForm] = useState({ name: "", icon: "", leader_user_id: "" });
  const [forceJoinForm, setForceJoinForm] = useState({ user_id: "", team_id: "" });
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createSeasonBusy, setCreateSeasonBusy] = useState(false);
  const [activateBusy, setActivateBusy] = useState(false);
  const [createTeamBusy, setCreateTeamBusy] = useState(false);
  const [settleBusy, setSettleBusy] = useState(false);
  const [updateSeasonBusy, setUpdateSeasonBusy] = useState(false);
  const [deleteSeasonBusy, setDeleteSeasonBusy] = useState(false);
  const [teamBusy, setTeamBusy] = useState<number | null>(null);
  const [teamDeleteBusy, setTeamDeleteBusy] = useState<number | null>(null);
  const [forceJoinBusy, setForceJoinBusy] = useState(false);
  const [contributorsBusy, setContributorsBusy] = useState(false);

  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);

  const inputClass =
    "w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]";
  const cardClass = "rounded-lg border border-[#333333] bg-[#111111] p-6 shadow-md";

  const refresh = async () => {
    setError(null);
    setRefreshing(true);
    try {
      const [s, t, lb, users] = await Promise.all([
        getActiveSeason(),
        listTeamsAdmin(true),
        getLeaderboard(undefined, 100, 0),
        fetchUsers(),
      ]);

      const tArr = Array.isArray(t) ? t : [];
      const lbArr = Array.isArray(lb) ? lb : [];
      const usersArr = Array.isArray(users) ? users : [];

      setSeason(s);
      setAllUsers(usersArr);
      if (s) {
        setSeasonEditForm({
          name: s.name,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          is_active: s.is_active,
        });
      }
      setTeams(tArr);
      setLeaderboard(lbArr);

      if (lbArr.length > 0 && selectedTeamForContrib === null) {
        setSelectedTeamForContrib(lbArr[0].team_id);
      }

      const mapped = tArr.reduce<Record<number, { name: string; icon: string; is_active: boolean }>>((acc, team) => {
        acc[team.id] = { name: team.name, icon: team.icon || "", is_active: team.is_active };
        return acc;
      }, {});
      setTeamEdits(mapped);
    } catch (err) {
      console.error(err);
      setError("데이터를 불러오지 못했습니다.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    // 탭 전환 시 메시지/에러는 유지하지 않고 정리
    setMessage(null);
    setError(null);
  }, [tab]);

  const loadContributors = async (teamId: number | "" | null, seasonId?: number) => {
    if (!teamId || !seasonId) {
      setContributors([]);
      return;
    }
    setContributorsBusy(true);
    try {
      const data = await getContributors(teamId as number, seasonId, contribLimit, contribOffset);
      setContributors(data);
    } catch (err) {
      console.error(err);
      setError("기여도 목록을 불러오지 못했습니다.");
    } finally {
      setContributorsBusy(false);
    }
  };

  useEffect(() => {
    if (season) {
      loadContributors(selectedTeamForContrib, season.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamForContrib, contribLimit, contribOffset, season?.id]);

  const handleCreateSeason = async () => {
    setError(null);
    setMessage(null);
    setCreateSeasonBusy(true);
    try {
      const payload = {
        name: seasonForm.name,
        starts_at: seasonForm.starts_at,
        ends_at: seasonForm.ends_at,
        is_active: seasonForm.is_active,
      };
      const res = await createSeason(payload);
      setSeason(res);
      setSeasonEditForm({ name: res.name, starts_at: res.starts_at, ends_at: res.ends_at, is_active: res.is_active });
      setMessage("시즌 생성 완료");
      setShowSeasonModal(false);
      setSeasonForm({ name: "", starts_at: "", ends_at: "", is_active: false });
    } catch (err) {
      console.error(err);
      setError("시즌 생성 실패");
    } finally {
      setCreateSeasonBusy(false);
    }
  };

  const handleActivate = async () => {
    if (!season) return;
    setError(null);
    setMessage(null);
    setActivateBusy(true);
    try {
      const res = await setSeasonActive(season.id, true);
      setSeason(res);
      setMessage("시즌 활성화 완료");
    } catch (err) {
      console.error(err);
      setError("시즌 활성화 실패");
    } finally {
      setActivateBusy(false);
    }
  };

  const handleCreateTeam = async () => {
    setError(null);
    setMessage(null);
    setCreateTeamBusy(true);
    try {
      await createTeam({ name: teamForm.name, icon: teamForm.icon || null }, teamForm.leader_user_id ? Number(teamForm.leader_user_id) : undefined);
      setTeamForm({ name: "", icon: "", leader_user_id: "" });
      await refresh();
      setMessage("팀 생성 완료");
      setShowTeamModal(false);
    } catch (err) {
      console.error(err);
      setError("팀 생성 실패");
    } finally {
      setCreateTeamBusy(false);
    }
  };

  const handleSettle = async () => {
    if (!season) return;
    if (!leaderboard.length) {
      setError("정산할 점수가 없습니다. 리더보드가 비어있습니다.");
      return;
    }
    setError(null);
    setMessage(null);
    setSettleBusy(true);
    try {
      await settleSeason(season.id);
      setMessage("정산 완료 (우승팀 CC 코인 지급)");
    } catch (err) {
      console.error(err);
      setError("정산 실패");
    } finally {
      setSettleBusy(false);
    }
  };

  const handleUpdateSeason = async () => {
    if (!season) return;
    setError(null);
    setMessage(null);
    setUpdateSeasonBusy(true);
    try {
      const res = await updateSeason(season.id, seasonEditForm);
      setSeason(res);
      setMessage("시즌 수정 완료");
    } catch (err) {
      console.error(err);
      setError("시즌 수정 실패");
    } finally {
      setUpdateSeasonBusy(false);
    }
  };

  const handleContribPrev = () => {
    setContribOffset(Math.max(contribOffset - contribLimit, 0));
  };

  const handleContribNext = () => {
    if (contributors.length < contribLimit) return;
    setContribOffset(contribOffset + contribLimit);
  };

  const handleDeleteSeason = async () => {
    if (!season) return;
    setError(null);
    setMessage(null);
    setDeleteSeasonBusy(true);
    try {
      await deleteSeason(season.id);
      setSeason(null);
      setMessage("시즌 삭제 완료");
    } catch (err) {
      console.error(err);
      setError("시즌 삭제 실패");
    } finally {
      setDeleteSeasonBusy(false);
    }
  };

  const handleTeamUpdate = async (teamId: number, overrides?: Partial<{ name: string; icon: string; is_active: boolean }>) => {
    const base = teamEdits[teamId];
    const edit = base ? { ...base, ...overrides } : undefined;
    if (!edit) return;
    setError(null);
    setMessage(null);
    setTeamBusy(teamId);
    try {
      await updateTeam(teamId, { name: edit.name, icon: edit.icon || null, is_active: edit.is_active });
      await refresh();
      setMessage("팀 수정 완료");
      setEditingTeamId(null);
    } catch (err) {
      console.error(err);
      setError("팀 수정 실패");
    } finally {
      setTeamBusy(null);
    }
  };

  const handleTeamDelete = async (teamId: number) => {
    setError(null);
    setMessage(null);
    setTeamDeleteBusy(teamId);
    try {
      await deleteTeam(teamId);
      await refresh();
      setMessage("팀 삭제 완료");
    } catch (err) {
      console.error(err);
      setError("팀 삭제 실패");
    } finally {
      setTeamDeleteBusy(null);
    }
  };

  const handleForceJoin = async () => {
    if (!forceJoinForm.user_id || !forceJoinForm.team_id) return;
    setError(null);
    setMessage(null);
    setForceJoinBusy(true);
    try {
      await forceJoinTeam({ user_id: Number(forceJoinForm.user_id), team_id: Number(forceJoinForm.team_id) });
      setMessage("강제 배정 완료");
      // 성공 시 폼 초기화
      setForceJoinForm({ user_id: "", team_id: "" });
      setUserSearchQuery("");
    } catch (err) {
      console.error(err);
      const detail = (err as any)?.response?.data?.detail;
      if (detail === "ALREADY_IN_TEAM") {
        setError("이미 팀에 속한 사용자입니다. 이동하려면 먼저 기존 팀에서 제거하세요.");
      } else if (detail === "TEAM_NOT_FOUND") {
        setError("팀을 찾을 수 없습니다.");
      } else {
        setError("강제 배정 실패");
      }
    } finally {
      setForceJoinBusy(false);
    }
  };

  const openTeamCreate = () => {
    setEditingTeamId(null);
    setTeamForm({ name: "", icon: "", leader_user_id: "" });
    setShowTeamModal(true);
  };

  const openTeamEdit = (team: Team) => {
    setEditingTeamId(team.id);
    setTeamEdits((prev) => ({
      ...prev,
      [team.id]: {
        name: prev[team.id]?.name ?? team.name,
        icon: prev[team.id]?.icon ?? team.icon ?? "",
        is_active: prev[team.id]?.is_active ?? team.is_active,
      },
    }));
    setShowTeamModal(true);
  };

  const teamModalTitle = editingTeamId ? "팀 수정" : "팀 생성";
  const canSubmitTeamModal = useMemo(() => {
    if (editingTeamId) {
      const edit = teamEdits[editingTeamId];
      return Boolean(edit?.name?.trim());
    }
    return Boolean(teamForm.name.trim());
  }, [editingTeamId, teamEdits, teamForm.name]);

  const submitTeamModal = async () => {
    if (editingTeamId) {
      await handleTeamUpdate(editingTeamId);
      setShowTeamModal(false);
      return;
    }
    await handleCreateTeam();
  };

  const tabs = useMemo(
    () =>
      [
        { key: "season" as const, label: "시즌 관리" },
        { key: "team" as const, label: "팀 관리" },
        { key: "leaderboard" as const, label: "리더보드" },
        { key: "force" as const, label: "강제 팀 배정" },
      ],
    []
  );

  const ModalShell = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)] sm:items-center">
      <div className="w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-[#333333] bg-[#111111] shadow-lg">
        <div className="flex items-center justify-between border-b border-[#333333] px-6 py-4">
          <h3 className="text-lg font-medium text-[#91F402]">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-gray-300 hover:bg-[#1A1A1A]" aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold text-[#91F402]">팀 배틀 관리</h2>
        <p className="mt-1 text-sm text-gray-400">팀 배틀 시즌과 팀, 점수, 멤버를 관리합니다. 팀은 2개 구성을 권장합니다.</p>
      </header>

      <div className="border-b border-[#333333]">
        <nav className="flex gap-2" aria-label="팀배틀 탭">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium ${tab === t.key ? "bg-[#2D6B3B] text-[#91F402]" : "text-gray-300 hover:bg-[#1A1A1A]"
                }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "season" && (
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-[#91F402]">시즌 관리</h3>
              <p className="mt-1 text-sm text-gray-400">모든 시각은 Asia/Seoul 기준입니다.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowSeasonModal(true)}
              className="flex items-center rounded-md bg-[#2D6B3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#91F402] hover:text-black"
            >
              <Plus size={18} className="mr-2" />
              시즌 생성
            </button>
          </div>

          <div className="mt-6 rounded-lg border border-[#333333] bg-[#0A0A0A] p-6">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium text-[#91F402]">활성 시즌</h4>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="rounded-md p-2 text-gray-300 hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="새로고침"
                title="새로고침"
              >
                <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-8 flex min-h-24 items-center justify-center text-sm text-gray-400">
              {season ? (
                <div className="w-full space-y-3">
                  <div className="text-white">
                    <span className="font-semibold">{season.name}</span>
                    <span className="ml-2 text-gray-400">
                      {formatDateTime(season.starts_at)} ~ {formatDateTime(season.ends_at)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleActivate}
                      disabled={!season || activateBusy}
                      className="rounded-md bg-[#2D6B3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#91F402] hover:text-black disabled:opacity-60"
                    >
                      {activateBusy ? "활성화 중..." : "활성화"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSettle}
                      disabled={!season || settleBusy}
                      className="rounded-md border border-[#333333] bg-[#1A1A1A] px-4 py-2 text-sm text-gray-200 hover:bg-[#2C2C2E] disabled:opacity-60"
                    >
                      {settleBusy ? "정산 중..." : "정산"}
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdateSeason}
                      disabled={!season || updateSeasonBusy}
                      className="rounded-md border border-[#333333] bg-[#1A1A1A] px-4 py-2 text-sm text-gray-200 hover:bg-[#2C2C2E] disabled:opacity-60"
                    >
                      {updateSeasonBusy ? "수정 중..." : "수정"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSeason}
                      disabled={!season || deleteSeasonBusy}
                      className="rounded-md border border-red-500/40 bg-red-950 px-4 py-2 text-sm text-red-100 hover:bg-red-900/60 disabled:opacity-60"
                    >
                      {deleteSeasonBusy ? "삭제 중..." : "삭제"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-300">시즌 이름</label>
                      <input className={inputClass} value={seasonEditForm.name} onChange={(e) => setSeasonEditForm({ ...seasonEditForm, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-300">활성화</label>
                      <label className="flex items-center gap-2 text-sm text-gray-200">
                        <input
                          type="checkbox"
                          checked={seasonEditForm.is_active}
                          onChange={(e) => setSeasonEditForm({ ...seasonEditForm, is_active: e.target.checked })}
                          className="h-4 w-4 rounded border-[#333333] bg-[#1A1A1A]"
                        />
                        활성
                      </label>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-300">시작 시각 (ISO)</label>
                      <input className={inputClass} value={seasonEditForm.starts_at} onChange={(e) => setSeasonEditForm({ ...seasonEditForm, starts_at: e.target.value })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-300">종료 시각 (ISO)</label>
                      <input className={inputClass} value={seasonEditForm.ends_at} onChange={(e) => setSeasonEditForm({ ...seasonEditForm, ends_at: e.target.value })} />
                    </div>
                  </div>
                </div>
              ) : (
                <div>없음</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "team" && (
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-[#91F402]">팀 관리 (2팀 구성 권장)</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-gray-200 hover:bg-[#2C2C2E] disabled:opacity-60"
                aria-label="새로고침"
                title="새로고침"
              >
                <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button
                type="button"
                onClick={openTeamCreate}
                className="flex items-center rounded-md bg-[#2D6B3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#91F402] hover:text-black"
              >
                <Plus size={18} className="mr-2" />
                팀 생성
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {teams.map((t) => (
              <div key={t.id} className="rounded-lg border border-[#333333] bg-[#0A0A0A] p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${t.is_active ? "bg-[#2D6B3B] text-[#91F402]" : "bg-red-900/60 text-red-200"}`}>
                      {t.is_active ? "활성" : "비활성"}
                    </span>
                    <div className="mt-3 text-sm text-gray-400">ID: {t.id}</div>
                    <div className="mt-2 text-2xl font-bold text-white">{t.name}</div>
                    <div className="mt-2 text-sm text-gray-400">{t.icon ? t.icon : "아이콘 URL 없음"}</div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const current = teamEdits[t.id]?.is_active ?? t.is_active;
                      const next = !current;
                      setTeamEdits({
                        ...teamEdits,
                        [t.id]: {
                          name: teamEdits[t.id]?.name ?? t.name,
                          icon: teamEdits[t.id]?.icon ?? t.icon ?? "",
                          is_active: next,
                        },
                      });
                      handleTeamUpdate(t.id, { is_active: next });
                    }}
                    disabled={teamBusy === t.id}
                    className={`rounded-md px-4 py-2 text-sm font-medium ${(teamEdits[t.id]?.is_active ?? t.is_active)
                        ? "bg-red-900/60 text-red-100 hover:bg-red-900"
                        : "bg-[#2D6B3B] text-white hover:bg-[#91F402] hover:text-black"
                      } disabled:opacity-60`}
                  >
                    {teamBusy === t.id ? "처리 중..." : (teamEdits[t.id]?.is_active ?? t.is_active) ? "비활성" : "활성"}
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openTeamEdit(t)}
                      className="text-[#91F402] hover:text-white"
                      title="수정"
                      aria-label="수정"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTeamDelete(t.id)}
                      disabled={teamDeleteBusy === t.id}
                      className="text-red-500 hover:text-red-300 disabled:opacity-60"
                      title="삭제"
                      aria-label="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {teams.length === 0 && <div className="text-sm text-gray-400">팀이 없습니다.</div>}
          </div>
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-[#91F402]">리더보드</h3>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-gray-200 hover:bg-[#2C2C2E] disabled:opacity-60"
                aria-label="새로고침"
                title="새로고침"
              >
                <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {leaderboard.length === 0 && <div className="text-sm text-gray-400">점수가 없습니다.</div>}
              {leaderboard.map((row, idx) => (
                <div
                  key={row.team_id}
                  className={`flex items-center justify-between rounded-lg border border-[#333333] px-5 py-4 ${idx === 0 ? "bg-[#2D6B3B] text-white" : "bg-[#0A0A0A] text-white"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-bold">{idx + 1}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Trophy size={16} className={idx === 0 ? "text-[#91F402]" : "text-gray-400"} />
                        <span className="font-semibold">{row.team_name}</span>
                      </div>
                      <div className={`mt-1 flex items-center gap-2 text-sm ${idx === 0 ? "text-white/80" : "text-gray-400"}`}>
                        <Users size={16} />
                        {row.member_count ?? 0}명 참여
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold">{row.points.toLocaleString()}</div>
                    <div className={`mt-1 text-xs ${idx === 0 ? "text-white/80" : "text-gray-400"}`}>
                      {row.latest_event_at ? formatDateTime(row.latest_event_at) : "-"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-lg font-medium text-[#91F402]">팀별 기여도</h3>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-300">팀 선택</label>
              <select
                value={selectedTeamForContrib ?? ""}
                onChange={(e) => {
                  setContribOffset(0);
                  setSelectedTeamForContrib(e.target.value === "" ? null : Number(e.target.value));
                }}
                className="w-full rounded-md border border-[#2D6B3B] bg-[#1A1A1A] p-3 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
              >
                <option value="">팀 선택</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select
                  value={contribLimit}
                  onChange={(e) => {
                    setContribOffset(0);
                    setContribLimit(Number(e.target.value));
                  }}
                  className="rounded-md border border-[#333333] bg-[#1A1A1A] px-3 py-2 text-sm text-white"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}개씩
                    </option>
                  ))}
                </select>
                <div className="text-sm text-gray-400">총 {contributors.length}명</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (season) loadContributors(selectedTeamForContrib, season.id);
                }}
                disabled={contributorsBusy}
                className="rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-gray-200 hover:bg-[#2C2C2E] disabled:opacity-60"
                aria-label="새로고침"
                title="새로고침"
              >
                <RefreshCw size={18} className={contributorsBusy ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-[#333333] bg-[#0A0A0A]">
              <table className="w-full">
                <thead className="sticky top-0 z-10 border-b border-[#333333] bg-[#1A1A1A]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">순위</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">닉네임 / USER_ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">점수</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">최근 적립</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#333333]">
                  {contributors.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                        기여도 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                  {contributors.map((c, idx) => (
                    <tr key={`${c.user_id}-${idx}`} className={idx % 2 === 0 ? "bg-[#111111]" : "bg-[#1A1A1A]"}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">{contribOffset + idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-white">{c.nickname || "닉네임 없음"}</div>
                        <div className="text-xs text-gray-500">user_{c.user_id}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{c.points.toLocaleString()}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">{c.latest_event_at ? formatDateTime(c.latest_event_at) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-400">
                표시: {contributors.length ? `${contribOffset + 1} - ${contribOffset + contributors.length}` : "0"}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleContribPrev}
                  className="rounded-md border border-[#333333] bg-[#1A1A1A] px-3 py-2 text-sm text-gray-200 hover:bg-[#2C2C2E]"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleContribNext}
                  className="rounded-md border border-[#333333] bg-[#1A1A1A] px-3 py-2 text-sm text-gray-200 hover:bg-[#2C2C2E]"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "force" && (
        <div className={cardClass}>
          <h3 className="text-lg font-medium text-[#91F402]">강제 팀 배정</h3>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="relative">
              <label className="mb-1 block text-sm font-medium text-gray-300">사용자 검색</label>
              <input
                className={inputClass}
                placeholder="닉네임으로 검색..."
                value={userSearchQuery}
                onChange={(e) => {
                  setUserSearchQuery(e.target.value);
                  setShowUserDropdown(true);
                }}
                onFocus={() => setShowUserDropdown(true)}
              />
              {showUserDropdown && userSearchQuery && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#333333] bg-[#111111] shadow-lg">
                  {allUsers
                    .filter((u) =>
                      (u.nickname?.toLowerCase() || "").includes(userSearchQuery.toLowerCase()) ||
                      u.external_id.toLowerCase().includes(userSearchQuery.toLowerCase())
                    )
                    .slice(0, 20)
                    .map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        className="flex w-full items-center justify-between border-b border-[#333333] px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#1A1A1A]"
                        onClick={() => {
                          setForceJoinForm({ ...forceJoinForm, user_id: String(u.id) });
                          setUserSearchQuery(`${u.nickname || u.external_id} (ID: ${u.id})`);
                          setShowUserDropdown(false);
                        }}
                      >
                        <span className="font-medium text-white">{u.nickname || "(닉네임 없음)"}</span>
                        <span className="text-xs text-gray-500">ID: {u.id} / {u.external_id}</span>
                      </button>
                    ))}
                  {allUsers.filter((u) =>
                    (u.nickname?.toLowerCase() || "").includes(userSearchQuery.toLowerCase()) ||
                    u.external_id.toLowerCase().includes(userSearchQuery.toLowerCase())
                  ).length === 0 && <div className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</div>}
                </div>
              )}
              {forceJoinForm.user_id && <div className="mt-1 text-xs text-gray-400">선택된 user_id: {forceJoinForm.user_id}</div>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">팀 선택</label>
              <select
                className={inputClass}
                value={forceJoinForm.team_id}
                onChange={(e) => setForceJoinForm({ ...forceJoinForm, team_id: e.target.value })}
              >
                <option value="">팀 선택...</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (ID: {t.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleForceJoin}
              disabled={forceJoinBusy || !forceJoinForm.user_id || !forceJoinForm.team_id}
              className="rounded-md bg-[#2D6B3B] px-5 py-2 text-sm font-medium text-white hover:bg-[#91F402] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {forceJoinBusy ? "배정 중..." : "강제 배정"}
            </button>
          </div>
        </div>
      )}

      {showSeasonModal && (
        <ModalShell
          title="시즌 생성"
          onClose={() => {
            setShowSeasonModal(false);
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-300">시즌 이름</label>
              <input className={inputClass} value={seasonForm.name} onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })} placeholder="시즌 이름 입력" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">시작 시각 (ISO)</label>
              <input className={inputClass} value={seasonForm.starts_at} onChange={(e) => setSeasonForm({ ...seasonForm, starts_at: e.target.value })} placeholder="2025-12-12T00:00:00+09:00" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">종료 시각 (ISO)</label>
              <input className={inputClass} value={seasonForm.ends_at} onChange={(e) => setSeasonForm({ ...seasonForm, ends_at: e.target.value })} placeholder="2025-12-13T00:00:00+09:00" />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" checked={seasonForm.is_active} onChange={(e) => setSeasonForm({ ...seasonForm, is_active: e.target.checked })} className="h-4 w-4 rounded border-[#333333] bg-[#1A1A1A]" />
                활성화
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleCreateSeason}
              disabled={createSeasonBusy || !seasonForm.name || !seasonForm.starts_at || !seasonForm.ends_at}
              className="rounded-md bg-[#2D6B3B] px-5 py-2 text-sm font-medium text-white hover:bg-[#91F402] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createSeasonBusy ? "생성 중..." : "시즌 생성"}
            </button>
          </div>
        </ModalShell>
      )}

      {showTeamModal && (
        <ModalShell
          title={teamModalTitle}
          onClose={() => {
            setShowTeamModal(false);
            setEditingTeamId(null);
          }}
        >
          {editingTeamId ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">팀 이름</label>
                <input
                  className={inputClass}
                  value={teamEdits[editingTeamId]?.name ?? ""}
                  onChange={(e) =>
                    setTeamEdits({
                      ...teamEdits,
                      [editingTeamId]: {
                        name: e.target.value,
                        icon: teamEdits[editingTeamId]?.icon ?? "",
                        is_active: teamEdits[editingTeamId]?.is_active ?? true,
                      },
                    })
                  }
                  placeholder="팀 이름 입력"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">아이콘 URL (선택)</label>
                <input
                  className={inputClass}
                  value={teamEdits[editingTeamId]?.icon ?? ""}
                  onChange={(e) =>
                    setTeamEdits({
                      ...teamEdits,
                      [editingTeamId]: {
                        name: teamEdits[editingTeamId]?.name ?? "",
                        icon: e.target.value,
                        is_active: teamEdits[editingTeamId]?.is_active ?? true,
                      },
                    })
                  }
                  placeholder="https://example.com/icon.png"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={teamEdits[editingTeamId]?.is_active ?? true}
                    onChange={(e) =>
                      setTeamEdits({
                        ...teamEdits,
                        [editingTeamId]: {
                          name: teamEdits[editingTeamId]?.name ?? "",
                          icon: teamEdits[editingTeamId]?.icon ?? "",
                          is_active: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-[#333333] bg-[#1A1A1A]"
                  />
                  활성
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">팀 이름</label>
                <input className={inputClass} value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="팀 이름 입력" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">아이콘 URL (선택)</label>
                <input className={inputClass} value={teamForm.icon} onChange={(e) => setTeamForm({ ...teamForm, icon: e.target.value })} placeholder="https://example.com/icon.png" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">리더 user_id (선택)</label>
                <input className={inputClass} value={teamForm.leader_user_id} onChange={(e) => setTeamForm({ ...teamForm, leader_user_id: e.target.value })} placeholder="user_123" />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={submitTeamModal}
              disabled={createTeamBusy || teamBusy === editingTeamId || !canSubmitTeamModal}
              className="rounded-md bg-[#2D6B3B] px-5 py-2 text-sm font-medium text-white hover:bg-[#91F402] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editingTeamId ? (teamBusy === editingTeamId ? "저장 중..." : "저장") : createTeamBusy ? "생성 중..." : "팀 생성"}
            </button>
          </div>
        </ModalShell>
      )}

      {message && <div className="rounded-lg border border-[#333333] bg-[#111111] p-4 text-sm text-gray-200">{message}</div>}
      {error && <div className="rounded-lg border border-red-500/40 bg-red-950 p-4 text-sm text-red-100">{error}</div>}
    </section>
  );
};

export default AdminTeamBattlePage;

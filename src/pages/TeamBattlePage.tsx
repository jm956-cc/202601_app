import React, { useEffect, useMemo, useState } from "react";
import {
  getActiveSeason,
  getLeaderboard,
  getContributors,
  autoAssignTeam,
  listTeams,
  getMyTeam,
} from "../api/teamBattleApi";
import { TeamSeason, Team, LeaderboardEntry, ContributorEntry, TeamMembership } from "../types/teamBattle";
import GamePageShell from "../components/game/GamePageShell";
import AnimatedNumber from "../components/common/AnimatedNumber";
import FeatureGate from "../components/feature/FeatureGate";

const normalizeIsoForDate = (value: string) => {
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return hasTimezone ? value : value + "Z";
};

const TeamBattlePage: React.FC = () => {
  const [season, setSeason] = useState<TeamSeason | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [contributors, setContributors] = useState<ContributorEntry[]>([]);
  const [myTeamData, setMyTeamData] = useState<TeamMembership | null>(null);
  const [contributorsLoading, setContributorsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pagination / Limits
  const [lbLimit] = useState(10);
  const [lbOffset, setLbOffset] = useState(0);
  const [contribLimit] = useState(10);
  const [contribOffset, setContribOffset] = useState(0);

  void myTeamData;

  // Time calculations
  const joinWindow = useMemo(() => {
    if (!season?.starts_at) return { closed: true, label: "-" };
    const start = new Date(normalizeIsoForDate(season.starts_at)).getTime();
    const now = Date.now();
    if (now < start) return { closed: true, label: "시작 전" };
    const close = start + 24 * 60 * 60 * 1000;
    const remaining = close - now;
    if (remaining <= 0) return { closed: true, label: "마감" };
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    return { closed: false, label: `${hours}시간 남음` };
  }, [season?.starts_at]);

  const countdown = useMemo(() => {
    if (!season?.ends_at) return "-";
    const now = Date.now();
    const end = new Date(normalizeIsoForDate(season.ends_at)).getTime();
    const diff = end - now;
    if (diff <= 0) return "종료됨";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}일 ${hours}시간`;
    return `${hours}시간 ${minutes}분`;
  }, [season?.ends_at]);

  // Data Loading
  const loadContributors = async (teamId: number, seasonId?: number) => {
    setContributorsLoading(true);
    try {
      const data = await getContributors(teamId, seasonId, contribLimit, contribOffset);
      setContributors(data);
    } catch (err) {
      console.error(err);
      setError("기여도를 불러오지 못했습니다");
    } finally {
      setContributorsLoading(false);
    }
  };

  const loadLeaderboard = async (seasonId?: number) => {
    try {
      const lb = await getLeaderboard(seasonId, lbLimit, lbOffset);
      setLeaderboard(lb);
    } catch (err) {
      console.error(err);
      setError("리더보드를 불러오지 못했습니다");
    }
  };

  const loadCore = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [seasonData, teamList, myTeamRes] = await Promise.all([
        getActiveSeason(),
        listTeams(),
        getMyTeam(),
      ]);
      setSeason(seasonData);
      setTeams(teamList);
      setMyTeamData(myTeamRes);
      setSelectedTeam(myTeamRes ? myTeamRes.team_id : null);

      await loadLeaderboard(seasonData?.id);

      const targetTeamId = myTeamRes?.team_id ?? selectedTeam;
      if (targetTeamId && seasonData) {
        loadContributors(targetTeamId, seasonData.id);
      }
    } catch (err) {
      console.error(err);
      setError("팀 배틀 정보를 불러오지 못했습니다");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCore();
    const timer = setInterval(loadCore, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (season && selectedTeam) {
      loadContributors(selectedTeam, season.id);
    }
  }, [selectedTeam, contribOffset, season?.id]);

  useEffect(() => {
    if (season) loadLeaderboard(season.id);
  }, [lbOffset, season?.id]);

  const handleAutoAssign = async () => {
    setJoinBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await autoAssignTeam();
      setSelectedTeam(res.team_id);
      setContribOffset(0);
      setMyTeamData({ team_id: res.team_id, role: res.role, joined_at: new Date().toISOString() });
      setMessage(`팀 #${res.team_id}에 배정되었습니다`);
      if (season) loadContributors(res.team_id, season.id);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === "TEAM_SELECTION_CLOSED") setError("배정 기간이 종료되었습니다.");
      else if (detail === "ALREADY_IN_TEAM") setError("이미 팀에 소속되어 있습니다.");
      else setError("팀 배정에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setJoinBusy(false);
    }
  };

  // derived state
  const myTeamName = useMemo(() => teams.find((t) => t.id === selectedTeam)?.name, [teams, selectedTeam]);

  // VS Gauge Data (Assume 2 teams for best visual, fallback for more)
  const vsData = useMemo(() => {
    if (leaderboard.length < 2) return null;
    const t1 = leaderboard[0];
    const t2 = leaderboard[1];
    const total = t1.points + t2.points;
    if (total === 0) return { t1: 50, t2: 50, t1Points: 0, t2Points: 0 };
    return {
      t1: Math.round((t1.points / total) * 100),
      t2: Math.round((t2.points / total) * 100),
      t1Points: t1.points,
      t2Points: t2.points,
      t1Name: t1.team_name,
      t2Name: t2.team_name,
    };
  }, [leaderboard]);

  const content = (
    <div className="space-y-8">
      {/* 2-Team VS Gauge (Hero) - Only show if exactly 2 teams roughly or if top 2 dominate */}
      {vsData && (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-1 shadow-2xl backdrop-blur-xl">
          <div className="relative flex h-24 w-full overflow-hidden rounded-[1.3rem]">
            {/* Team A Bar */}
            <div
              className="relative flex items-center justify-start bg-gradient-to-r from-blue-900 to-blue-600 pl-6 transition-all duration-1000 ease-out"
              style={{ width: `${vsData.t1}%` }}
            >
              <div className="z-10 text-left">
                <p className="text-sm font-bold text-white/80">{vsData.t1Name}</p>
                <p className="text-2xl font-black text-white drop-shadow-md"><AnimatedNumber value={vsData.t1Points} /></p>
              </div>
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)] bg-[length:20px_20px]" />
            </div>

            {/* VS Divider */}
            <div className="absolute left-1/2 top-0 z-20 flex h-full w-12 -translate-x-1/2 items-center justify-center bg-black skew-x-[-12deg]">
              <span className="text-xl font-black italic text-white/50 skew-x-[12deg]">VS</span>
            </div>

            {/* Team B Bar */}
            <div
              className="relative flex items-center justify-end bg-gradient-to-l from-red-900 to-red-600 pr-6 transition-all duration-1000 ease-out"
              style={{ width: `${vsData.t2}%` }}
            >
              <div className="z-10 text-right">
                <p className="text-sm font-bold text-white/80">{vsData.t2Name}</p>
                <p className="text-2xl font-black text-white drop-shadow-md"><AnimatedNumber value={vsData.t2Points} /></p>
              </div>
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)] bg-[length:20px_20px]" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-white/40">
            <span>남은 시간: <span className="font-mono font-bold text-white">{countdown}</span></span>
            <span>•</span>
            <button onClick={loadCore} disabled={refreshing} className="hover:text-white">
              <span className={refreshing ? "animate-spin inline-block" : ""}>↻</span> 갱신
            </button>
          </div>
        </div>
      )}

      {/* Rule Ticker */}
      <div className="flex items-center gap-3 overflow-hidden rounded-full border border-white/5 bg-white/[0.02] px-4 py-2 text-base text-white/50 backdrop-blur-sm">
        <span className="font-bold text-cc-lime">안내</span>
        <div className="flex flex-wrap gap-2 overflow-hidden whitespace-normal sm:flex-nowrap sm:gap-4 sm:whitespace-nowrap">
          <span>• 자동 배정 (밸런스 기준)</span>
          <span>• 시작 후 24시간 내 배정 가능</span>
          <span>• 게임 1회당 10점 (일일 최대 500점)</span>
          <span>• 상위 팀 전원 보상 지급</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {/* Team Select / Status Card */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-md">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">내 팀 현황</h2>
              {myTeamName && (
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm font-bold text-white">
                  {myTeamName}
                </span>
              )}
            </div>

            {!selectedTeam ? (
              <div className="mt-6 flex flex-col items-center gap-6 py-8">
                <div className="h-20 w-20 rounded-full bg-white/5 p-4 text-4xl shadow-inner ring-1 ring-white/10">❓</div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">소속 팀이 없습니다</p>
                  <p className="mt-2 text-sm text-white/50">팀에 합류하여 승리를 이끄세요! 우승 팀 전원에게 보상이 지급됩니다.</p>
                </div>
                <button
                  onClick={handleAutoAssign}
                  disabled={joinBusy || joinWindow.closed}
                  className="w-full rounded-xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  {joinWindow.closed ? "배정 마감" : joinBusy ? "배정 중..." : "팀 배정받기"}
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {/* My Team Badge */}
                <div className="flex items-center gap-4 rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl shadow-lg">
                    🛡️
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-white/40">Affiliation</p>
                    <p className="text-xl font-black text-white">{myTeamName}</p>
                  </div>
                </div>

                {/* My Contribution List */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white/60">팀 기여도 랭킹</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setContribOffset(Math.max(0, contribOffset - contribLimit))} disabled={contribOffset === 0} className="rounded bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-30">Scan</button>
                      <button onClick={() => setContribOffset(contribOffset + contribLimit)} disabled={contributors.length < contribLimit} className="rounded bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-30">Next</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {contributorsLoading && contributors.length === 0 ? (
                      <div className="py-4 text-center text-sm text-white/30">Loading...</div>
                    ) : contributors.map((c, i) => (
                      <div key={`${c.user_id}-${i}`} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-4 py-2 ring-1 ring-white/5">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-bold ${i < 3 && contribOffset === 0 ? "text-yellow-400" : "text-white/30"}`}>{contribOffset + i + 1}</span>
                          <span className="text-sm font-medium text-white/90">{c.nickname || `User ${c.user_id}`}</span>
                        </div>
                        <span className="font-mono text-sm font-bold text-cc-lime">+{c.points.toLocaleString()}</span>
                      </div>
                    ))}
                    {contributors.length === 0 && !contributorsLoading && (
                      <div className="py-4 text-center text-sm text-white/30">기여 내역이 없습니다.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Global Leaderboard */}
        <div className="flex flex-col gap-6">
          <div className="relative h-full overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-xl backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">전체 팀 순위</h2>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setLbOffset(Math.max(0, lbOffset - lbLimit))} disabled={lbOffset === 0} className="rounded bg-white/5 px-2 py-1 text-white disabled:opacity-30">◀</button>
                <button onClick={() => setLbOffset(lbOffset + lbLimit)} disabled={leaderboard.length < lbLimit} className="rounded bg-white/5 px-2 py-1 text-white disabled:opacity-30">▶</button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {leaderboard.map((team, idx) => (
                <div
                  key={team.team_id}
                  className={`relative flex items-center justify-between overflow-hidden rounded-2xl p-4 transition-all ${idx === 0 ? "bg-gradient-to-r from-yellow-500/20 to-transparent ring-1 ring-yellow-500/50" :
                    idx === 1 ? "bg-gradient-to-r from-gray-400/20 to-transparent ring-1 ring-gray-400/30" :
                      idx === 2 ? "bg-gradient-to-r from-orange-700/20 to-transparent ring-1 ring-orange-700/30" : "bg-white/5 ring-1 ring-white/10"
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-black ${idx === 0 ? "bg-yellow-400 text-black shadow-lg shadow-yellow-500/50" :
                      idx === 1 ? "bg-gray-300 text-black" :
                        idx === 2 ? "bg-orange-600 text-white" : "bg-white/10 text-white/50"
                      }`}>
                      {lbOffset + idx + 1}
                    </div>
                    <div>
                      <p className="text-base font-bold text-white">{team.team_name}</p>
                      <p className="text-xs text-white/50">{team.member_count} Members</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xl font-black text-white">{team.points.toLocaleString()}</p>
                    <p className="text-xs text-white/40">POINTS</p>
                  </div>
                </div>
              ))}
              {leaderboard.length === 0 && (
                <div className="py-12 text-center text-sm text-white/30">
                  기록된 점수가 없습니다.<br />게임을 플레이하여 첫 점수를 획득하세요!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-in rounded-2xl border border-cc-lime/20 bg-black/90 px-6 py-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cc-lime/20 text-cc-lime">✓</div>
            <p className="text-sm font-bold text-white">{message}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-in rounded-2xl border border-red-500/20 bg-black/90 px-6 py-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20 text-red-500">!</div>
            <p className="text-sm font-bold text-white">{error}</p>
          </div>
        </div>
      )}

      {/* Decorative Background Elements */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-blue-500/10 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-red-500/10 blur-[100px]" />
      </div>
    </div>
  );

  return (
    <FeatureGate feature="TEAM_BATTLE">
      <GamePageShell title="TEAM BATTLE" subtitle="Season 1">
        {content}
      </GamePageShell>
    </FeatureGate>
  );
};

export default TeamBattlePage;

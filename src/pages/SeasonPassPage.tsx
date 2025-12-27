import React, { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTodayRanking } from "../hooks/useRanking";
import { useSeasonPassStatus, useInternalWinStatus, useClaimSeasonReward } from "../hooks/useSeasonPass";
import FeatureGate from "../components/feature/FeatureGate";
import { useToast } from "../components/common/ToastProvider";
import { AnimatePresence, motion } from "framer-motion";

const formatCurrency = (value: number) => value.toLocaleString();

const SeasonPassPage: React.FC = () => {
  const navigate = useNavigate();
  const season = useSeasonPassStatus();
  const ranking = useTodayRanking();
  const internalWins = useInternalWinStatus();
  const claimMutation = useClaimSeasonReward();
  const { addToast } = useToast();
  const lastSeasonLevelRef = useRef<number | null>(null);
  const lastClaimCountRef = useRef<number>(0);

  useEffect(() => {
    if (!season.data) return;
    const currentLevel = season.data.current_level;
    const claimedLevels = season.data.levels.filter((l) => l.is_claimed);

    if (lastSeasonLevelRef.current !== null && currentLevel > lastSeasonLevelRef.current) {
      addToast(`시즌 레벨 ${currentLevel} 달성!`, "success");
    }

    if (claimedLevels.length > lastClaimCountRef.current) {
      const latest = claimedLevels.sort((a, b) => a.level - b.level)[claimedLevels.length - 1];
      if (latest) addToast(`레벨 ${latest.level} 보상 지급`, "info");
    }

    lastSeasonLevelRef.current = currentLevel;
    lastClaimCountRef.current = claimedLevels.length;
  }, [season.data, addToast]);

  const external = ranking.data?.my_external_entry;
  const top10Needed = external?.rank && external.rank > 10 ? external.rank - 10 : 0;
  const deposit = external?.deposit_amount ?? 0;
  const depositRemainder = 100_000 - (deposit % 100_000 || 100_000);
  const playDone = (external?.play_count ?? 0) > 0;

  const seasonLevelSummary = useMemo(() => {
    if (season.isLoading) return { detail: "레벨 불러오는 중", progressPct: 0 };
    if (season.isError || !season.data) return { detail: "레벨 정보를 불러오지 못했습니다", progressPct: 0 };
    const { current_xp, current_level, max_level, levels } = season.data;
    const totalXp = Math.max(0, current_xp ?? 0);
    const maxRequired = Math.max(0, ...levels.map((l) => l.required_xp ?? 0));
    const isMax = current_level >= max_level || totalXp >= maxRequired;

    if (isMax) {
      return {
        title: "최대 레벨 달성",
        detail: "축하합니다! 모든 보상을 달성했어요.",
        progressPct: 100,
      };
    }

    const sortedByReq = [...levels].sort((a, b) => (a.required_xp ?? 0) - (b.required_xp ?? 0));
    const nextRow = sortedByReq.find((l) => (l.required_xp ?? 0) > totalXp);
    const prevRow = [...sortedByReq].reverse().find((l) => (l.required_xp ?? 0) <= totalXp);

    const startXp = Math.max(0, prevRow?.required_xp ?? 0);
    const endXp = Math.max(startXp + 1, nextRow?.required_xp ?? maxRequired);
    const targetLevel = nextRow?.level ?? Math.min(max_level, current_level + 1);

    const segmentXp = Math.max(0, totalXp - startXp);
    const segmentTotal = Math.max(1, endXp - startXp);
    const remaining = Math.max(0, endXp - totalXp);

    let progressPct = Math.floor((segmentXp / segmentTotal) * 100);
    if (remaining > 0) progressPct = Math.min(99, Math.max(0, progressPct));

    return {
      title: `레벨 ${targetLevel}까지`,
      detail: `남은 ${remaining.toLocaleString()} XP (현재 ${segmentXp.toLocaleString()} / ${segmentTotal.toLocaleString()})`,
      progressPct,
    };
  }, [season.data, season.isError, season.isLoading]);

  const cards = [
    {
      icon: "👑",
      title: "CC랭킹 TOP10",
      desc: "순위가 10위 안에 들면 스탬프 1개",
      status: external?.rank ? `현재 ${external.rank}위${top10Needed > 0 ? `, ${top10Needed}위 상승 필요` : " (완료)"}` : "랭킹 데이터 없음",
    },
    {
      icon: "📅",
      title: "CC사이트 일일이용",
      desc: "10만원 단위 플레이 시 20XP 지급",
      status: playDone ? "완료" : "미완료",
    },
    {
      icon: "💎",
      title: "CC 입금 10만원마다",
      desc: "10만원 달성할 때마다 스탬프 1개",
      status: `누적 ${formatCurrency(deposit)}원 / 다음까지 ${depositRemainder === 100_000 ? "0" : formatCurrency(depositRemainder)}원`,
    },
    {
      icon: "🎮",
      title: "코드게임 승리 50회",
      desc: "승리 누적 50회 달성 시 스탬프 1개",
      status: internalWins.data
        ? `누적 승리 ${internalWins.data.total_wins}회 / 남은 ${internalWins.data.remaining}회`
        : internalWins.isLoading
          ? "집계 중..."
          : "집계 실패",
    },
  ];

  if (season.isLoading) {
    return (
      <FeatureGate feature="SEASON_PASS">
        <section className="flex flex-col items-center justify-center rounded-3xl border border-emerald-800/30 bg-slate-950/80 p-10">
          <div className="h-12 w-12 animate-spin rounded-full border-3 border-emerald-500/70 border-t-transparent" />
          <p className="mt-4 text-base font-semibold text-emerald-100">레벨 불러오는 중...</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-4 rounded-full border border-emerald-600/60 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/40"
          >
            홈으로
          </button>
        </section>
      </FeatureGate>
    );
  }

  if (season.isError || !season.data) {
    return (
      <FeatureGate feature="SEASON_PASS">
        <section className="rounded-3xl border border-red-800/40 bg-slate-950/85 p-8 text-center">
          <div className="mb-3 text-4xl">⚠️</div>
          <p className="text-lg font-bold text-red-100">레벨를 불러오지 못했습니다.</p>
          <p className="mt-2 text-sm text-slate-300">잠시 후 다시 시도하거나 지민이에게 문의해주세요.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => season.refetch()}
              className="rounded-full border border-slate-600 px-4 py-2 text-base font-semibold text-slate-200 hover:bg-slate-800"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-4 rounded-full border border-emerald-600/60 px-4 py-2 text-base font-semibold text-emerald-100 hover:bg-emerald-900/40"
            >
              홈으로
            </button>
          </div>
        </section>
      </FeatureGate>
    );
  }

  const data = season.data;
  const stampXp = (data as any)?.base_xp_per_stamp ?? 0;
  void stampXp;

  return (
    <FeatureGate feature="SEASON_PASS">
      <div className="relative mx-auto max-w-5xl space-y-12 pb-20">
        {/* Ambient Background */}
        <div className="pointer-events-none absolute -left-[20%] -top-[20%] h-[600px] w-[600px] rounded-full bg-amber-500/10 blur-[100px] mix-blend-screen" />
        <div className="pointer-events-none absolute -right-[20%] top-[20%] h-[600px] w-[600px] rounded-full bg-purple-600/10 blur-[100px] mix-blend-screen" />

        {/* Header: VIP Status Card */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-black/80 px-8 py-10 shadow-2xl backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute inset-0 bg-[url('/images/pattern-vip.svg')] opacity-5" />
          <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-black font-black shadow-lg shadow-amber-500/20 text-lg">
                  S
                </span>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-amber-500">시즌 패스</p>
              </div>
              <h1 className="text-[1.75rem] sm:text-[2.125rem] lg:text-[2.875rem] font-black text-white italic tracking-tight sm:tracking-tighter leading-tight break-words">
                VIP 등급 혜택{" "}
                <span className="block sm:inline text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-amber-600">
                  레벨 {season.data?.current_level ?? 1}
                </span>
              </h1>
              <p className="max-w-md text-base text-white/60">
                {seasonLevelSummary.detail}
              </p>
            </div>

            <div className="flex flex-col gap-4 min-w-[300px]">
              <div className="flex justify-between text-base font-bold text-amber-200/80">
                <span>현재 경험치</span>
                <span>{data.current_xp?.toLocaleString() ?? 0} / 목표</span>
              </div>
              <div className="relative h-5 w-full overflow-hidden rounded-full bg-black/50 shadow-inner">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600 to-yellow-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${seasonLevelSummary.progressPct}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
                {/* Glow Effect on Bar */}
                <div className="absolute inset-y-0 left-0 w-full opacity-50 mix-blend-overlay bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] animate-shimmer" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => season.refetch()} className="text-sm text-white/40 hover:text-white transition">↻ 정보 갱신</button>
              </div>
            </div>
          </div>
        </motion.header>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Main Content: Reward Showcase */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">레벨별 보상 목록</h2>
              <span className="text-base text-white/40">총 {data.levels.length} 레벨</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {data.levels.map((level) => {
                  const isAuto = !!level.auto_claim;
                  const rewardOverride: Record<number, string> = {
                    1: "🎫 룰렛 티켓 3장",
                    2: "🎲 주사위 티켓 3장",
                    3: "📦 올인원 티켓 번들",
                    4: "🍀 복권 티켓 5장",
                    5: "💣 티켓 폭탄 (룰렛10+주사위10)",
                    6: "💰 복권 10장 세트",
                    7: "⭐️ 1만 P + 골드 키 (관리자)",
                    8: "30,000 포인트 (관리자)",
                    9: "50,000 포인트 (관리자)",
                    10: "💎 10만 P + 다이아몬드 키",
                  };
                  const displayReward = rewardOverride[level.level] ?? level.reward_label;
                  const isManualAdmin = displayReward.includes("Admin") || displayReward.includes("Coin") || displayReward.includes("Gift") || displayReward.includes("DIAMOND") || displayReward.includes("Points");
                  const canClaim = !isManualAdmin && !isAuto && level.is_unlocked && !level.is_claimed;
                  const isLevel10 = level.level === 10;
                  const isLocked = !level.is_unlocked;
                  const isClaimed = level.is_claimed;

                  return (
                    <motion.div
                      key={level.level}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`group relative overflow-hidden rounded-2xl border p-5 transition-all
                                        ${isLevel10
                          ? "col-span-full border-purple-500/50 bg-gradient-to-br from-purple-900/40 to-black shadow-[0_0_30px_rgba(168,85,247,0.2)]"
                          : canClaim
                            ? "border-amber-500/50 bg-amber-900/20 shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:border-amber-400"
                            : isLocked
                              ? "border-white/5 bg-white/[0.02] opacity-60 grayscale"
                              : isClaimed ? "border-emerald-500/30 bg-emerald-950/20" : "border-white/10 bg-white/[0.05]"
                        }`}
                    >
                      {/* Unlocked Glow */}
                      {!isLocked && <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-white/5 blur-2xl transition group-hover:bg-white/10" />}

                      <div className="relative z-10 flex items-start justify-between">
                        <div>
                          <p className={`text-base font-bold uppercase tracking-widest ${isLevel10 ? "text-purple-300" : (canClaim || (isAuto && !isLocked)) ? "text-amber-300" : "text-white/40"}`}>
                            레벨 {level.level}
                          </p>
                          <h3 className={`mt-1 text-lg font-bold ${isLocked ? "text-white/40" : "text-white"}`}>
                            {displayReward}
                          </h3>
                          <p className="mt-1 text-sm text-white/30">필요 경험치: {level.required_xp.toLocaleString()} XP</p>
                        </div>
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${isClaimed ? "border-emerald-500 bg-emerald-500/20 text-emerald-500" :
                          canClaim ? "animate-bounce border-amber-500 bg-amber-500 text-black shadow-lg" :
                            !isLocked && isAuto ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" :
                              "border-white/10 bg-white/5 text-white/20"
                          }`}>
                          {isClaimed ? "✓" : canClaim ? "!" : (!isLocked && isAuto) ? "✓" : "🔒"}
                        </div>
                      </div>

                      <div className="mt-6">
                        <button
                          disabled={!canClaim}
                          onClick={() => canClaim && claimMutation.mutate(level.level)}
                          className={`w-full rounded-xl py-3 text-base font-black tracking-wide transition-all
                                                ${isClaimed
                              ? "cursor-default bg-emerald-500/10 text-emerald-500/50"
                              : canClaim
                                ? "bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg hover:brightness-110 active:scale-95"
                                : isManualAdmin && !isLocked
                                  ? "cursor-not-allowed border border-white/10 bg-transparent text-white/50"
                                  : isAuto && !isLocked
                                    ? "bg-emerald-500/10 text-emerald-500 font-bold"
                                    : "cursor-not-allowed bg-black/20 text-transparent"
                            }`}
                        >
                          {isClaimed ? "지급 완료" :
                            canClaim ? "보상 받기" :
                              isManualAdmin && !isLocked ? "관리자 문의" :
                                isAuto && !isLocked ? "자동 지급됨" :
                                  ""}
                        </button>
                        {isManualAdmin && !isAuto && !isClaimed && !isLocked && (
                          <p className="mt-2 text-center text-sm text-amber-500/80">
                            * 이 보상은 관리자가 직접 지급해 드립니다.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Sidebar: Daily Daily Missions */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">일일 미션</h2>
              <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${data.today?.stamped ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                {data.today?.stamped ? "완료됨" : "진행 중"}
              </span>
            </div>

            <div className="space-y-3">
              {cards.map((card, i) => (
                <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.05]">
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-lg grayscale transition group-hover:grayscale-0">
                      {card.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-base font-bold text-white">{card.title}</h4>
                      <p className="mt-0.5 text-sm text-white/40">{card.desc}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                        <p className="truncate text-sm font-medium text-cc-lime">{card.status}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-900/10 p-4">
              <p className="text-base text-blue-200">
                💡 <b>꿀팁:</b> 모든 일일 미션을 완료하면 보너스 스탬프를 받아 레벨업이 빨라집니다.
              </p>
            </div>
          </motion.aside>
        </div>
      </div>
    </FeatureGate>
  );
};

export default SeasonPassPage;

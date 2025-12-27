// src/pages/DicePage.tsx
import { useMemo, useState } from "react";
import DiceView from "../components/game/DiceView";
import { useDiceStatus, usePlayDice } from "../hooks/useDice";
import FeatureGate from "../components/feature/FeatureGate";
import { GAME_TOKEN_LABELS } from "../types/gameTokens";
import AnimatedNumber from "../components/common/AnimatedNumber";
import { tryHaptic } from "../utils/haptics";
import GamePageShell from "../components/game/GamePageShell";
import TicketZeroPanel from "../components/game/TicketZeroPanel";
import { useQueryClient } from "@tanstack/react-query";

const DicePage: React.FC = () => {
  const { data, isLoading, isError } = useDiceStatus();
  const playMutation = usePlayDice();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<"WIN" | "LOSE" | "DRAW" | null>(null);
  const [userDice, setUserDice] = useState<number[]>([]);
  const [dealerDice, setDealerDice] = useState<number[]>([]);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [rewardToast, setRewardToast] = useState<{ value: number; type: string } | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  const mapErrorMessage = (err: unknown) => {
    const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
    if (code === "NO_FEATURE_TODAY") return "오늘 설정된 이벤트가 없습니다.";
    if (code === "INVALID_FEATURE_SCHEDULE") return "이벤트 스케줄이 잘못되었습니다. 지민이에게 문의하세요.";
    if (code === "FEATURE_DISABLED") return "이벤트가 비활성화되었습니다.";
    if (code === "DAILY_LIMIT_REACHED") return "오늘 참여 횟수를 모두 사용했습니다.";
    if (code === "NOT_ENOUGH_TOKENS") return "티켓이 부족합니다. 지민이에게 충전을 요청해주세요.";
    return "주사위 전투를 진행할 수 없습니다. 잠시 후 다시 시도해주세요.";
  };

  const tokenLabel = useMemo(() => {
    if (!data) return "-";
    const typeLabel = data.token_type ? (GAME_TOKEN_LABELS[data.token_type] ?? data.token_type) : "-";
    const balanceLabel = typeof data.token_balance === "number" ? String(data.token_balance) : "-";
    return `${typeLabel} · ${balanceLabel}`;
  }, [data]);

  const isUnlimited = data?.remaining_plays === 0;
  const isOutOfTokens = typeof data?.token_balance === "number" && data.token_balance <= 0;

  const handlePlay = async () => {
    try {
      tryHaptic(12);
      setInfoMessage(null);
      setResult(null);
      setIsRolling(true);
      const response = await playMutation.mutateAsync();
      setIsRolling(false);
      setResult(response.result);
      setUserDice(response.user_dice);
      setDealerDice(response.dealer_dice);
      setInfoMessage(response.message ?? null);
      const rewardValue = response.reward_value ? Number(response.reward_value) : 0;
      const rewardType = response.reward_type ?? "보상";
      if (response.result === "WIN" && rewardValue > 0) {
        setRewardToast({ value: rewardValue, type: rewardType });
        setTimeout(() => setRewardToast(null), 2500);
      }
    } catch (e) {
      setIsRolling(false);
      console.error("Dice play failed", e);
    }
  };

  const content = (() => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-cc-lime/70 border-t-transparent" />
          <p className="text-[clamp(14px,3vw,18px)] font-semibold text-white/85">주사위 정보를 불러오는 중...</p>
        </div>
      );
    }

    if (isError || !data) {
      return (
        <div className="rounded-3xl border border-white/15 bg-white/5 p-6 text-center backdrop-blur">
          <p className="text-[clamp(16px,3.2vw,20px)] font-bold text-white">주사위 정보를 불러오지 못했습니다.</p>
          <p className="mt-2 text-sm text-white/60">잠시 후 다시 시도해주세요.</p>
        </div>
      );
    }

    return (
      <div className="relative space-y-8">
        {/* Background Atmosphere for Battle (Red vs Green) */}
        <div className="pointer-events-none absolute -left-[10%] top-[40%] h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[120px] mix-blend-screen" />
        <div className="pointer-events-none absolute -right-[10%] top-[20%] h-[500px] w-[500px] rounded-full bg-red-600/10 blur-[120px] mix-blend-screen" />

        {/* Global Flash Effect on Win */}
        {result === "WIN" && (
          <div className="pointer-events-none fixed inset-0 z-50 animate-pulse bg-white/20 mix-blend-overlay duration-75" />
        )}

        {rewardToast && (
          <div className="fixed bottom-6 right-6 z-50 overflow-hidden rounded-2xl border border-white/10 bg-black/80 px-5 py-4 text-white shadow-2xl backdrop-blur-xl animate-bounce-in">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-500 to-teal-500" />
            <div className="relative flex items-center gap-3 pl-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xl shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                ⚔️
              </span>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-emerald-400">전투 보상</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-white drop-shadow-lg">
                    <AnimatedNumber value={rewardToast.value} from={0} />
                  </span>
                  <span className="text-sm font-bold text-white/60">{rewardToast.type}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top Info Bar */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 backdrop-blur-md">
            <span className="text-sm text-white/50">티켓</span>
            <span className="font-mono text-base font-bold text-white">{tokenLabel}</span>
          </div>
        </div>

        {/* Battle Arena */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-sm">
          {/* Decorative Divider */}
          <div className="pointer-events-none absolute left-1/2 top-0 h-full w-[1px] -translate-x-1/2 bg-gradient-to-b from-transparent via-white/10 to-transparent max-md:hidden" />

          <div className="relative p-6 sm:p-10">
            <DiceView userDice={userDice} dealerDice={dealerDice} result={result} isRolling={isRolling} />

            {/* Battle VS Text (Overlay) */}
            {!result && !isRolling && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
                <span className="text-4xl font-black italic text-white/20">VS</span>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="mx-auto max-w-md space-y-5">
          {!!playMutation.error && !isRolling && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm font-medium text-red-200">
              {mapErrorMessage(playMutation.error)}
            </div>
          )}

          {isOutOfTokens && (
            <TicketZeroPanel
              tokenType={data.token_type}
              onClaimSuccess={() => queryClient.invalidateQueries({ queryKey: ["dice-status"] })}
            />
          )}

          <button
            type="button"
            disabled={isRolling || playMutation.isPending || (!isUnlimited && data.remaining_plays <= 0) || isOutOfTokens}
            onClick={handlePlay}
            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 shadow-[0_0_20px_rgba(5,150,105,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_35px_rgba(5,150,105,0.6)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <div className="relative z-10 flex items-center justify-center gap-3">
              {isRolling || playMutation.isPending ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span className="font-bold text-white">주사위 굴리는 중...</span>
                </>
              ) : (
                <>
                  <span className="text-2xl">🎲</span>
                  <span className="text-2xl font-black tracking-wider text-white">
                    {result || infoMessage ? "다시 대결하기" : "주사위 굴리기"}
                  </span>
                </>
              )}
            </div>
          </button>

          {infoMessage && !isRolling && result && (
            <div className={`text-center font-bold animate-fade-in-up ${result === 'WIN' ? 'text-emerald-400' : result === 'LOSE' ? 'text-red-400' : 'text-white/60'
              }`}>
              {result === 'WIN' ? "🏆 " : result === 'LOSE' ? "💀 " : ""}
              {infoMessage}
            </div>
          )}
        </div>

      </div>
    );
  })();

  return (
    <FeatureGate feature="DICE">
      <GamePageShell title="주사위 배틀" subtitle="Special Game Dice Battle">
        {content}
      </GamePageShell>
    </FeatureGate>
  );
};

export default DicePage;

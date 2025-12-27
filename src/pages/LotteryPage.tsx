// src/pages/LotteryPage.tsx
import { useMemo, useState } from "react";
import { usePlayLottery, useLotteryStatus } from "../hooks/useLottery";
import FeatureGate from "../components/feature/FeatureGate";
import LotteryCard from "../components/game/LotteryCard";
import { GAME_TOKEN_LABELS } from "../types/gameTokens";
import AnimatedNumber from "../components/common/AnimatedNumber";
import { tryHaptic } from "../utils/haptics";
import GamePageShell from "../components/game/GamePageShell";
import TicketZeroPanel from "../components/game/TicketZeroPanel";
import { useQueryClient } from "@tanstack/react-query";

interface RevealedPrize {
  id: number;
  label: string;
  reward_type: string;
  reward_value: string | number;
}

const LotteryPage: React.FC = () => {
  const { data, isLoading, isError, error } = useLotteryStatus();
  const playMutation = usePlayLottery();
  const queryClient = useQueryClient();
  const [revealedPrize, setRevealedPrize] = useState<RevealedPrize | null>(null);
  const [isScratching, setIsScratching] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [rewardToast, setRewardToast] = useState<{ value: number; type: string } | null>(null);

  const mapErrorMessage = (err: unknown) => {
    const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
    if (code === "NO_FEATURE_TODAY") return "오늘 설정된 이벤트가 없습니다.";
    if (code === "INVALID_FEATURE_SCHEDULE") return "이벤트 스케줄이 잘못되었습니다. 지민이에게 문의하세요.";
    if (code === "FEATURE_DISABLED") return "이벤트가 비활성화되었습니다.";
    if (code === "DAILY_LIMIT_REACHED") return "오늘 참여 횟수를 모두 사용했습니다.";
    if (code === "NOT_ENOUGH_TOKENS") return "티켓이 부족합니다. 지민이에게 충전을 요청해주세요.";
    return "복권 정보를 불러오지 못했습니다.";
  };

  const errorMessage = useMemo(() => {
    if (isLoading) return "";
    if (isError || !data) return mapErrorMessage(error);
    return "";
  }, [data, error, isError, isLoading]);

  const playErrorMessage = useMemo(
    () => (playMutation.error ? mapErrorMessage(playMutation.error) : undefined),
    [playMutation.error],
  );

  const tokenLabel = useMemo(() => {
    if (!data) return "-";
    const typeLabel = data.token_type ? (GAME_TOKEN_LABELS[data.token_type] ?? data.token_type) : "-";
    const balanceLabel = typeof data.token_balance === "number" ? String(data.token_balance) : "-";
    return `${typeLabel} · ${balanceLabel}`;
  }, [data]);

  const isUnlimited = data?.remaining_plays === 0;
  const isOutOfTokens = typeof data?.token_balance === "number" && data.token_balance <= 0;

  const handleScratch = async () => {
    if (isScratching || isRevealed) return;
    if (!isUnlimited && data && data.remaining_plays <= 0) return;
    if (isOutOfTokens) return;

    try {
      tryHaptic(12);
      setIsScratching(true);
      const result = await playMutation.mutateAsync();
      setIsScratching(false);
      setIsRevealed(true);
      setRevealedPrize({
        id: result.prize.id,
        label: result.prize.label,
        reward_type: result.prize.reward_type,
        reward_value: result.prize.reward_value,
      });
      const rewardValue = result.prize.reward_value ? Number(result.prize.reward_value) : 0;
      if (rewardValue > 0 && result.prize.reward_type !== "NONE") {
        setRewardToast({ value: rewardValue, type: result.prize.reward_type });
        setTimeout(() => setRewardToast(null), 2500);
      }
    } catch (mutationError) {
      setIsScratching(false);
      console.error("Lottery play failed", mutationError);
    }
  };

  const handleReset = () => {
    setIsRevealed(false);
    setRevealedPrize(null);
  };

  const content = (() => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-cc-lime/70 border-t-transparent" />
          <p className="text-[clamp(14px,3vw,18px)] font-semibold text-white/85">복권 정보를 불러오는 중...</p>
        </div>
      );
    }

    if (isError || !data) {
      return (
        <div className="rounded-3xl border border-white/15 bg-white/5 p-6 text-center backdrop-blur">
          <p className="text-[clamp(16px,3.2vw,20px)] font-bold text-white">{errorMessage || "데이터를 불러올 수 없습니다."}</p>
          <p className="mt-2 text-sm text-white/60">잠시 후 다시 시도해주세요.</p>
        </div>
      );
    }

    return (
      <div className="relative space-y-8">
        {/* Ambient Glow */}
        <div className="pointer-events-none absolute -left-[10%] top-[10%] h-[600px] w-[600px] rounded-full bg-red-600/10 blur-[100px] mix-blend-screen" />
        <div className="pointer-events-none absolute -right-[10%] -bottom-[10%] h-[500px] w-[500px] rounded-full bg-cc-gold/5 blur-[80px] mix-blend-screen" />

        {rewardToast && (
          <div className="fixed bottom-6 right-6 z-50 overflow-hidden rounded-2xl border border-white/10 bg-black/80 px-5 py-4 text-white shadow-2xl backdrop-blur-xl animate-bounce-in">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 to-orange-500" />
            <div className="relative flex items-center gap-3 pl-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-xl shadow-[0_0_15px_rgba(255,0,0,0.3)]">
                🎁
              </span>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-red-400">당첨 경품</p>
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
            <span className="text-sm text-white/50">보유 티켓</span>
            <span className="font-mono text-base font-bold text-white">{tokenLabel}</span>
          </div>
        </div>

        {/* Main Scratch Area */}
        <div className="flex justify-center">
          <div className="relative w-full max-w-[520px]">
            {/* Holographic Border Effect */}
            <div className="absolute -inset-[3px] rounded-[2rem] bg-gradient-to-r from-red-500 via-yellow-500 to-purple-600 opacity-30 blur-lg animate-pulse" />

            <div className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/40 p-1 shadow-2xl backdrop-blur-xl">
              <LotteryCard
                prize={revealedPrize ?? undefined}
                isRevealed={isRevealed}
                isScratching={isScratching}
                onScratch={handleScratch}
              />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mx-auto max-w-md space-y-4">
          {playErrorMessage && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm font-medium text-red-200">
              ⚠️ {playErrorMessage}
            </div>
          )}

          {isOutOfTokens && (
            <TicketZeroPanel
              tokenType={data.token_type}
              onClaimSuccess={() => queryClient.invalidateQueries({ queryKey: ["lottery-status"] })}
            />
          )}

          <button
            type="button"
            disabled={isScratching || playMutation.isPending || (!isUnlimited && data.remaining_plays <= 0) || isOutOfTokens}
            onClick={() => {
              if (isRevealed) {
                tryHaptic(10);
                handleReset();
                return;
              }
              void handleScratch();
            }}
            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 px-6 py-4 shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <div className="relative z-10 flex items-center justify-center gap-2">
              {isScratching || playMutation.isPending ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span className="font-bold text-white">확인 중...</span>
                </>
              ) : (
                <span className="text-2xl font-black tracking-wider text-white">
                  {isRevealed ? "다시 하기" : "복권 긁기"}
                </span>
              )}
            </div>
          </button>

          {revealedPrize && isRevealed && !isScratching && (
            <div className="mt-4 animate-bounce-in text-center">
              <span className="inline-block rounded-full bg-white/10 px-4 py-1 text-sm font-bold uppercase tracking-widest text-white/60">
                당첨 축하합니다
              </span>
              <h3 className="mt-2 text-2xl font-black text-white">
                {revealedPrize.label}
              </h3>
              <p className="font-bold text-cc-lime">
                +{Number(revealedPrize.reward_value).toLocaleString()} {revealedPrize.reward_type}
              </p>
            </div>
          )}
        </div>

        {/* Prize Gallery (Grid View) */}
        <div className="mt-12">
          <h3 className="mb-6 flex items-center justify-center gap-3 text-center">
            <span className="h-[1px] w-8 bg-white/20" />
            <span className="text-base font-bold uppercase tracking-[0.2em] text-white/40">당첨 경품 목록</span>
            <span className="h-[1px] w-8 bg-white/20" />
          </h3>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.prizes.map((prize) => (
              <div
                key={prize.id}
                className={`group relative overflow-hidden rounded-2xl border p-4 transition-all ${prize.is_active === false
                  ? "border-white/5 bg-white/[0.02] opacity-40 grayscale"
                  : "border-white/10 bg-white/[0.05] hover:border-white/20 hover:bg-white/[0.08]"
                  }`}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-transparent text-2xl shadow-inner">
                    🎁
                  </div>
                  <p className="line-clamp-1 text-base font-bold text-white group-hover:text-cc-gold">{prize.label}</p>
                  <p className="mt-1 text-sm font-medium text-cc-lime">
                    {Number(prize.reward_value).toLocaleString()} <span className="text-white/40">{prize.reward_type}</span>
                  </p>
                </div>
                {prize.stock !== undefined && prize.stock !== null && (
                  <div className="absolute right-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-sm text-white/50">
                    x{prize.stock}
                  </div>
                )}
              </div>
            ))}
          </div>

          {data.prizes.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-base text-white/40">
              현재 진행 중인 경품이 없습니다.
            </div>
          )}
        </div>

      </div>
    );
  })();

  return (
    <FeatureGate feature="LOTTERY">
      <GamePageShell title="지민코드 복권" subtitle="Special Game Lottery">
        {content}
      </GamePageShell>
    </FeatureGate>
  );
};

export default LotteryPage;

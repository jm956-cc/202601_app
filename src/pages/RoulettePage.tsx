import { useEffect, useMemo, useRef, useState } from "react";
import RouletteWheel from "../components/game/RouletteWheel";
import { usePlayRoulette, useRouletteStatus } from "../hooks/useRoulette";
import FeatureGate from "../components/feature/FeatureGate";
import { GAME_TOKEN_LABELS } from "../types/gameTokens";
import type { RoulettePlayResponse } from "../api/rouletteApi";
import AnimatedNumber from "../components/common/AnimatedNumber";
import { tryHaptic } from "../utils/haptics";
import GamePageShell from "../components/game/GamePageShell";
import TicketZeroPanel from "../components/game/TicketZeroPanel";
import { useQueryClient } from "@tanstack/react-query";

const FALLBACK_SEGMENTS = Array.from({ length: 12 }).map((_, idx) => ({
  label: `BONUS ${idx + 1}`,
  weight: 1,
  isJackpot: idx === 0,
}));

const RoulettePage: React.FC = () => {
  const { data, isLoading, isError, error } = useRouletteStatus();
  const playMutation = usePlayRoulette();
  const queryClient = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const SPIN_DURATION_MS = 3000;
  const [isSpinning, setIsSpinning] = useState(false);
  const [displayedResult, setDisplayedResult] = useState<RoulettePlayResponse | null>(null);
  const [rewardToast, setRewardToast] = useState<{ value: number; type: string } | null>(null);
  const pendingResultRef = useRef<RoulettePlayResponse | null>(null);
  const spinStartAtRef = useRef<number | null>(null);
  const transitionEndAtRef = useRef<number | null>(null);
  const spinHapticIntervalRef = useRef<number | null>(null);
  const spinHapticTimeoutsRef = useRef<number[]>([]);

  const segments = useMemo(() => {
    const resolved = (data?.segments ?? []).map((segment) => ({
      label: segment.label,
      weight: segment.weight,
      isJackpot: segment.isJackpot,
    }));
    return resolved.length > 0 ? resolved : FALLBACK_SEGMENTS;
  }, [data?.segments]);

  const usingFallbackSegments = useMemo(() => (data?.segments ?? []).length === 0, [data?.segments]);

  const mapErrorMessage = (err: unknown) => {
    const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
    if (code === "NO_FEATURE_TODAY") return "오늘 활성화된 이벤트가 없습니다.";
    if (code === "INVALID_FEATURE_SCHEDULE") return "이벤트 일정이 맞지 않습니다. 지민이에게 문의하세요.";
    if (code === "FEATURE_DISABLED") return "이벤트가 비활성화되었습니다.";
    if (code === "DAILY_LIMIT_REACHED") return "오늘 참여 횟수를 모두 사용했습니다.";
    if (code === "NOT_ENOUGH_TOKENS") return "티켓이 부족합니다. 지민이에게 충전을 요청하세요.";
    return "룰렛 정보를 불러오지 못했습니다.";
  };

  const errorMessage = useMemo(() => (error ? mapErrorMessage(error) : undefined), [error]);
  const playErrorMessage = useMemo(
    () => (playMutation.error ? mapErrorMessage(playMutation.error) : undefined),
    [playMutation.error]
  );

  const tokenBalance = useMemo(() => {
    if (typeof data?.token_balance !== "number") return null;
    return data.token_balance;
  }, [data?.token_balance]);

  const tokenLabel = useMemo(() => {
    if (!data) return "-";
    const typeLabel = data.token_type ? (GAME_TOKEN_LABELS[data.token_type] ?? data.token_type) : "-";
    return typeLabel;
  }, [data]);

  const isUnlimited = data?.remaining_spins === 0;
  const isOutOfTokens = typeof data?.token_balance === "number" && data.token_balance <= 0;

  const handlePlay = async () => {
    try {
      tryHaptic([10, 35, 10]);

      pendingResultRef.current = null;
      setSelectedIndex(undefined);
      setDisplayedResult(null);
      setRewardToast(null);

      const requestAt = performance.now();
      console.log("[Roulette] play start", { requestAt });

      const result = await playMutation.mutateAsync();
      const resultAt = performance.now();
      console.log("[Roulette] result received", {
        label: result.segment?.label,
        reward: result.reward_value,
        selectedIndex: result.selected_index,
        latencyMs: resultAt - requestAt,
      });

      pendingResultRef.current = result;
      setSelectedIndex(result.selected_index);
      setIsSpinning(true);
      spinStartAtRef.current = performance.now();
    } catch (e) {
      console.error("Roulette play failed", e);
    }
  };

  const handleSpinEnd = () => {
    if (!pendingResultRef.current) return;

    transitionEndAtRef.current = performance.now();
    console.log("[Roulette] wheel transitionend", {
      spinMs:
        spinStartAtRef.current && transitionEndAtRef.current
          ? transitionEndAtRef.current - spinStartAtRef.current
          : "n/a",
    });

    const result = pendingResultRef.current;
    pendingResultRef.current = null;

    setIsSpinning(false);
    setDisplayedResult(result);

    const rewardValue = result?.reward_value ? Number(result.reward_value) : 0;
    const rewardType = result?.reward_type ?? "NONE";
    if (rewardValue > 0 && rewardType !== "NONE") {
      setRewardToast({ value: rewardValue, type: rewardType });
      window.setTimeout(() => setRewardToast(null), 2500);
      tryHaptic([18, 50, 18]);
    } else {
      tryHaptic(12);
    }

    const applyAt = performance.now();
    console.log("[Roulette] result applied", {
      delayAfterTransitionMs: transitionEndAtRef.current ? applyAt - transitionEndAtRef.current : "n/a",
      totalMs: spinStartAtRef.current ? applyAt - spinStartAtRef.current : "n/a",
    });
  };

  useEffect(() => {
    return () => {
      pendingResultRef.current = null;
      spinStartAtRef.current = null;
      transitionEndAtRef.current = null;

      if (spinHapticIntervalRef.current) {
        window.clearInterval(spinHapticIntervalRef.current);
        spinHapticIntervalRef.current = null;
      }
      spinHapticTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
      spinHapticTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const canHaptic = (() => {
      if (typeof window === "undefined") return false;
      if (typeof navigator === "undefined") return false;
      if (!("vibrate" in navigator)) return false;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;

      // Prefer haptics on mobile-like pointers only.
      if (typeof window.matchMedia === "function") {
        if (!window.matchMedia("(pointer: coarse)").matches) return false;
      }
      return true;
    })();

    if (!isSpinning || !canHaptic) {
      if (spinHapticIntervalRef.current) {
        window.clearInterval(spinHapticIntervalRef.current);
        spinHapticIntervalRef.current = null;
      }
      spinHapticTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
      spinHapticTimeoutsRef.current = [];
      return;
    }

    // Rate-limited spin haptics: short pulses, slightly faster near the end.
    const maxPulses = 6;
    let pulses = 0;

    spinHapticIntervalRef.current = window.setInterval(() => {
      if (!spinStartAtRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const elapsed = performance.now() - spinStartAtRef.current;
      if (elapsed < 350) return; // let the wheel start visually

      pulses += 1;
      const intensity = Math.min(14, 6 + pulses);
      tryHaptic(intensity);

      if (pulses >= maxPulses) {
        if (spinHapticIntervalRef.current) {
          window.clearInterval(spinHapticIntervalRef.current);
          spinHapticIntervalRef.current = null;
        }
      }
    }, 420);

    // Final accent close to the stop (kept short to avoid over-vibration).
    const finalAccentAt = Math.max(0, SPIN_DURATION_MS - 220);
    spinHapticTimeoutsRef.current.push(
      window.setTimeout(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        tryHaptic([12, 35, 12]);
      }, finalAccentAt)
    );

    return () => {
      if (spinHapticIntervalRef.current) {
        window.clearInterval(spinHapticIntervalRef.current);
        spinHapticIntervalRef.current = null;
      }
      spinHapticTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
      spinHapticTimeoutsRef.current = [];
    };
  }, [SPIN_DURATION_MS, isSpinning]);

  const content = (() => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-cc-lime/70 border-t-transparent" />
          <p className="text-[clamp(14px,3vw,18px)] font-semibold text-white/85">룰렛 정보를 불러오는 중...</p>
        </div>
      );
    }

    if (isError || !data) {
      return (
        <div className="rounded-3xl border border-white/15 bg-white/5 p-6 text-center backdrop-blur">
          <p className="text-[clamp(16px,3.2vw,20px)] font-bold text-white">{errorMessage ?? "데이터를 불러오지 못했습니다."}</p>
          <p className="mt-2 text-sm text-white/60">잠시 후 다시 시도하거나 운영자에게 문의하세요.</p>
        </div>
      );
    }

    return (
      <div className="relative space-y-8">
        {/* Global Ambient Glow (은은한 배경 광원) */}
        <div className="pointer-events-none absolute -left-[20%] -top-[20%] h-[800px] w-[800px] rounded-full bg-cc-gold/5 blur-[120px] mix-blend-screen" />
        <div className="pointer-events-none absolute -right-[10%] top-[20%] h-[600px] w-[600px] rounded-full bg-cc-green/5 blur-[100px] mix-blend-screen" />

        {!isSpinning && rewardToast && (
          <div className="fixed bottom-6 right-6 z-50 overflow-hidden rounded-2xl border border-white/10 bg-black/80 px-5 py-4 text-white shadow-2xl backdrop-blur-xl animate-bounce-in">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cc-gold/10 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-cc-gold to-cc-orange" />
            <div className="relative flex items-center gap-3 pl-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cc-gold/30 bg-cc-gold/10 text-xl shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                🪙
              </span>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-cc-gold">획득 보상</p>
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

        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
          {/* Left Column: Roulette Wheel */}
          <div className="relative flex flex-col items-center justify-center">
            {/* Wheel Container with Glassmorphism */}
            <div className="relative w-full overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.02] p-6 shadow-2xl backdrop-blur-sm sm:p-10">
              {/* Inner Glow around wheel */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)]" />

              <RouletteWheel
                segments={segments}
                isSpinning={isSpinning}
                selectedIndex={selectedIndex}
                spinDurationMs={SPIN_DURATION_MS}
                onSpinEnd={handleSpinEnd}
              />
            </div>

            {usingFallbackSegments && (
              <div className="mt-4 flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/5 px-4 py-1.5 text-sm font-medium text-red-200">
                <span className="block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                라이브 데이터 연결 실패 (데모 모드)
              </div>
            )}
          </div>

          {/* Right Column: Controls & Info */}
          <div className="flex flex-col gap-6">
            {/* Control Panel Card */}
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-8 shadow-2xl backdrop-blur-md">
              {/* Decorative Lines */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="pointer-events-none absolute bottom-0 right-0 h-[200px] w-[200px] bg-[radial-gradient(circle_at_bottom_right,rgba(255,215,0,0.05)_0%,transparent_70%)]" />

              {/* Status Badges */}
              <div className="mb-8 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-2 pr-5 backdrop-blur-md">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm">💰</div>
                  <div className="flex flex-col leading-none">
                    <span className="text-sm text-white/40">{tokenLabel}</span>
                    <span className="font-mono text-sm font-bold text-white">
                      {tokenBalance !== null ? <AnimatedNumber value={tokenBalance} /> : "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Area */}
              <div className="space-y-4">
                {playErrorMessage && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
                    ⚠️ {playErrorMessage}
                  </div>
                )}

                {isOutOfTokens && (
                  <TicketZeroPanel
                    tokenType={data.token_type}
                    onClaimSuccess={() => queryClient.invalidateQueries({ queryKey: ["roulette-status"] })}
                  />
                )}

                <button
                  type="button"
                  disabled={playMutation.isPending || isSpinning || (!isUnlimited && data.remaining_spins <= 0) || isOutOfTokens}
                  onClick={handlePlay}
                  className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-b from-white to-gray-300 px-6 py-5 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  <div className="relative z-10 flex items-center justify-center gap-3">
                    {playMutation.isPending ? (
                      <>
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                        <span className="text-lg font-black text-black">추첨 중...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xl">💎</span>
                        <span className="text-lg font-black tracking-wide text-black opacity-90">
                          {!isSpinning && displayedResult ? "다시 돌리기" : "룰렛 시작"}
                        </span>
                      </>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Result Display (Below Controls) */}
            {!isSpinning && displayedResult && (
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 p-1 text-center backdrop-blur-sm animate-fade-in-up">
                <div className="relative overflow-hidden rounded-[1.8rem] border border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent px-8 py-8">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cc-gold/50 to-transparent" />

                  <p className="text-sm font-bold uppercase tracking-[0.4em] text-white/40">당첨 결과</p>
                  <h3 className="mt-2 text-3xl font-black text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                    {displayedResult.segment.label}
                  </h3>

                  {displayedResult.reward_type && displayedResult.reward_type !== "NONE" && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cc-gold/20 bg-cc-gold/10 px-6 py-2">
                      <span className="text-base font-bold text-cc-gold">
                        +{Number(displayedResult.reward_value).toLocaleString()} {displayedResult.reward_type}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <FeatureGate feature="ROULETTE">
      <GamePageShell title="럭셔리 CC룰렛" subtitle="Premium Prize Roulette">
        {content}
      </GamePageShell>
    </FeatureGate>
  );
};

export default RoulettePage;

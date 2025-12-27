import React, { useMemo } from "react";

interface Prize {
  readonly id: number;
  readonly label: string;
  readonly reward_type: string;
  readonly reward_value: string | number;
  readonly stock?: number | null;
  readonly is_active?: boolean;
  readonly weight?: number;
}

interface LotteryCardProps {
  readonly prize?: Prize;
  readonly isRevealed: boolean;
  readonly isScratching: boolean;
  readonly onScratch: () => void;
}
const LotteryCard: React.FC<LotteryCardProps> = React.memo(({ prize, isRevealed, isScratching, onScratch }) => {
  const disabled = useMemo(() => isScratching || isRevealed, [isScratching, isRevealed]);

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-6 shadow-[0_14px_40px_rgba(0,0,0,0.55)] sm:p-8">
        <div className="pointer-events-none absolute left-4 top-4 text-4xl opacity-15">🎄</div>
        <div className="pointer-events-none absolute bottom-4 right-4 text-4xl opacity-15">🎁</div>
        <div className="pointer-events-none absolute right-4 top-4 text-4xl opacity-15">⭐</div>
        <div className="pointer-events-none absolute bottom-4 left-4 text-4xl opacity-15">❄️</div>
        <div className="pointer-events-none absolute -left-10 -top-14 h-40 w-40 rounded-full bg-cc-lime/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-14 bottom-0 h-44 w-44 rounded-full bg-white/5 blur-3xl" />

        <div className="relative min-h-[200px] rounded-3xl border border-white/15 bg-white/5 p-6">
          <div
            className={`relative flex h-full min-h-[160px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black/40 focus:outline-none focus:ring-2 focus:ring-cc-lime/60 ${disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
              }`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (!disabled) onScratch();
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onScratch();
              }
            }}
          >
            <div className="relative z-10 flex flex-col items-center text-center">
              {!isRevealed ? (
                <>
                  <div className="mb-4 text-5xl">🎫</div>
                  <p className="text-[clamp(16px,3.6vw,18px)] font-extrabold text-cc-lime">
                    {isScratching ? "뽑는 중..." : "카드를 눌러 바로 뽑기"}
                  </p>
                  <p className="mt-2 text-[clamp(12px,2.6vw,14px)] text-white/60">결과는 즉시 공개됩니다.</p>
                </>
              ) : prize ? (
                <>
                  <div className="mb-2 text-5xl animate-bounce-in">🎉</div>
                  <p className="text-[clamp(12px,2.4vw,13px)] font-extrabold uppercase tracking-[0.35em] text-white/60">축하합니다!</p>
                  <p className="mt-2 text-[clamp(20px,5vw,26px)] font-extrabold text-white">{prize.label}</p>
                  <p className="mt-1 text-[clamp(12px,2.6vw,14px)] font-bold text-cc-lime">
                    +{prize.reward_value} <span className="text-white/70">{prize.reward_type}</span>
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-2 text-5xl animate-bounce-in">💨</div>
                  <p className="text-[clamp(18px,4.4vw,22px)] font-extrabold text-white/85">다음 기회에!</p>
                  <p className="mt-2 text-[clamp(12px,2.6vw,14px)] text-white/60">다시 시도해 주세요.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});


export default LotteryCard;

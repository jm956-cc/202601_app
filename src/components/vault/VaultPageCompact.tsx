import React, { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  getVaultStatus,
  requestWithdrawal,
  VaultStatusResponse,
} from "../../api/vaultApi";
import { tryHaptic } from "../../utils/haptics";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedNumber from "../common/AnimatedNumber";
import { useToast } from "../../components/common/ToastProvider";
import { Lock, ListChecks } from "lucide-react";
import WithdrawalConditionsModal from "../modal/WithdrawalConditionsModal";
import WithdrawalProgressModal from "../modal/WithdrawalProgressModal";
import { useSound } from "../../hooks/useSound";

const SparkleDust: React.FC = () => {
  // Generate 25 random sparkles for a cleaner "Falling Stars" effect
  const sparkles = useMemo(
    () =>
      Array.from({ length: 25 }).map(() => ({
        left: Math.random() * 100, // Random horizontal position 0-100%
        scale: Math.random() * 1.0 + 0.5, // 0.5 ~ 1.5 size variation
        duration: Math.random() * 10 + 12, // 12~22 seconds fall duration (Slower & Smoother)
        delay: -Math.random() * 20, // Negative delay for instant coverage
      })),
    [],
  );

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {sparkles.map((s, i) => (
        <motion.img
          key={i}
          src="/assets/sparkle.png"
          className="absolute w-6 h-6 object-contain opacity-50"
          style={{
            left: `${s.left}%`,
            top: "-10%", // Start above screen
          }}
          animate={{
            y: ["0vh", "120vh"], // Fall down relative to viewport height
            opacity: [0, 0.8, 0.8, 0], // Subtle fade interaction
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: s.duration,
            repeat: Infinity,
            delay: s.delay,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
};

const VaultPageCompact: React.FC = () => {
  const { addToast, addToastNode } = useToast();
  const { playVaultJingle } = useSound();
  const [showConditionsModal, setShowConditionsModal] = React.useState(false);
  const [showProgressModal, setShowProgressModal] = React.useState(false);

  // Fetch Vault Status
  const vault = useQuery<VaultStatusResponse>({
    queryKey: ["vault-status"],
    queryFn: getVaultStatus,
    staleTime: 5000,
    retry: false,
    refetchInterval: 10000,
  });

  const view = useMemo(() => {
    const data = vault.data;
    // Basic Balances
    const vaultBalance = data?.vaultBalance ?? 0;
    const availableAmount =
      data?.vaultAmountAvailable ?? data?.availableBalance ?? 0;
    const reservedAmount =
      data?.vaultAmountReserved ?? Math.max(vaultBalance - availableAmount, 0);

    // Unlock Conditions (Hardcoded for now based on Reward Guide Logic or API data)
    const playTarget = data?.dailyPlayTarget || 1;
    const spentTarget = data?.dailyVaultSpentTarget || 1;

    const playProg = Math.min(
      100,
      ((data?.dailyPlayCount ?? 0) / playTarget) * 100,
    );
    const spentProg = Math.min(
      100,
      ((data?.dailyVaultSpent ?? 0) / spentTarget) * 100,
    );
    const depositProg = data?.dailyDepositConfirmed ? 100 : 0;

    const progressPercent = Math.floor(
      (playProg + spentProg + depositProg) / 3,
    );

    const isPlayMet =
      (data?.dailyPlayCount ?? 0) >= (data?.dailyPlayTarget ?? 0);
    const isSpentMet =
      (data?.dailyVaultSpent ?? 0) >= (data?.dailyVaultSpentTarget ?? 0);
    const isDepositMet = !!data?.dailyDepositConfirmed;

    // Unlocked ONLY if Eligible AND All Conditions Met
    const isUnlocked =
      !!data?.eligible && isPlayMet && isSpentMet && isDepositMet;

    // Policy Status
    const depositStatus = data?.depositStatus || "ACTIVE";
    const benefitsSuspended = data?.benefitsSuspended || false;
    const vaultMaxLimit = data?.vaultMaxLimit || 0;
    const showLimitWarning = vaultMaxLimit > 0 && vaultBalance >= vaultMaxLimit;
    const accrualMultiplier = data?.accrualMultiplier ?? 1.0;

    return {
      vaultBalance,
      availableAmount,
      reservedAmount,
      isUnlocked,
      progressPercent,
      depositStatus,
      benefitsSuspended,
      vaultMaxLimit,
      showLimitWarning,
      accrualMultiplier,
    };
  }, [vault.data]);

  // Handle Loading
  if (vault.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/70 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center mx-auto w-full max-w-lg relative min-h-[50vh]">
      <SparkleDust />

      {/* Header */}
      <div className="w-full mb-8 pt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            tryHaptic(10);
            addToastNode(
              <div className="text-center space-y-1">
                <p>배민 2만부터 지급가능</p>
                <p>씨씨코인 하루 1개 지급가능 (케어방이벤트 중복적용x)</p>
                <p>컴포즈 아아 1만부터 지급가능</p>
              </div>,
              { tone: "info" },
            );
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[12px] font-black text-white/70 active:scale-[0.98] transition-transform"
        >
          <img
            src="/assets/logo_cc_v2.png"
            className="w-4 h-4 object-contain"
            alt=""
          />
          안내
        </button>
      </div>

      {/* 1. Unlocked State (CASH OUT MODE) */}
      {view.isUnlocked ? (
        <div className="w-full flex-1 flex flex-col items-center justify-center animate-fadeIn">
          {/* Unlocked Icon Animation */}
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-emerald-500 blur-[80px] opacity-20 animate-pulse" />
            <img
              src="/assets/vault/vault_open.png"
              alt="Unlocked Vault"
              className="relative z-10 w-48 h-48 object-contain drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]"
            />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
              <button
                onClick={() => setShowProgressModal(true)}
                className="bg-emerald-500 text-black font-black text-[10px] px-2 py-0.5 rounded-full animate-bounce hover:scale-110 active:scale-95 transition-transform"
              >
                내돈찾기
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-amber-400 blur-xl opacity-40 animate-pulse" />
              <img
                src="/assets/asset_coin_gold.png"
                alt="Coin"
                className="relative z-10 w-12 h-12 object-contain animate-bounce-subtle"
              />
            </div>
            <div className="text-center">
              <div className="text-5xl font-black text-white tracking-tighter drop-shadow-xl flex items-center gap-1">
                <AnimatedNumber
                  value={view.availableAmount}
                  onAnimationStart={playVaultJingle}
                />
                <span className="text-2xl ml-[-2px]">원</span>
              </div>
            </div>
          </div>

          <button
            onClick={async () => {
              if (view.availableAmount < 10000) {
                addToast("최소 10,000원부터 출금 가능합니다.", "error");
                return;
              }
              if (!window.confirm("전액 출금 신청하시겠습니까?")) return;
              tryHaptic(50);
              try {
                const res = await requestWithdrawal(view.availableAmount);
                addToast(res.message, res.success ? "success" : "error");
                vault.refetch();
              } catch {
                addToast("신청 중 오류가 발생했습니다.", "error");
              }
            }}
            className="w-full max-w-[200px] h-[48px] rounded-2xl bg-emerald-500/80 backdrop-blur-md border border-white/20 text-white font-bold text-[14px] shadow-[0_8px_16px_-4px_rgba(16,185,129,0.5)] hover:bg-emerald-400 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-1.5 mb-3"
          >
            <img
              src="/assets/asset_coin_gold.png"
              className="w-5 h-5 object-contain drop-shadow-sm"
              alt=""
            />
            <span>출금 신청하기</span>
          </button>

          {/* Charge Button */}
          <a
            href="https://ccc-010.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full max-w-[200px] h-[48px] rounded-2xl bg-emerald-500/80 backdrop-blur-md border border-white/20 text-white font-bold text-[14px] shadow-[0_8px_16px_-4px_rgba(16,185,129,0.5)] hover:bg-emerald-400 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 mb-3"
          >
            <img
              src="/assets/logo_cc_v2.png"
              className="w-5 h-5 object-contain mix-blend-screen drop-shadow-md"
              alt=""
            />
            <span className="drop-shadow-sm">씨씨카지노 충전하기</span>
          </a>

          {/* Secondary Info Link for Unlocked state */}
          <button
            onClick={() => setShowConditionsModal(true)}
            data-tour="vault-condition-btn"
            className="w-full max-w-[200px] h-[48px] rounded-2xl bg-white/5 border border-white/10 text-white/70 font-bold text-[14px] hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <ListChecks size={14} />
            출금 조건 및 규정 확인
          </button>
        </div>
      ) : (
        /* 2. Locked State (CHARGING MODE) */
        <div className="w-full flex-1 flex flex-col items-center animate-fadeIn">
          <div className="relative mb-6">
            <div className="flex flex-col items-center gap-2 mb-2">
              {/* Status Badge */}
              {(view.depositStatus === "WARNING" ||
                view.depositStatus === "INACTIVE") && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`px-3 py-1 rounded-full border text-[11px] font-bold tracking-widest uppercase flex items-center gap-1.5 shadow-lg ${
                    view.depositStatus === "INACTIVE"
                      ? "bg-red-900/80 border-red-500/50 text-red-100 animate-pulse"
                      : "bg-amber-900/80 border-amber-500/50 text-amber-100"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${view.depositStatus === "INACTIVE" ? "bg-red-500" : "bg-amber-500"}`}
                  />
                  {view.depositStatus === "INACTIVE"
                    ? "활동 정지 (적립 불가)"
                    : "적립 경고 (50% 감소)"}
                </motion.div>
              )}

              {/* Limit Warning */}
              {view.showLimitWarning && (
                <div className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-200 text-[10px] font-bold">
                  ⚠️ 보관 한도 초과
                </div>
              )}

              {/* CC Vault Label */}
              <span className="px-3 py-1 rounded-full bg-emerald-900/50 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-widest uppercase">
                CC코드금고
              </span>
            </div>

            {/* Glassmorphism Vault Icon */}
            <div className="relative w-48 h-48">
              <img
                src="/assets/vault/vault_open.png"
                alt="Vault"
                className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(16,185,129,0.3)]"
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 mb-8">
            <div className="flex items-center gap-2">
              <img
                src="/assets/asset_coin_gold.png"
                alt="Coin"
                className="w-8 h-8 object-contain opacity-80"
              />
              <div className="text-4xl font-black text-white/90 tracking-tighter">
                <AnimatedNumber value={view.vaultBalance} />원
              </div>
            </div>
            <div className="text-xs text-emerald-300 font-bold">
              출금 가능액: {view.availableAmount.toLocaleString()}원
            </div>
          </div>

          {/* Ultimate Glassmorphism Gauge Card */}
          <div className="w-full max-w-xs rounded-[24px] p-5 relative overflow-hidden group mb-6 backdrop-blur-3xl bg-white/[0.04] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
            {/* Shimmering glass highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

            {/* Gauge Header */}
            <div className="flex justify-between items-center mb-3 relative z-10">
              <span className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.6)]" />
                <span className="text-white/80 font-bold text-[16px] tracking-widest uppercase drop-shadow-sm">
                  출금 미션 현황
                </span>
              </span>
              <div
                className="flex items-baseline gap-0.5 cursor-pointer"
                onClick={() => setShowProgressModal(true)}
              >
                <span className="text-xl font-black text-amber-500 tabular-nums drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                  {view.progressPercent}
                </span>
                <span className="text-[10px] font-bold text-amber-500/60">
                  %
                </span>
              </div>
            </div>

            {/* Premium Progress Bar */}
            <div className="relative h-4 bg-black/40 rounded-full p-1 border border-white/5 shadow-inner">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${view.progressPercent}%` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full rounded-full relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]" />
              </motion.div>
            </div>
          </div>

          {/* Footer Info Row - Redesigned for Uniformity */}
          <div className="flex w-full max-w-xs gap-2 mb-3">
            <button
              onClick={() => setShowConditionsModal(true)}
              data-tour="vault-condition-btn"
              className="flex-1 h-[50px] flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 text-[15px] font-bold tracking-wide hover:bg-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <ListChecks size={16} />
              <span>출금 조건</span>
            </button>

            <button
              className="flex-1 h-[50px] rounded-2xl bg-emerald-900/40 border border-white/10 text-white/50 font-bold text-[15px] items-center justify-center gap-1.5 flex cursor-not-allowed"
              disabled
            >
              <Lock size={14} className="opacity-50" />
              <span>출금 신청</span>
            </button>
          </div>

          {/* Benefit Suspension Warning */}
          {view.benefitsSuspended && (
            <div className="w-full max-w-xs mb-3 px-3 py-2 rounded-xl bg-red-900/20 border border-red-500/30 flex items-center gap-2">
              <Lock size={14} className="text-red-400" />
              <span className="text-[11px] text-red-200 font-bold leading-tight">
                장기 미활동으로 입금 전까지
                <br />
                모든 혜택이 일시 정지됩니다.
              </span>
            </div>
          )}

          {/* Charge Button */}
          <a
            href="https://ccc-010.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full max-w-xs h-[50px] rounded-2xl bg-emerald-600 border border-emerald-400/30 text-white font-black text-[15px] shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:bg-emerald-500 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <img
              src="/assets/logo_cc_v2.png"
              className="w-4 h-4 object-contain mix-blend-screen"
              alt=""
            />
            씨씨카지노 충전하기
          </a>
        </div>
      )}

      <AnimatePresence>
        {showConditionsModal && (
          <WithdrawalConditionsModal
            onClose={() => setShowConditionsModal(false)}
            vaultBalance={view.availableAmount}
            dailyPlayCount={vault.data?.dailyPlayCount ?? 0}
            dailyPlayTarget={vault.data?.dailyPlayTarget ?? 30}
            dailyVaultSpent={vault.data?.dailyVaultSpent ?? 0}
            dailyVaultSpentTarget={vault.data?.dailyVaultSpentTarget ?? 10000}
            dailyDepositConfirmed={vault.data?.dailyDepositConfirmed ?? false}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProgressModal && (
          <WithdrawalProgressModal
            onClose={() => setShowProgressModal(false)}
            vaultBalance={view.availableAmount}
            dailyPlayCount={vault.data?.dailyPlayCount ?? 0}
            dailyPlayTarget={vault.data?.dailyPlayTarget ?? 30}
            dailyVaultSpent={vault.data?.dailyVaultSpent ?? 0}
            dailyVaultSpentTarget={vault.data?.dailyVaultSpentTarget ?? 10000}
            dailyDepositConfirmed={vault.data?.dailyDepositConfirmed ?? false}
            withdrawalCount={vault.data?.withdrawalCount ?? 0}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default VaultPageCompact;

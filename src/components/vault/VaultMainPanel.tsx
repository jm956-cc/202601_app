import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getVaultStatus } from "../../api/vaultApi";
import { getUiConfig } from "../../api/uiConfigApi";
import VaultModal from "./VaultModal";
import AnimatedCountdown from "../common/AnimatedCountdown";
import { parseVaultUnlockRules } from "../../utils/vaultUtils";

type RewardPreviewItem = {
  label: string;
  amount: number | undefined;
  unit: string | undefined;
};

type RewardPreviewProgress = {
  currentPoints: number;
  nextPoints: number;
  unitLabel: string;
};

const formatWon = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

const parseDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const formatDateTime = (d: Date | null): string | null => {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

const CountdownTimer: React.FC<{ expiresAt: Date }> = ({ expiresAt }) => {
  const [isWarning, setIsWarning] = useState(false);

  useEffect(() => {
    const calculate = () => {
      const difference = expiresAt.getTime() - new Date().getTime();
      if (difference <= 0) {
        setIsWarning(false);
        return;
      }
      setIsWarning(difference < 60 * 60 * 1000);
      return;
    };
    calculate();
    const timer = setInterval(() => calculate(), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <div className={`px-4 py-2 rounded-full border ${isWarning ? "border-red-500/50 bg-red-500/10 text-red-300" : "border-white/10 bg-white/5 text-white/70"} text-sm font-bold flex items-center gap-2 backdrop-blur-md shadow-lg`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
      <AnimatedCountdown
        targetMs={expiresAt.getTime()}
        warnUnderMs={60 * 60 * 1000}
        expiredText="00:00:00"
        suffix=" 후 소멸"
        className={isWarning ? "font-bold animate-pulse" : ""}
        showDays={false}
      />
    </div>
  );
};

const VaultVisual: React.FC<{ stateLabel: string; eligible: boolean }> = ({ stateLabel, eligible }) => {
  return (
    <div className="relative aspect-square w-full max-w-[280px] mx-auto">
      {/* Glow background */}
      <div className={`absolute inset-0 rounded-full blur-[60px] opacity-40 transition-colors duration-700 ${eligible ? 'bg-cc-lime' : 'bg-blue-500'}`} />

      {/* Outer ring */}
      <div className={`absolute inset-0 rounded-full border-2 border-white/20 p-2 ${eligible ? 'animate-spin-slow' : ''}`}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/40 rounded-full blur-sm" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/40 rounded-full blur-sm" />
      </div>

      {/* Main vault body */}
      <div className="absolute inset-[15px] rounded-full border border-white/10 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-xl shadow-2xl flex items-center justify-center">
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-transparent via-white/5 to-transparent ${eligible ? 'animate-pulse' : ''}`} />
        </div>

        {/* Center icon / status */}
        <div className="relative z-10 flex flex-col items-center">
          <div className={`mb-2 p-4 rounded-2xl bg-black/40 border border-white/10 ${eligible ? 'shadow-[0_0_20px_rgba(210,253,156,0.3)]' : ''}`}>
            <img
              src={eligible ? "/images/layer-3.svg" : "/images/coin.svg"}
              className={`h-12 w-12 ${eligible ? '' : 'grayscale opacity-50'}`}
              alt="Vault status"
            />
          </div>
          <p className={`text-sm font-black uppercase tracking-[0.3em] ${eligible ? 'text-cc-lime' : 'text-white/40'}`}>
            {stateLabel}
          </p>
        </div>

        {/* Mechanical details */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-3 bg-white/20 rounded-full"
            style={{ transform: `rotate(${i * 45}deg) translateY(-90px)` }}
          />
        ))}
      </div>
    </div>
  );
};

const VaultMainPanel: React.FC = () => {
  const [vaultModalOpen, setVaultModalOpen] = useState(false);

  const vault = useQuery({
    queryKey: ["vault-status"],
    queryFn: getVaultStatus,
    staleTime: 30_000,
    retry: false,
  });

  const ui = useQuery({
    queryKey: ["ui-config", "ticket_zero"],
    queryFn: () => getUiConfig("ticket_zero"),
    staleTime: 0,
  });

  const view = useMemo(() => {
    const data = vault.data;
    const vaultBalance = data?.vaultBalance ?? 0;
    const cashBalance = data?.cashBalance ?? 0;
    const eligible = !!data?.eligible;
    const expiresAt = parseDate(data?.expiresAt ?? null);
    const usedAt = parseDate(data?.vaultFillUsedAt ?? null);

    const statusLabel = vaultBalance > 0 ? (eligible ? "이용 가능" : "잠금") : "비어있음";
    const statusTone = eligible ? "text-cc-lime shadow-[0_0_10px_#d2fd9c44]" : "text-white/40";

    const unlockRulesJson = data?.unlockRulesJson;
    const accrualMultiplier = data?.accrualMultiplier ?? 1.0;
    const recommendedAction = data?.recommendedAction;
    const ctaPayload = data?.ctaPayload;

    return {
      vaultBalance,
      cashBalance,
      eligible,
      expiresAt,
      usedAt,
      statusLabel,
      statusTone,
      unlockRulesJson,
      accrualMultiplier,
      recommendedAction,
      ctaPayload,
      uiCopyJson: data?.uiCopyJson,
    };
  }, [vault.data]);

  useEffect(() => {
    if (view.recommendedAction === "OPEN_VAULT_MODAL" && !vaultModalOpen) {
      setVaultModalOpen(true);
    }
  }, [view.recommendedAction]);

  const unlockRules = useMemo(() => {
    const parsed = parseVaultUnlockRules(view.unlockRulesJson);
    if (parsed.length > 0) return parsed;
    return [
      "해금 조건: 게임 플레이를 통해 적립된 포인트 (적립형)",
      "비고: 이용 내역이 확인되면 자동으로 금고가 해금되어 보유 머니로 전환됩니다.",
      "문의: 해금이 지연될 경우 텔레그램 고객센터로 문의해주세요."
    ];
  }, [view.unlockRulesJson]);

  const rewardPreview = useMemo(() => {
    const value = ui.data?.value ?? null;
    const v = value as Record<string, unknown> | null;
    const rawItems: unknown[] | null = Array.isArray(v?.reward_preview_items)
      ? (v?.reward_preview_items as unknown[])
      : Array.isArray(v?.rewardPreviewItems)
        ? (v?.rewardPreviewItems as unknown[]) : null;

    const items: RewardPreviewItem[] | null = rawItems
      ? rawItems
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const r = item as Record<string, unknown>;
          if (!r.label) return null;
          return {
            label: String(r.label),
            amount: typeof r.amount === "number" ? r.amount : undefined,
            unit: typeof r.unit === "string" ? r.unit : undefined,
          };
        })
        .filter((i): i is RewardPreviewItem => i !== null)
      : null;

    const rawProgress = (v?.reward_preview_progress ?? v?.rewardPreviewProgress) as Record<string, unknown> | null;
    const currentPoints = (rawProgress?.current_points ?? rawProgress?.currentPoints ?? null) as number | null;
    const nextPoints = (rawProgress?.next_points ?? rawProgress?.nextPoints ?? null) as number | null;
    const unitLabel = (rawProgress?.unit_label ?? rawProgress?.unitLabel ?? "점") as string;

    const progress: RewardPreviewProgress | null = (currentPoints !== null && nextPoints !== null && nextPoints > 0) ? { currentPoints, nextPoints, unitLabel } : null;
    const percent = progress ? Math.max(0, Math.min(100, Math.round((progress.currentPoints / progress.nextPoints) * 100))) : null;

    return { items, progress, percent };
  }, [ui.data?.value]);

  return (
    <section className="mx-auto w-full max-w-[1100px] flex flex-col gap-10">
      {/* 1. Hero Header */}
      <div className="relative w-full rounded-[40px] overflow-hidden bg-gradient-to-br from-cc-olive to-cc-moss p-8 md:p-12 lg:p-16 border border-white/5 shadow-2xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-cc-lime/40 blur-[100px] rounded-full" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cc-lime/40 blur-[100px] rounded-full" />
        </div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="h-px w-8 bg-cc-lime/60" />
                <span className="text-cc-lime text-sm font-black tracking-widest uppercase">Safe & Digital Vault</span>
              </div>
              <h1 className="text-[48px] md:text-[64px] font-black leading-none text-white tracking-tighter">
                MY <span className="text-cc-lime">VAULT</span>
              </h1>
            </div>

            <div className="flex flex-wrap gap-4 items-center">
              {view.expiresAt && <CountdownTimer expiresAt={view.expiresAt} />}
              <div className={`px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm font-black tracking-wide ${view.eligible ? 'text-cc-lime border-cc-lime/30' : 'text-white/40'}`}>
                상태: {view.statusLabel}
              </div>
              {view.accrualMultiplier > 1 && (
                <div className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-black animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                  HOT {view.accrualMultiplier}배 적립
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 max-w-md">
              <p className="text-white/60 text-lg leading-relaxed">
                지민코드 활동을 통해 적립된 포인트가 안전하게 보관되어 있습니다. <br />
                <span className="text-white font-bold">이용 내역이 확인되면 즉시 해금되어 보유 머니로 전환됩니다.</span>
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setVaultModalOpen(true)}
                  className="px-8 py-4 bg-cc-lime text-black font-black text-sm rounded-2xl hover:bg-white transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-cc-lime/20"
                >
                  상세 정보 확인
                </button>
                <a
                  href="https://ccc-010.com"
                  target="_blank"
                  className="px-8 py-4 bg-white/10 text-white font-black text-sm rounded-2xl hover:bg-white/20 transition-all border border-white/10 backdrop-blur-md"
                >
                  CC카지노 바로가기
                </a>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <VaultVisual stateLabel={view.statusLabel} eligible={view.eligible} />
          </div>
        </div>
      </div>

      {/* 2. Balance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Locked Box */}
        <div className="relative group">
          <div className="absolute inset-0 bg-cc-lime/5 blur-xl group-hover:bg-cc-lime/10 transition-colors rounded-[32px]" />
          <div className="relative p-8 rounded-[32px] border border-white/5 bg-white/5 backdrop-blur-md overflow-hidden min-h-[180px] flex flex-col justify-between">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 opacity-10 group-hover:opacity-20 transition-opacity">
              <img src="/images/layer-2.svg" className="h-full w-full object-contain" alt="" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-white/40 text-sm font-black tracking-widest uppercase">잠금 포인트</p>
              <h3 className="text-cc-lime text-4xl font-black">{formatWon(view.vaultBalance)}</h3>
            </div>
            <p className="text-white/30 text-sm mt-4">해금 시 실시간으로 보유 머니에 합산됩니다.</p>
          </div>
        </div>

        {/* Cash Box */}
        <div className="relative group">
          <div className="absolute inset-0 bg-blue-500/5 blur-xl group-hover:bg-blue-500/10 transition-colors rounded-[32px]" />
          <div className="relative p-8 rounded-[32px] border border-white/5 bg-white/5 backdrop-blur-md overflow-hidden min-h-[180px] flex flex-col justify-between">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 opacity-10 group-hover:opacity-20 transition-opacity">
              <img src="/images/wallet.svg" className="h-full w-full object-contain invert brightness-200" alt="" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-white/40 text-sm font-black tracking-widest uppercase">보유 머니</p>
              <h3 className="text-white text-4xl font-black">{formatWon(view.cashBalance)}</h3>
            </div>
            <p className="text-white/30 text-sm mt-4">현재 적립된 금고 보유머니입니다.</p>
          </div>
        </div>
      </div>

      {/* 3. Reward Tracking & History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Rules & History */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="p-8 rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-md">
            <h4 className="text-white font-black text-lg mb-6 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-cc-lime rounded-full" />
              금고 이용 규칙
            </h4>
            <div className="grid gap-4">
              {unlockRules.map((rule, i) => (
                <div key={i} className="flex gap-4 items-start p-4 rounded-2xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-colors">
                  <div className="h-6 w-6 rounded-full bg-cc-lime/20 flex items-center justify-center text-cc-lime font-black text-sm shrink-0">
                    {i + 1}
                  </div>
                  <p className="text-white/70 text-sm leading-relaxed">{rule}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-md">
            <h4 className="text-white font-black text-lg mb-6 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-cc-lime rounded-full" />
              최근 활동
            </h4>
            <div className="flex flex-col gap-3">
              {view.eligible ? (
                <div className="flex items-center justify-between p-4 rounded-2xl bg-cc-lime/5 border border-cc-lime/20">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-cc-lime animate-pulse" />
                    <p className="text-white/90 text-sm font-bold">외부 이용 내역 확인 완료</p>
                  </div>
                  <span className="text-sm font-black text-cc-lime uppercase tracking-widest">Active</span>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-white/20" />
                    <p className="text-white/50 text-sm">외부 이용 내역 대기 중</p>
                  </div>
                  <span className="text-sm font-black text-white/20 uppercase tracking-widest">Idle</span>
                </div>
              )}
              {view.usedAt && (
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                  <p className="text-white/70 text-sm">금고 채우기 사용</p>
                  <p className="text-white/40 text-sm font-mono">{formatDateTime(view.usedAt)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Reward Preview */}
        <div className="lg:col-span-1">
          <div className="p-1 rounded-[34px] bg-gradient-to-b from-cc-lime/30 to-transparent">
            <div className="p-8 rounded-[32px] bg-[#111] h-full flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <p className="text-cc-lime text-sm font-black tracking-widest uppercase">진행 현황</p>
                <h4 className="text-white font-black text-lg">보상 미리보기</h4>
              </div>

              {rewardPreview.items && rewardPreview.items.length > 0 ? (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-white/40 text-sm font-black uppercase tracking-widest">달성률</span>
                      <span className="text-cc-lime text-lg font-black">{rewardPreview.percent}%</span>
                    </div>
                    <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-cc-lime shadow-[0_0_15px_#d2fd9c88]" style={{ width: `${rewardPreview.percent}%` }} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {rewardPreview.items.map((item, idx) => (
                      <div key={idx} className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/5">
                        <p className="text-white/60 text-sm font-black uppercase tracking-tighter">{item.label}</p>
                        <p className="text-white text-xl font-black">
                          {item.amount?.toLocaleString()} <span className="text-sm text-white/30">{item.unit || 'PT'}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5 grayscale opacity-20">
                    <img src="/images/layer-2.svg" className="h-10 w-10" alt="" />
                  </div>
                  <p className="text-white/30 text-sm font-bold">표시할 보상이 없습니다.</p>
                </div>
              )}

              <div className="mt-auto pt-6 border-t border-white/10">
                <p className="text-sm text-white/40 leading-relaxed text-center">
                  활동 조건 충족 시 포인트 적립과 <br />
                  해금이 순차적으로 진행됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <VaultModal
        open={vaultModalOpen}
        onClose={() => setVaultModalOpen(false)}
        ctaPayload={view.ctaPayload}
        unlockRulesJson={view.unlockRulesJson}
      />
    </section>
  );
};

export default VaultMainPanel;

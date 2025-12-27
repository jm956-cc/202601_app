import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    getVaultDefaultProgram,
    getVaultStats,
    updateVaultUnlockRules,
    updateVaultUiCopy,
    updateVaultConfig,
    tickVaultTransitions,
    toggleVaultGameEarn,
    getVaultEligibility,
    setVaultEligibility,
    getVaultTimerState,
    postVaultTimerAction,
    VaultTimerState
} from "../api/adminVaultApi";
import { RefreshCcw, Save, AlertTriangle, ShieldCheck, Clock, Power, Search, Ban } from "lucide-react";
import VaultRulesEditor from "../components/vault/VaultRulesEditor";
import VaultUiEditor from "../components/vault/VaultUiEditor";
import VaultSettingsEditor from "../components/vault/VaultSettingsEditor";

const VaultAdminPage: React.FC = () => {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<"stats" | "rules" | "copy" | "config" | "ops">("stats");
    const [advancedMode, setAdvancedMode] = useState(false);
    const [gameEarnEnabled, setGameEarnEnabled] = useState<boolean>(true);
    const [eligibilityUserId, setEligibilityUserId] = useState<string>("");
    const [eligibilityResult, setEligibilityResult] = useState<{ user_id: number; eligible: boolean } | null>(null);
    const [timerUserId, setTimerUserId] = useState<string>("");
    const [timerState, setTimerState] = useState<VaultTimerState | null>(null);

    const { data: program } = useQuery({
        queryKey: ["admin", "vault", "program"],
        queryFn: getVaultDefaultProgram,
    });

    const { data: stats } = useQuery({
        queryKey: ["admin", "vault", "stats"],
        queryFn: getVaultStats,
        refetchInterval: 30000,
    });

    const mutation = useMutation({
        mutationFn: async ({ type, json }: { type: string; json: any }) => {
            if (!program) return;
            if (type === "rules") return updateVaultUnlockRules(program.key, json);
            if (type === "copy") return updateVaultUiCopy(program.key, json);
            if (type === "config") return updateVaultConfig(program.key, json);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "vault", "program"] });
            alert("변경사항이 저장되었습니다.");
        },
        onError: (err: any) => {
            alert(`저장 실패: ${err.message}`);
        }
    });

    const tickMutation = useMutation({
        mutationFn: tickVaultTransitions,
        onSuccess: (data) => {
            alert(`${data.updated}개의 금고 상태가 갱신되었습니다.`);
            queryClient.invalidateQueries({ queryKey: ["admin", "vault", "stats"] });
        }
    });

    const [rulesDraft, setRulesDraft] = useState("");
    const [copyDraft, setCopyDraft] = useState("");
    const [configDraft, setConfigDraft] = useState("");

    const handleTabChange = (tab: "stats" | "rules" | "copy" | "config" | "ops") => {
        setActiveTab(tab);
        if (!program || tab === "stats" || tab === "ops") return;
        if (tab === "rules") setRulesDraft(JSON.stringify(program.unlock_rules_json || {}, null, 2));
        if (tab === "copy") setCopyDraft(JSON.stringify(program.ui_copy_json || {}, null, 2));
        if (tab === "config") setConfigDraft(JSON.stringify(program.config_json || {}, null, 2));
    };

    const saveJson = (type: "rules" | "copy" | "config") => {
        let raw = "";
        if (type === "rules") raw = rulesDraft;
        if (type === "copy") raw = copyDraft;
        if (type === "config") raw = configDraft;

        try {
            const json = JSON.parse(raw);
            mutation.mutate({ type, json });
        } catch (e) {
            alert("올바른 JSON 형식이 아닙니다.");
        }
    };

    useEffect(() => {
        if (program) {
            setGameEarnEnabled(Boolean(program.config_json?.enable_game_earn_events ?? true));
        }
    }, [program]);

    const gameEarnMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            if (!program) throw new Error("프로그램 정보가 없습니다.");
            return toggleVaultGameEarn(program.key, enabled);
        },
        onSuccess: (data) => {
            setGameEarnEnabled(Boolean(data.config_json?.enable_game_earn_events ?? true));
            queryClient.invalidateQueries({ queryKey: ["admin", "vault", "program"] });
            alert("게임 적립 토글이 저장되었습니다.");
        },
        onError: (err: any) => alert(`저장 실패: ${err.message}`)
    });

    const eligibilityLookup = useMutation({
        mutationFn: async (userId: number) => {
            if (!program) throw new Error("프로그램 정보가 없습니다.");
            return getVaultEligibility(program.key, userId);
        },
        onSuccess: (data) => setEligibilityResult(data),
        onError: (err: any) => alert(`조회 실패: ${err.message}`)
    });

    const eligibilityUpdate = useMutation({
        mutationFn: async (nextEligible: boolean) => {
            if (!program) throw new Error("프로그램 정보가 없습니다.");
            const userId = parseInt(eligibilityUserId || "0", 10);
            return setVaultEligibility(program.key, userId, nextEligible);
        },
        onSuccess: (data) => {
            setEligibilityResult(data);
            queryClient.invalidateQueries({ queryKey: ["admin", "vault", "program"] });
            alert("자격 설정이 저장되었습니다.");
        },
        onError: (err: any) => alert(`저장 실패: ${err.message}`)
    });

    const timerLookup = useMutation({
        mutationFn: async (userId: number) => getVaultTimerState(userId),
        onSuccess: (data) => setTimerState(data),
        onError: (err: any) => alert(`조회 실패: ${err.message}`)
    });

    const timerAction = useMutation({
        mutationFn: async ({ userId, action }: { userId: number; action: "reset" | "expire_now" | "start_now" }) =>
            postVaultTimerAction(userId, action),
        onSuccess: (data) => {
            setTimerState(data);
            alert("타이머가 반영되었습니다.");
        },
        onError: (err: any) => alert(`처리 실패: ${err.message}`)
    });

    return (
        <div className="space-y-6 pb-20">
            <header className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-[#91F402]">금고(Vault) 운영 관리</h2>
                    <p className="text-sm text-gray-400">Phase 1 적립/해금 정책 및 문구 관리</p>
                </div>
                <div className="flex items-center gap-3">
                    {!["stats", "ops"].includes(activeTab) && (
                        <button
                            onClick={() => setAdvancedMode(!advancedMode)}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${advancedMode ? "bg-[#91F402] text-black" : "bg-white/5 text-white/50 border border-white/10"
                                }`}
                        >
                            {advancedMode ? "일반 모드 (Form)" : "고급 모드 (JSON)"}
                        </button>
                    )}
                    <button
                        onClick={() => tickMutation.mutate()}
                        disabled={tickMutation.isPending}
                        className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                        <RefreshCcw className={`h-4 w-4 ${tickMutation.isPending ? "animate-spin" : ""}`} />
                        상태 강제 갱신
                    </button>
                </div>
            </header>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-[#333] bg-[#111] p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">오늘 총 적립</p>
                    <p className="text-xl font-black text-white">
                        {Object.values(stats?.today_accrual || {}).reduce((a, b: any) => a + b.count, 0).toLocaleString()}건
                    </p>
                </div>
                <div className="rounded-lg border border-[#333] bg-[#111] p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">오늘 해금액</p>
                    <p className="text-xl font-black text-[#91F402]">
                        {stats?.today_unlock_cash.toLocaleString()}원
                    </p>
                </div>
                <div className="rounded-lg border border-[#333] bg-[#111] p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">24H내 만료 예정</p>
                    <p className="text-xl font-black text-orange-400">
                        {stats?.expiring_soon_24h}명
                    </p>
                </div>
                <div className="rounded-lg border border-[#333] bg-[#111] p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">적립 누락(SKIP)</p>
                    <p className="text-xl font-black text-red-500">
                        {Object.values(stats?.today_skips || {}).reduce((a, b: any) => a + b, 0)}건
                    </p>
                </div>
            </div>

            <nav className="flex items-center gap-1 border-b border-[#333]">
                {[
                    { id: "stats", label: "실시간 지표" },
                    { id: "rules", label: "해금 규칙" },
                    { id: "copy", label: "UI 문구" },
                    { id: "config", label: "운영 파라미터" },
                    { id: "ops", label: "운영/통제" }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id as any)}
                        className={`px-6 py-3 text-sm font-bold transition-all relative ${activeTab === tab.id
                                ? "text-[#91F402]"
                                : "text-gray-500 hover:text-gray-300"
                            }`}
                    >
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#91F402]" />
                        )}
                    </button>
                ))}
            </nav>

            <div className="min-h-[400px]">
                {activeTab === "stats" && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="rounded-xl border border-[#333] bg-[#111] p-6 shadow-xl">
                            <h3 className="mb-4 font-bold text-white flex items-center gap-2">
                                <RefreshCcw className="h-4 w-4 text-[#91F402]" />
                                오늘 적립 상세 내역
                            </h3>
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="text-gray-500 border-b border-[#222]">
                                        <th className="pb-3 px-4">적립 사유</th>
                                        <th className="pb-3 px-4 text-right">트랜잭션</th>
                                        <th className="pb-3 px-4 text-right">누적 금액</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#222]">
                                    {Object.entries(stats?.today_accrual || {}).map(([type, s]: [string, any]) => (
                                        <tr key={type} className="group hover:bg-white/5 transition-colors">
                                            <td className="py-4 px-4 font-medium text-gray-300">{type}</td>
                                            <td className="py-4 px-4 text-right text-white font-bold">{s.count.toLocaleString()}건</td>
                                            <td className="py-4 px-4 text-right text-[#91F402] font-black">{s.total.toLocaleString()}원</td>
                                        </tr>
                                    ))}
                                    {Object.keys(stats?.today_accrual || {}).length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="py-12 text-center text-gray-600">오늘 발생한 적립 내역이 없습니다.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {Object.keys(stats?.today_skips || {}).length > 0 && (
                            <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-6">
                                <div className="flex items-center gap-2 text-red-500 mb-4">
                                    <AlertTriangle className="h-5 w-5" />
                                    <h3 className="font-extrabold">적립 누락 발생 (Valuation Missing)</h3>
                                </div>
                                <div className="space-y-2">
                                    {Object.entries(stats?.today_skips || {}).map(([src, count]: [string, any]) => (
                                        <div key={src} className="flex items-center justify-between text-sm py-2 px-4 rounded-lg bg-red-950/20 border border-red-900/20">
                                            <span className="text-red-300 font-bold">{src}</span>
                                            <span className="text-red-400 font-black">{count}건 적립 실패</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-4 text-xs text-red-400/70 text-center">"운영 파라미터" 탭에서 해당 보상의 가치(Valuation)를 설정해주세요.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab !== "stats" && activeTab !== "ops" && (
                    <div className="animate-in slide-in-from-bottom-2 duration-300">
                        {advancedMode ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-gray-400">
                                        JSON 형식을 지켜 입력해주세요.
                                    </p>
                                    <button
                                        onClick={() => saveJson(activeTab as any)}
                                        disabled={mutation.isPending}
                                        className="flex items-center gap-2 rounded-md bg-[#2D6B3B] px-4 py-2 text-sm font-bold text-white hover:bg-[#91F402] hover:text-black transition"
                                    >
                                        <Save className="h-4 w-4" />
                                        JSON 직접 저장
                                    </button>
                                </div>
                                <textarea
                                    className="h-[500px] w-full rounded-md border border-[#333] bg-[#0A0A0A] p-4 font-mono text-sm text-green-400 focus:outline-none focus:ring-1 focus:ring-[#91F402]"
                                    value={activeTab === "rules" ? rulesDraft : activeTab === "copy" ? copyDraft : configDraft}
                                    onChange={(e) => {
                                        if (activeTab === "rules") setRulesDraft(e.target.value);
                                        if (activeTab === "copy") setCopyDraft(e.target.value);
                                        if (activeTab === "config") setConfigDraft(e.target.value);
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="rounded-xl border border-[#333] bg-[#0f0f0f] p-8 shadow-2xl">
                                {program ? (
                                    <>
                                        {activeTab === "rules" && <VaultRulesEditor program={program} />}
                                        {activeTab === "copy" && <VaultUiEditor program={program} />}
                                        {activeTab === "config" && <VaultSettingsEditor program={program} />}
                                    </>
                                ) : (
                                    <div className="py-20 text-center text-gray-600">로딩 중...</div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "ops" && (
                    <div className="animate-in slide-in-from-bottom-2 duration-300 space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="rounded-xl border border-[#333] bg-[#111] p-6 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-1">Game Earn</p>
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <Power className="h-4 w-4 text-[#91F402]" />
                                            게임 적립 전역 토글
                                        </h3>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-[11px] font-black border ${gameEarnEnabled ? "bg-[#13240f] text-[#91F402] border-[#1f3e13]" : "bg-[#2a1616] text-red-400 border-red-900/50"}`}>
                                        {gameEarnEnabled ? "ON" : "OFF"}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    게임 플레이 적립을 강제로 중단하거나 재개합니다. DB 구성값을 즉시 반영합니다.
                                </p>
                                <button
                                    onClick={() => gameEarnMutation.mutate(!gameEarnEnabled)}
                                    disabled={gameEarnMutation.isPending}
                                    className="w-full rounded-md bg-[#2D6B3B] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#91F402] hover:text-black transition"
                                >
                                    {gameEarnEnabled ? "즉시 비활성화" : "즉시 활성화"}
                                </button>
                            </div>

                            <div className="lg:col-span-2 rounded-xl border border-[#333] bg-[#0f0f0f] p-6 space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-1">Eligibility</p>
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-amber-400" />
                                            유저 자격 조회/토글
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={eligibilityUserId}
                                            onChange={e => setEligibilityUserId(e.target.value)}
                                            placeholder="User ID"
                                            className="w-36 rounded-md border border-[#333] bg-[#0A0A0A] px-3 py-2 text-sm text-gray-200 focus:border-[#91F402] focus:outline-none"
                                        />
                                        <button
                                            onClick={() => {
                                                const uid = parseInt(eligibilityUserId || "0", 10);
                                                if (!uid) {
                                                    alert("유저 ID를 입력하세요.");
                                                    return;
                                                }
                                                eligibilityLookup.mutate(uid);
                                            }}
                                            disabled={eligibilityLookup.isPending}
                                            className="flex items-center gap-2 rounded-md bg-[#1f2a38] px-4 py-2 text-sm font-bold text-white hover:bg-[#2c3c54] transition"
                                        >
                                            <Search className="h-4 w-4" />
                                            자격 조회
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-[#222] bg-[#111] p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-gray-500">현재 상태</p>
                                        <p className="text-base font-bold text-white">
                                            {eligibilityResult ? (
                                                <span className={eligibilityResult.eligible ? "text-[#91F402]" : "text-red-400"}>
                                                    {eligibilityResult.eligible ? "허용" : "차단"}
                                                </span>
                                            ) : (
                                                <span className="text-gray-500">조회 전</span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                const uid = parseInt(eligibilityUserId || "0", 10);
                                                if (!uid) {
                                                    alert("유저 ID를 입력하세요.");
                                                    return;
                                                }
                                                const next = !(eligibilityResult?.eligible ?? false);
                                                eligibilityUpdate.mutate(next);
                                            }}
                                            disabled={eligibilityUpdate.isPending || !eligibilityUserId}
                                            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition ${eligibilityResult?.eligible ? "bg-[#331515] text-red-300 hover:bg-[#4a1f1f]" : "bg-[#1c3321] text-[#91F402] hover:bg-[#1f3f26]"}`}
                                        >
                                            {eligibilityResult?.eligible ? <Ban className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                            {eligibilityResult?.eligible ? "차단하기" : "허용하기"}
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">설정은 VaultProgram config의 allow/block 리스트를 즉시 갱신합니다.</p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-[#333] bg-[#0f0f0f] p-6 space-y-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-1">Timer Control</p>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-blue-300" />
                                        잠금 타이머 제어
                                    </h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={timerUserId}
                                        onChange={e => setTimerUserId(e.target.value)}
                                        placeholder="User ID"
                                        className="w-36 rounded-md border border-[#333] bg-[#0A0A0A] px-3 py-2 text-sm text-gray-200 focus:border-[#91F402] focus:outline-none"
                                    />
                                    <button
                                        onClick={() => {
                                            const uid = parseInt(timerUserId || "0", 10);
                                            if (!uid) {
                                                alert("유저 ID를 입력하세요.");
                                                return;
                                            }
                                            timerLookup.mutate(uid);
                                        }}
                                        disabled={timerLookup.isPending}
                                        className="flex items-center gap-2 rounded-md bg-[#1f2a38] px-4 py-2 text-sm font-bold text-white hover:bg-[#2c3c54] transition"
                                    >
                                        <Search className="h-4 w-4" />
                                        상태 조회
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="rounded-lg border border-[#222] bg-[#111] p-4">
                                    <p className="text-xs text-gray-500 mb-1">Eligibility</p>
                                    <p className={`text-base font-black ${timerState ? (timerState.eligible ? "text-[#91F402]" : "text-red-400") : "text-gray-500"}`}>
                                        {timerState ? (timerState.eligible ? "허용" : "차단") : "조회 전"}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-1">Program: {timerState?.program_key || "NEW_MEMBER_VAULT"}</p>
                                </div>
                                <div className="rounded-lg border border-[#222] bg-[#111] p-4">
                                    <p className="text-xs text-gray-500 mb-1">Locked Balance</p>
                                    <p className="text-2xl font-black text-white">{(timerState?.locked_balance ?? 0).toLocaleString()}원</p>
                                </div>
                                <div className="rounded-lg border border-[#222] bg-[#111] p-4">
                                    <p className="text-xs text-gray-500 mb-1">Available Balance</p>
                                    <p className="text-2xl font-black text-white">{(timerState?.available_balance ?? 0).toLocaleString()}원</p>
                                </div>
                                <div className="rounded-lg border border-[#222] bg-[#111] p-4">
                                    <p className="text-xs text-gray-500 mb-1">Cash Balance</p>
                                    <p className="text-2xl font-black text-white">{(timerState?.cash_balance ?? 0).toLocaleString()}원</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="rounded-lg border border-[#222] bg-[#111] p-4">
                                    <p className="text-xs text-gray-500 mb-1">Vault Balance (Mirror)</p>
                                    <p className="text-2xl font-black text-white">{(timerState?.vault_balance ?? 0).toLocaleString()}원</p>
                                </div>
                                <div className="rounded-lg border border-[#222] bg-[#111] p-4">
                                    <p className="text-xs text-gray-500 mb-1">Accrual Multiplier</p>
                                    <p className="text-xl font-black text-white">{timerState?.accrual_multiplier ?? "조회 전"}</p>
                                </div>
                                <div className="rounded-lg border border-[#222] bg-[#111] p-4">
                                    <p className="text-xs text-gray-500 mb-1">만료 예정 시각</p>
                                    <p className="text-base font-bold text-white">{timerState?.locked_expires_at || timerState?.expires_at || "미설정"}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button
                                    onClick={() => {
                                        const uid = parseInt(timerUserId || "0", 10);
                                        if (!uid) return alert("유저 ID를 입력하세요.");
                                        timerAction.mutate({ userId: uid, action: "start_now" });
                                    }}
                                    disabled={timerAction.isPending || !timerUserId}
                                    className="rounded-md bg-[#1c3321] px-4 py-3 text-sm font-bold text-[#91F402] hover:bg-[#1f3f26] transition"
                                >
                                    타이머 재시작 (24h)
                                </button>
                                <button
                                    onClick={() => {
                                        const uid = parseInt(timerUserId || "0", 10);
                                        if (!uid) return alert("유저 ID를 입력하세요.");
                                        timerAction.mutate({ userId: uid, action: "reset" });
                                    }}
                                    disabled={timerAction.isPending || !timerUserId}
                                    className="rounded-md bg-[#1f2a38] px-4 py-3 text-sm font-bold text-white hover:bg-[#2c3c54] transition"
                                >
                                    타이머 초기화
                                </button>
                                <button
                                    onClick={() => {
                                        const uid = parseInt(timerUserId || "0", 10);
                                        if (!uid) return alert("유저 ID를 입력하세요.");
                                        timerAction.mutate({ userId: uid, action: "expire_now" });
                                    }}
                                    disabled={timerAction.isPending || !timerUserId}
                                    className="rounded-md bg-[#331515] px-4 py-3 text-sm font-bold text-red-300 hover:bg-[#4a1f1f] transition"
                                >
                                    즉시 만료 처리
                                </button>
                            </div>
                            <p className="text-xs text-gray-500">잠금 잔액을 유지한 채 만료 시각만 설정하거나, 즉시 소멸 처리할 수 있습니다.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VaultAdminPage;

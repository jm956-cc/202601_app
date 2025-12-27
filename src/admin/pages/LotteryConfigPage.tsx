// src/admin/pages/LotteryConfigPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Trash2, X } from "lucide-react";
import {
  AdminLotteryConfig,
  AdminLotteryConfigPayload,
  createLotteryConfig,
  fetchLotteryConfigs,
  updateLotteryConfig,
} from "../api/adminLotteryApi";
import { REWARD_TYPES } from "../constants/rewardTypes";
import { useToast } from "../../components/common/ToastProvider";

const normalizeStock = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const prizeSchema = z.object({
  label: z.string().min(1, "상품명을 입력하세요"),
  weight: z.number().int().nonnegative("가중치는 0 이상"),
  stock: z.preprocess(normalizeStock, z.number().int().nonnegative("재고는 0 이상").nullable()),
  reward_type: z.string().min(1, "보상 타입을 선택하세요"),
  reward_value: z.number().int().nonnegative("보상 값은 0 이상"),
  is_active: z.boolean().default(true),
});

const lotterySchema = z
  .object({
    name: z.string().min(1, "이름을 입력하세요"),
    is_active: z.boolean().default(false),
    max_daily_plays: z.number().int().nonnegative("0이면 무제한"),
    prizes: z.array(prizeSchema).min(1, "상품을 1개 이상 추가하세요"),
  })
  .refine((value) => {
    const labels = value.prizes.map((p) => p.label.trim());
    return new Set(labels).size === labels.length;
  }, {
    message: "상품명은 중복될 수 없습니다",
    path: ["prizes"],
  })
  .refine((value) => value.prizes.some((p) => p.is_active && p.weight > 0), {
    message: "활성 상품 중 가중치가 0보다 큰 항목이 1개 이상 필요합니다",
    path: ["prizes"],
  })
  .refine((value) => value.prizes.reduce((sum, p) => sum + p.weight, 0) > 0, {
    message: "전체 가중치 합이 0보다 커야 합니다",
    path: ["prizes"],
  });

type LotteryFormValues = z.infer<typeof lotterySchema>;

const mapErrorDetail = (error: unknown): string => {
  const detail = (error as any)?.response?.data?.detail;
  if (typeof detail === "string") {
    const map: Record<string, string> = {
      LOTTERY_CONFIG_NOT_FOUND: "복권 설정을 찾을 수 없습니다.",
      INVALID_LOTTERY_WEIGHT: "가중치는 0 이상이어야 합니다.",
      INVALID_LOTTERY_STOCK: "재고는 0 이상 또는 비워두세요.",
      DUPLICATE_PRIZE_LABEL: "상품명이 중복되었습니다.",
      NO_ACTIVE_PRIZE: "활성 상품(가중치>0)이 1개 이상 필요합니다.",
      ZERO_TOTAL_WEIGHT: "전체 가중치 합이 0보다 커야 합니다.",
      INVALID_LOTTERY_CONFIG: "복권 설정 값이 올바르지 않습니다.",
    };
    return map[detail] ?? detail;
  }
  return (error as any)?.message ?? "요청 처리 중 오류가 발생했습니다.";
};

const LotteryConfigPage: React.FC = () => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminLotteryConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "lottery"],
    queryFn: fetchLotteryConfigs,
  });

  const initialValues = useMemo<LotteryFormValues>(
    () => ({
      name: "",
      is_active: false,
      max_daily_plays: 0,
      prizes: [
        {
          label: "",
          weight: 0,
          stock: null,
          reward_type: "POINT",
          reward_value: 0,
          is_active: true,
        },
      ],
    }),
    []
  );

  const form = useForm<LotteryFormValues>({
    resolver: zodResolver(lotterySchema),
    defaultValues: initialValues,
  });

  const prizes = useFieldArray({
    control: form.control,
    name: "prizes",
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    form.reset(initialValues);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isModalOpen) return;
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  const mutation = useMutation({
    mutationFn: (payload: AdminLotteryConfigPayload) =>
      editing ? updateLotteryConfig(editing.id, payload) : createLotteryConfig(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "lottery"] });
      addToast("저장 완료", "success");
      closeModal();
    },
    onError: (err) => {
      addToast(mapErrorDetail(err), "error");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setIsModalOpen(true);
    form.reset(initialValues);
  };

  const openEdit = (config: AdminLotteryConfig) => {
    setEditing(config);
    setIsModalOpen(true);
    form.reset({
      name: config.name,
      is_active: config.is_active,
      max_daily_plays: config.max_daily_plays,
      prizes: config.prizes.map((p) => ({
        id: p.id,
        label: p.label,
        weight: p.weight,
        stock: p.stock ?? null,
        reward_type: p.reward_type,
        reward_value: p.reward_value,
        is_active: p.is_active,
      })) as any,
    });
  };

  const onSubmit = form.handleSubmit((values) => {
    const payload: AdminLotteryConfigPayload = {
      name: values.name.trim(),
      is_active: values.is_active,
      max_daily_plays: values.max_daily_plays,
      prizes: values.prizes.map((p: any) => ({
        ...p,
        label: String(p.label ?? "").trim(),
        stock: normalizeStock(p.stock),
      })),
    };
    mutation.mutate(payload);
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#91F402]">복권 설정</h2>
          <p className="mt-1 text-sm text-gray-400">상품/가중치/재고를 설정하고, 활성 상품(가중치&gt;0)을 최소 1개 유지하세요.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center rounded-md bg-[#2D6B3B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#91F402] hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#91F402]"
        >
          <Plus size={18} className="mr-2" />
          새 항목 추가
        </button>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-[#333333] bg-[#111111] p-4 text-gray-200">불러오는 중...</div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-500/40 bg-red-950 p-4 text-red-100">{mapErrorDetail(error)}</div>
      )}

      {!isLoading && !isError && (
        <div className="rounded-lg border border-[#333333] bg-[#111111] shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[#333333] bg-[#1A1A1A]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">일일 제한</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">상품 수</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#91F402]">기능</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {(data ?? []).map((config) => (
                  <tr key={config.id} className="hover:bg-[#1A1A1A]">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">{config.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                      {config.max_daily_plays === 0 ? "무제한" : config.max_daily_plays.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">{config.prizes.length.toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                          config.is_active ? "border-[#2D6B3B] text-[#91F402]" : "border-[#333333] text-gray-400"
                        }`}
                      >
                        {config.is_active ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => openEdit(config)}
                        className="text-[#91F402] hover:text-white"
                        title="수정"
                        aria-label="복권 설정 수정"
                      >
                        <Edit size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(data ?? []).length === 0 && (
            <div className="py-8 text-center text-gray-400">데이터가 없습니다. 새 항목을 추가해보세요.</div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-70 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)] sm:items-center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-5xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-[#333333] bg-[#111111] shadow-xl sm:max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#333333] bg-[#2D6B3B] p-4 sm:p-6">
              <h3 className="text-xl font-bold text-white">{editing ? "복권 설정 수정" : "복권 설정 추가"}</h3>
              <button type="button" onClick={closeModal} className="text-white hover:text-[#91F402]" aria-label="닫기">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 bg-[#0A0A0A] p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="lottery_name" className="text-sm text-gray-200">이름</label>
                  <input
                    id="lottery_name"
                    type="text"
                    className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name?.message && <p className="text-sm text-red-300">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <label htmlFor="lottery_max" className="text-sm text-gray-200">일일 최대 플레이 (0=무제한)</label>
                  <input
                    id="lottery_max"
                    type="number"
                    className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                    {...form.register("max_daily_plays", { valueAsNumber: true })}
                  />
                  {form.formState.errors.max_daily_plays?.message && (
                    <p className="text-sm text-red-300">{form.formState.errors.max_daily_plays.message}</p>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#333333] bg-[#1A1A1A] text-[#91F402] focus:ring-[#2D6B3B]"
                  {...form.register("is_active")}
                />
                활성
              </label>

              <div className="space-y-3 rounded-lg border border-[#333333] bg-[#111111] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#91F402]">상품 목록</h4>
                  <button
                    type="button"
                    onClick={() =>
                      prizes.append({
                        label: "",
                        weight: 0,
                        stock: null,
                        reward_type: "POINT",
                        reward_value: 0,
                        is_active: true,
                      } as any)
                    }
                    className="flex items-center rounded-md bg-[#2D6B3B] px-3 py-2 text-sm text-white hover:bg-[#91F402] hover:text-black"
                  >
                    <Plus size={16} className="mr-2" />
                    행 추가
                  </button>
                </div>

                {form.formState.errors.prizes?.message && (
                  <p className="text-sm text-red-300">{form.formState.errors.prizes.message as string}</p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-[#333333] bg-[#1A1A1A]">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">상품명</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">가중치</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">재고</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">보상 타입</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">보상 값</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">활성</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[#91F402]">삭제</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#333333]">
                      {prizes.fields.map((field, idx) => (
                        <tr key={field.id} className="hover:bg-[#1A1A1A]">
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full rounded-md border border-[#333333] bg-[#111111] px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                              {...form.register(`prizes.${idx}.label`)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              className="w-full rounded-md border border-[#333333] bg-[#111111] px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                              {...form.register(`prizes.${idx}.weight`, { valueAsNumber: true })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              placeholder="빈칸=무제한"
                              className="w-full rounded-md border border-[#333333] bg-[#111111] px-2 py-1 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                              {...form.register(`prizes.${idx}.stock` as any, { valueAsNumber: true })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="w-full rounded-md border border-[#333333] bg-[#111111] px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                              {...form.register(`prizes.${idx}.reward_type`)}
                            >
                              {REWARD_TYPES.map((rt) => (
                                <option key={rt.value} value={rt.value}>
                                  {rt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              className="w-full rounded-md border border-[#333333] bg-[#111111] px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                              {...form.register(`prizes.${idx}.reward_value`, { valueAsNumber: true })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-[#333333] bg-[#111111] text-[#91F402] focus:ring-[#2D6B3B]"
                              {...form.register(`prizes.${idx}.is_active`)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => prizes.remove(idx)}
                              className="text-red-400 hover:text-red-200"
                              aria-label="상품 삭제"
                              title="삭제"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-[#333333] bg-[#111111] px-4 py-2 text-sm text-gray-200 hover:bg-[#1A1A1A]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="rounded-md bg-[#2D6B3B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#91F402] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mutation.isPending ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default LotteryConfigPage;

// src/admin/pages/RouletteConfigPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Trash2, X } from "lucide-react";
import {
  AdminRouletteConfig,
  AdminRouletteConfigPayload,
  createRouletteConfig,
  deleteRouletteConfig,
  fetchRouletteConfigs,
  updateRouletteConfig,
} from "../api/adminRouletteApi";
import { REWARD_TYPES } from "../constants/rewardTypes";
import { useToast } from "../../components/common/ToastProvider";

const segmentSchema = z.object({
  label: z.string().min(1, "라벨을 입력하세요"),
  weight: z.number().int().nonnegative("가중치는 0 이상"),
  reward_type: z.string().min(1, "보상 타입을 선택하세요"),
  reward_value: z.number().int().nonnegative("보상 값은 0 이상"),
});

const rouletteSchema = z
  .object({
    name: z.string().min(1, "이름을 입력하세요"),
    is_active: z.boolean().default(false),
    max_daily_spins: z.number().int().nonnegative("0이면 무제한"),
    segments: z.array(segmentSchema).length(6, "세그먼트는 6개가 필요합니다"),
  })
  .refine((value) => value.segments.reduce((sum, seg) => sum + seg.weight, 0) > 0, {
    message: "가중치 합이 0보다 커야 합니다",
    path: ["segments"],
  });

type RouletteFormValues = z.infer<typeof rouletteSchema>;

const buildDefaultSegments = (): RouletteFormValues["segments"] =>
  Array.from({ length: 6 }).map((_, idx) => ({
    label: `슬롯 ${idx + 1}`,
    weight: 1,
    reward_type: "POINT",
    reward_value: 0,
  }));

const normalizeToSixSegments = (segments: Array<Partial<RouletteFormValues["segments"][number]>>): RouletteFormValues["segments"] => {
  const base = buildDefaultSegments();
  return Array.from({ length: 6 }).map((_, idx) => ({
    ...base[idx],
    ...(segments[idx] ?? {}),
  }));
};

const mapErrorDetail = (error: unknown): string => {
  const detail = (error as any)?.response?.data?.detail;
  if (typeof detail === "string") {
    const map: Record<string, string> = {
      INVALID_ROULETTE_CONFIG: "룰렛 설정 값이 올바르지 않습니다.",
      ROULETTE_CONFIG_NOT_FOUND: "룰렛 설정을 찾을 수 없습니다.",
    };
    return map[detail] ?? detail;
  }
  return (error as any)?.message ?? "요청 처리 중 오류가 발생했습니다.";
};

const RouletteConfigPage: React.FC = () => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminRouletteConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "roulette"],
    queryFn: fetchRouletteConfigs,
  });

  const initialValues = useMemo<RouletteFormValues>(
    () => ({
      name: "",
      is_active: false,
      max_daily_spins: 0,
      segments: buildDefaultSegments(),
    }),
    []
  );

  const form = useForm<RouletteFormValues>({
    resolver: zodResolver(rouletteSchema),
    defaultValues: initialValues,
  });

  const segments = useFieldArray({ control: form.control, name: "segments" });

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
    mutationFn: (payload: AdminRouletteConfigPayload) =>
      editing ? updateRouletteConfig(editing.id, payload) : createRouletteConfig(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "roulette"] });
      addToast("저장 완료", "success");
      closeModal();
    },
    onError: (err) => {
      addToast(mapErrorDetail(err), "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRouletteConfig(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "roulette"] });
      addToast("삭제 완료", "success");
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

  const openEdit = (config: AdminRouletteConfig) => {
    setEditing(config);
    setIsModalOpen(true);

    const sorted = [...(config.segments ?? [])].sort((a, b) => {
      const ai = (a as any).index ?? (a as any).slot_index ?? 0;
      const bi = (b as any).index ?? (b as any).slot_index ?? 0;
      return ai - bi;
    });

    form.reset({
      name: config.name,
      is_active: config.is_active,
      max_daily_spins: config.max_daily_spins,
      segments: normalizeToSixSegments(sorted as any),
    });
  };

  const onSubmit = form.handleSubmit((values) => {
    const payload: AdminRouletteConfigPayload = {
      name: values.name.trim(),
      is_active: values.is_active,
      max_daily_spins: values.max_daily_spins,
      segments: values.segments.map((seg, idx) => ({
        index: idx,
        label: seg.label.trim(),
        weight: seg.weight,
        reward_type: seg.reward_type,
        reward_value: seg.reward_value,
      })),
    };

    mutation.mutate(payload);
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#91F402]">룰렛 설정</h2>
          <p className="mt-1 text-sm text-gray-400">세그먼트/가중치/보상을 관리합니다.</p>
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
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">세그먼트</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#91F402]">기능</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {(data ?? []).map((config) => (
                  <tr key={config.id} className="hover:bg-[#1A1A1A]">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">{config.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                      {config.max_daily_spins === 0 ? "무제한" : config.max_daily_spins.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">{config.segments?.length ?? 0}</td>
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
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => openEdit(config)}
                          className="text-[#91F402] hover:text-white"
                          title="수정"
                          aria-label="룰렛 설정 수정"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          type="button"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (!window.confirm("이 설정을 삭제할까요?")) return;
                            deleteMutation.mutate(config.id);
                          }}
                          className="text-red-500 hover:text-red-300 disabled:opacity-60"
                          title="삭제"
                          aria-label="룰렛 설정 삭제"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
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
          <div className="w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-[#333333] bg-[#111111] shadow-xl sm:max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#333333] bg-[#2D6B3B] p-4 sm:p-6">
              <h3 className="text-xl font-bold text-white">{editing ? "룰렛 설정 수정" : "룰렛 설정 추가"}</h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-white hover:text-[#91F402]"
                aria-label="닫기"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 bg-[#0A0A0A] p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="roulette_name" className="text-sm text-gray-200">
                    이름
                  </label>
                  <input
                    id="roulette_name"
                    type="text"
                    className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                    placeholder="룰렛 이름"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name?.message && (
                    <p className="text-sm text-red-300">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="roulette_max" className="text-sm text-gray-200">
                    일일 최대 스핀 (0=무제한)
                  </label>
                  <input
                    id="roulette_max"
                    type="number"
                    className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                    {...form.register("max_daily_spins", { valueAsNumber: true })}
                  />
                  {form.formState.errors.max_daily_spins?.message && (
                    <p className="text-sm text-red-300">{form.formState.errors.max_daily_spins.message}</p>
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

              <div className="space-y-2">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#91F402]">세그먼트 (6개 고정)</h4>
                    <p className="mt-1 text-xs text-gray-400">가중치 합이 0보다 커야 합니다.</p>
                  </div>
                </div>

                {form.formState.errors.segments?.message && (
                  <p className="text-sm text-red-300">{form.formState.errors.segments.message as string}</p>
                )}

                <div className="rounded-lg border border-[#333333] bg-[#111111]">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-[#151515]">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">번호</th>
                          <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">라벨</th>
                          <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">가중치</th>
                          <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">보상 타입</th>
                          <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">보상 값</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#333333]">
                        {segments.fields.map((field, idx) => (
                          <tr key={field.id} className="align-top hover:bg-[#1A1A1A]">
                            <td className="px-3 py-3 text-sm text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                                {...form.register(`segments.${idx}.label`)}
                              />
                              {form.formState.errors.segments?.[idx]?.label?.message && (
                                <p className="mt-1 text-xs text-red-300">{form.formState.errors.segments[idx]?.label?.message}</p>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                                {...form.register(`segments.${idx}.weight`, { valueAsNumber: true })}
                              />
                              {form.formState.errors.segments?.[idx]?.weight?.message && (
                                <p className="mt-1 text-xs text-red-300">{form.formState.errors.segments[idx]?.weight?.message}</p>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                                {...form.register(`segments.${idx}.reward_type`)}
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
                                className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                                {...form.register(`segments.${idx}.reward_value`, { valueAsNumber: true })}
                              />
                              {form.formState.errors.segments?.[idx]?.reward_value?.message && (
                                <p className="mt-1 text-xs text-red-300">{form.formState.errors.segments[idx]?.reward_value?.message}</p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

export default RouletteConfigPage;

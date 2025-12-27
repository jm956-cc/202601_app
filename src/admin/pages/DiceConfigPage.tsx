// src/admin/pages/DiceConfigPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, X } from "lucide-react";
import {
  AdminDiceConfig,
  AdminDiceConfigPayload,
  createDiceConfig,
  fetchDiceConfigs,
  updateDiceConfig,
} from "../api/adminDiceApi";
import { REWARD_TYPES } from "../constants/rewardTypes";
import { useToast } from "../../components/common/ToastProvider";

const diceSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요"),
  is_active: z.boolean().default(false),
  max_daily_plays: z.number().int().nonnegative("0이면 무제한"),
  win_reward_type: z.string().min(1, "승리 보상 타입을 선택하세요"),
  win_reward_value: z.number().int().nonnegative("승리 보상 값은 0 이상"),
  draw_reward_type: z.string().min(1, "무승부 보상 타입을 선택하세요"),
  draw_reward_value: z.number().int().nonnegative("무승부 보상 값은 0 이상"),
  lose_reward_type: z.string().min(1, "패배 보상 타입을 선택하세요"),
  lose_reward_value: z.number().int().nonnegative("패배 보상 값은 0 이상"),
});

type DiceFormValues = z.infer<typeof diceSchema>;

const mapErrorDetail = (error: unknown): string => {
  const detail = (error as any)?.response?.data?.detail;
  if (typeof detail === "string") {
    const map: Record<string, string> = {
      INVALID_MAX_DAILY_PLAYS: "일일 최대 플레이 값이 올바르지 않습니다.",
      DICE_CONFIG_NOT_FOUND: "주사위 설정을 찾을 수 없습니다.",
    };
    return map[detail] ?? detail;
  }
  return (error as any)?.message ?? "요청 처리 중 오류가 발생했습니다.";
};

const DiceConfigPage: React.FC = () => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminDiceConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "dice"],
    queryFn: fetchDiceConfigs,
  });

  const initialValues = useMemo<DiceFormValues>(
    () => ({
      name: "",
      is_active: false,
      max_daily_plays: 0,
      win_reward_type: "POINT",
      win_reward_value: 0,
      draw_reward_type: "POINT",
      draw_reward_value: 0,
      lose_reward_type: "POINT",
      lose_reward_value: 0,
    }),
    []
  );

  const form = useForm<DiceFormValues>({
    resolver: zodResolver(diceSchema),
    defaultValues: initialValues,
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
    mutationFn: (payload: AdminDiceConfigPayload) =>
      editing ? updateDiceConfig(editing.id, payload) : createDiceConfig(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "dice"] });
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

  const openEdit = (config: AdminDiceConfig) => {
    setEditing(config);
    setIsModalOpen(true);
    form.reset({
      name: config.name,
      is_active: config.is_active,
      max_daily_plays: config.max_daily_plays,
      win_reward_type: config.win_reward_type,
      win_reward_value: config.win_reward_value,
      draw_reward_type: config.draw_reward_type,
      draw_reward_value: config.draw_reward_value,
      lose_reward_type: config.lose_reward_type,
      lose_reward_value: config.lose_reward_value,
    });
  };

  const onSubmit = form.handleSubmit((values) => {
    const payload: AdminDiceConfigPayload = {
      name: values.name.trim(),
      is_active: values.is_active,
      max_daily_plays: values.max_daily_plays,
      win_reward_type: values.win_reward_type,
      win_reward_value: values.win_reward_value,
      draw_reward_type: values.draw_reward_type,
      draw_reward_value: values.draw_reward_value,
      lose_reward_type: values.lose_reward_type,
      lose_reward_value: values.lose_reward_value,
    };
    mutation.mutate(payload);
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#91F402]">주사위 설정</h2>
          <p className="mt-1 text-sm text-gray-400">일일 제한과 승/무/패 보상을 관리합니다.</p>
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
                        aria-label="주사위 설정 수정"
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
          <div className="w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-[#333333] bg-[#111111] shadow-xl sm:max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#333333] bg-[#2D6B3B] p-4 sm:p-6">
              <h3 className="text-xl font-bold text-white">{editing ? "주사위 설정 수정" : "주사위 설정 추가"}</h3>
              <button type="button" onClick={closeModal} className="text-white hover:text-[#91F402]" aria-label="닫기">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 bg-[#0A0A0A] p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="dice_name" className="text-sm text-gray-200">이름</label>
                  <input
                    id="dice_name"
                    type="text"
                    className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name?.message && <p className="text-sm text-red-300">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <label htmlFor="dice_max" className="text-sm text-gray-200">일일 최대 플레이 (0=무제한)</label>
                  <input
                    id="dice_max"
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {([
                  { key: "win", title: "승리" },
                  { key: "draw", title: "무승부" },
                  { key: "lose", title: "패배" },
                ] as const).map((group) => (
                  <div key={group.key} className="rounded-lg border border-[#333333] bg-[#111111] p-4">
                    <h4 className="text-sm font-semibold text-[#91F402]">{group.title}</h4>
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs text-gray-300">보상 타입</label>
                        <select
                          className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                          {...form.register(`${group.key}_reward_type`)}
                        >
                          {REWARD_TYPES.map((rt) => (
                            <option key={rt.value} value={rt.value}>
                              {rt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-300">보상 값</label>
                        <input
                          type="number"
                          className="w-full rounded-md border border-[#333333] bg-[#1A1A1A] p-2 text-white focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]"
                          {...form.register(`${group.key}_reward_value`, { valueAsNumber: true })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
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

export default DiceConfigPage;

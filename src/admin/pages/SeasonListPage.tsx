// src/admin/pages/SeasonListPage.tsx
import React, { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  AdminSeason,
  AdminSeasonListResponse,
  AdminSeasonPayload,
  fetchSeasons,
  createSeason,
  updateSeason,
} from "../api/adminSeasonApi";

const seasonSchema = z
  .object({
    name: z.string().min(1, "이름은 필수입니다"),
    start_date: z.string().min(1, "시작일을 입력하세요"),
    end_date: z.string().min(1, "종료일을 입력하세요"),
    max_level: z.number().int().positive("최대 레벨은 1 이상"),
    base_xp_per_stamp: z.number().int().positive("스탬프당 XP는 1 이상"),
    is_active: z.boolean().default(true),
  })
  .refine((value) => new Date(value.start_date) <= new Date(value.end_date), {
    message: "종료일은 시작일 이후여야 합니다",
    path: ["end_date"],
  });

type SeasonFormValues = z.infer<typeof seasonSchema>;

const SeasonListPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [size] = useState(10);
  const [editingSeason, setEditingSeason] = useState<AdminSeason | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<AdminSeasonListResponse>({
    queryKey: ["admin", "seasons", page, size],
    queryFn: () => fetchSeasons({ page, size }),
    placeholderData: (prev) => prev ?? undefined,
  });

  const defaultValues = useMemo<SeasonFormValues>(
    () =>
      editingSeason
        ? {
            name: editingSeason.name,
            start_date: editingSeason.start_date,
            end_date: editingSeason.end_date,
            max_level: editingSeason.max_level,
            base_xp_per_stamp: editingSeason.base_xp_per_stamp,
            is_active: editingSeason.is_active,
          }
        : {
            name: "",
            start_date: "",
            end_date: "",
            max_level: 30,
            base_xp_per_stamp: 10,
            is_active: true,
          },
    [editingSeason]
  );

  const form = useForm<SeasonFormValues>({
    resolver: zodResolver(seasonSchema),
    defaultValues,
    mode: "onChange",
  });

  const resetAndClose = () => {
    setIsModalOpen(false);
    setEditingSeason(null);
    form.reset(defaultValues);
  };

  const mutation = useMutation({
    mutationFn: (payload: AdminSeasonPayload) =>
      editingSeason ? updateSeason(editingSeason.id, payload) : createSeason(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "seasons"] });
      resetAndClose();
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate(values);
  });

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.size));
  }, [data]);

  const startIndex = useMemo(() => {
    if (!data || data.total === 0) return 0;
    return (data.page - 1) * data.size + 1;
  }, [data]);

  const endIndex = useMemo(() => {
    if (!data || data.total === 0) return 0;
    return Math.min(data.page * data.size, data.total);
  }, [data]);

  const pageNumbers = useMemo(() => {
    if (!data) return [1];
    const currentPage = data.page;
    const pages = totalPages;
    const count = Math.min(5, pages);
    const startPage = pages <= 5 ? 1 : Math.max(1, Math.min(currentPage - 2, pages - 4));
    return Array.from({ length: count }, (_, i) => startPage + i);
  }, [data, totalPages]);

  const inputClass =
    "w-full rounded-md border border-[#333333] bg-[#1A1A1A] px-3 py-2 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#2D6B3B]";
  const labelClass = "text-sm font-medium text-gray-300";

  const PrimaryButton = ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button
      type="button"
      className="inline-flex items-center rounded-md bg-[#2D6B3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#91F402] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
      {...props}
    >
      {children}
    </button>
  );

  const SecondaryButton = ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button
      type="button"
      className="inline-flex items-center rounded-md border border-[#333333] bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-gray-200 hover:bg-[#2C2C2E] disabled:cursor-not-allowed disabled:opacity-60"
      {...props}
    >
      {children}
    </button>
  );

  const ModalShell = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)] sm:items-center">
      <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-[#333333] bg-[#111111] shadow-lg sm:max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-[#333333] px-6 py-4">
          <h3 className="text-lg font-medium text-[#91F402]">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-gray-300 hover:bg-[#1A1A1A]" aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#91F402]">시즌 설정</h2>
          <p className="mt-1 text-sm text-gray-400">시즌 생성/수정 및 상태 확인</p>
        </div>
        <PrimaryButton
          onClick={() => {
            setEditingSeason(null);
            form.reset(defaultValues);
            setIsModalOpen(true);
          }}
        >
          <Plus size={18} className="mr-2" />
          새 시즌 생성
        </PrimaryButton>
      </header>

      {isLoading && (
        <div className="rounded-lg border border-[#333333] bg-[#111111] p-4 text-gray-200">
          시즌 정보를 불러오는 중입니다...
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-500/40 bg-red-950 p-4 text-red-100">
          시즌 목록을 불러오지 못했습니다: {(error as Error).message}
        </div>
      )}

      {!isLoading && data && data.items.length === 0 && (
        <div className="rounded-lg border border-[#333333] bg-[#111111] p-4 text-gray-200">
          등록된 시즌이 없습니다. 새로운 시즌을 생성해 주세요.
        </div>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[#333333] bg-[#111111] shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1A1A1A] border-b border-[#333333]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">기간</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">최대 레벨</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">XP/스탬프</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">상태</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {data.items.map((season, idx) => (
                  <tr key={season.id} className={idx % 2 === 0 ? "bg-[#111111]" : "bg-[#1A1A1A]"}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">{season.name}</div>
                      <div className="text-xs text-gray-500">ID: {season.id}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                      {season.start_date} ~ {season.end_date}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{season.max_level}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{season.base_xp_per_stamp}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          season.is_active ? "bg-[#2D6B3B] text-[#91F402]" : "bg-red-900/60 text-red-200"
                        }`}
                      >
                        {season.is_active ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <SecondaryButton
                        onClick={() => {
                          setEditingSeason(season);
                          setIsModalOpen(true);
                          form.reset({
                            name: season.name,
                            start_date: season.start_date,
                            end_date: season.end_date,
                            max_level: season.max_level,
                            base_xp_per_stamp: season.base_xp_per_stamp,
                            is_active: season.is_active,
                          });
                        }}
                      >
                        수정
                      </SecondaryButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 bg-[#1A1A1A] border-t border-[#333333] sm:px-6 flex items-center justify-between">
              <div className="hidden sm:block">
                <p className="text-sm text-gray-400">
                  <span className="font-medium">{startIndex}</span>-<span className="font-medium">{endIndex}</span>/<span className="font-medium">{data.total}</span>
                </p>
              </div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-[#333333] ${
                    page <= 1 ? "bg-[#111111] text-gray-600 cursor-not-allowed" : "bg-[#1A1A1A] text-gray-300 hover:bg-[#2D6B3B]"
                  }`}
                >
                  <span className="sr-only">이전</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>

                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`relative inline-flex items-center px-4 py-2 border border-[#333333] text-sm font-medium ${
                      page === p ? "z-10 bg-[#2D6B3B] text-[#91F402]" : "bg-[#1A1A1A] text-gray-300 hover:bg-[#2C2C2E]"
                    }`}
                  >
                    {p}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-[#333333] ${
                    page >= totalPages
                      ? "bg-[#111111] text-gray-600 cursor-not-allowed"
                      : "bg-[#1A1A1A] text-gray-300 hover:bg-[#2D6B3B]"
                  }`}
                >
                  <span className="sr-only">다음</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <ModalShell title={editingSeason ? "시즌 수정" : "새 시즌 생성"} onClose={resetAndClose}>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className={labelClass}>이름</label>
              <input className={inputClass} {...form.register("name")} type="text" placeholder="시즌 이름" />
              {form.formState.errors.name && <p className="mt-2 text-sm text-red-300">{form.formState.errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>시작일</label>
                <input type="date" className={inputClass} {...form.register("start_date")} />
                {form.formState.errors.start_date && <p className="mt-2 text-sm text-red-300">{form.formState.errors.start_date.message}</p>}
              </div>
              <div>
                <label className={labelClass}>종료일</label>
                <input type="date" className={inputClass} {...form.register("end_date")} />
                {form.formState.errors.end_date && <p className="mt-2 text-sm text-red-300">{form.formState.errors.end_date.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>최대 레벨</label>
                <input type="number" className={inputClass} {...form.register("max_level", { valueAsNumber: true })} />
                {form.formState.errors.max_level && <p className="mt-2 text-sm text-red-300">{form.formState.errors.max_level.message}</p>}
              </div>
              <div>
                <label className={labelClass}>스탬프당 XP</label>
                <input
                  type="number"
                  className={inputClass}
                  {...form.register("base_xp_per_stamp", { valueAsNumber: true })}
                />
                {form.formState.errors.base_xp_per_stamp && (
                  <p className="mt-2 text-sm text-red-300">{form.formState.errors.base_xp_per_stamp.message}</p>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input type="checkbox" {...form.register("is_active")} className="h-4 w-4 rounded border-[#333333] bg-[#1A1A1A]" />
              활성화
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton onClick={resetAndClose} type="button">
                취소
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "저장 중..." : editingSeason ? "수정" : "생성"}
              </PrimaryButton>
            </div>
          </form>
        </ModalShell>
      )}
    </section>
  );
};

export default SeasonListPage;

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Modal from "../common/Modal";
import { getTicket0ResolutionCopy } from "../../api/uiCopyApi";
import { parseVaultUnlockRules } from "../../utils/vaultUtils";

type Props = {
  open: boolean;
  onClose: () => void;
  ctaPayload?: Record<string, unknown> | null;
  unlockRulesJson?: Record<string, unknown> | null;
};

const DEFAULT_COPY = {
  title: "금고 시스템 이용 안내",
  body: "지민코드 활동을 통해 적립된 포인트는 금고에 안전하게 보관됩니다.\n씨씨카지노 이용 내역 확인 시 즉시 해금되어 보유 머니로 전환됩니다.",
  primary_cta_label: "씨씨카지노 바로가기",
  secondary_cta_label: "실장 텔레 문의",
};

const PRIMARY_URL = "https://ccc-010.com";
const SECONDARY_URL = "https://t.me/jm956";

const VaultModal: React.FC<Props> = ({ open, onClose, ctaPayload, unlockRulesJson }) => {
  const copyQuery = useQuery({
    queryKey: ["ui-copy", "ticket0"],
    queryFn: getTicket0ResolutionCopy,
    enabled: open,
    staleTime: 0,
    retry: false,
  });

  const copy = useMemo(() => {
    const data = copyQuery.data;
    if (!data) return DEFAULT_COPY;
    return {
      title: (typeof data.title === "string" && data.title) ? data.title : DEFAULT_COPY.title,
      body: (typeof data.body === "string" && data.body) ? data.body : DEFAULT_COPY.body,
      primary_cta_label: (typeof data.primary_cta_label === "string" && data.primary_cta_label)
        ? data.primary_cta_label : DEFAULT_COPY.primary_cta_label,
      secondary_cta_label: (typeof data.secondary_cta_label === "string" && data.secondary_cta_label)
        ? data.secondary_cta_label : DEFAULT_COPY.secondary_cta_label,
    };
  }, [copyQuery.data]);

  const rules = useMemo(() => parseVaultUnlockRules(unlockRulesJson), [unlockRulesJson]);
  const isTicketZero = ctaPayload?.reason === "TICKET_ZERO";

  return (
    <Modal title={copy.title} open={open} onClose={onClose}>
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-[24px] bg-white/5 border border-white/5">
            <p className="text-white/80 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{copy.body}</p>
          </div>

          {isTicketZero && (
            <div className="p-3 sm:p-4 rounded-xl sm:rounded-[20px] bg-gradient-to-r from-cc-lime/20 to-cc-lime/5 border border-cc-lime/30 flex items-center gap-2 sm:gap-4">
              <span className="text-xl sm:text-2xl shrink-0">🔥</span>
              <p className="text-xs sm:text-sm font-black text-cc-lime">
                10레벨 달성 시 Diamond Key 확정 지급!
              </p>
            </div>
          )}
        </div>

        {rules.length > 0 && (
          <div className="flex flex-col gap-2 sm:gap-3">
            <h5 className="text-white/40 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] px-1">Unlock Conditions</h5>
            <div className="flex flex-col gap-1.5 sm:gap-2">
              {rules.map((r, i) => (
                <div key={i} className="flex gap-2 sm:gap-3 items-start p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-black/40 border border-white/5">
                  <div className="h-1.5 w-1.5 rounded-full bg-cc-lime shrink-0 mt-1" />
                  <p className="text-white/70 text-[11px] sm:text-[13px] font-bold leading-relaxed">{r}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-1 sm:mt-2">
          <a
            href={PRIMARY_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-cc-lime text-black font-black text-xs sm:text-sm hover:scale-105 active:scale-95 transition-transform"
          >
            {copy.primary_cta_label}
          </a>
          <a
            href={SECONDARY_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/10 text-white font-black text-xs sm:text-sm border border-white/10 hover:bg-white/20 active:scale-95 transition-all"
          >
            {copy.secondary_cta_label}
          </a>
        </div>
      </div>
    </Modal>
  );
};

export default VaultModal;

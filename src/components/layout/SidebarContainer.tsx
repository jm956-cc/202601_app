import React, { memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/authStore";
import { useSeasonPassStatus } from "../../hooks/useSeasonPass";

const baseAccent = "#d2fd9c";

const assets = {
  starDynamicPremium: "/assets/figma/star-dynamic-premium.png",
  rouletteSvg: "/images/layer-1.svg",
  levelSvg: "/images/layer-2.svg",
  lotterySvg: "/images/layer-3.svg",
  iconRoulette: "/assets/figma/icon-roulette.png",
  iconLevel: "/assets/figma/icon-level.png",
  iconLottery: "/assets/figma/icon-lottery.png",
};

type ModuleTile = {
  to: string;
  title: React.ReactNode;
  icon: string;
  fallback?: string;
  widthClassDesktop: string;
};

const DesktopTiles: ModuleTile[] = [
  {
    to: "/roulette",
    title: "룰렛 경품",
    icon: assets.rouletteSvg,
    fallback: assets.iconRoulette,
    widthClassDesktop: "w-[116px]",
  },
  {
    to: "/dice",
    title: (
      <span className="flex flex-col items-center leading-[1.15]">
        <span>레벨</span>
        <span>주사위</span>
      </span>
    ),
    icon: assets.levelSvg,
    fallback: assets.iconLevel,
    widthClassDesktop: "w-[124px]",
  },
  {
    to: "/lottery",
    title: "랜덤 복권",
    icon: assets.lotterySvg,
    fallback: assets.iconLottery,
    widthClassDesktop: "w-[110px]",
  },
];

const MobileTiles: ModuleTile[] = [
  {
    to: "/dice",
    title: (
      <span className="flex flex-col items-center leading-[1.15]">
        <span>레벨</span>
        <span>주사위</span>
      </span>
    ),
    icon: assets.levelSvg,
    fallback: assets.iconLevel,
    widthClassDesktop: "",
  },
  {
    to: "/lottery",
    title: (
      <span className="flex flex-col items-center leading-[1.15]">
        <span>복권</span>
        <span>랜덤뽑기</span>
      </span>
    ),
    icon: assets.lotterySvg,
    fallback: assets.iconLottery,
    widthClassDesktop: "",
  },
  {
    to: "/roulette",
    title: (
      <span className="flex flex-col items-center leading-[1.15]">
        <span>룰렛</span>
        <span>경품뽑기</span>
      </span>
    ),
    icon: assets.rouletteSvg,
    fallback: assets.iconRoulette,
    widthClassDesktop: "",
  },
];

const Logo: React.FC = memo(() => (
  <div className="flex items-center gap-5" aria-label="Company logo">
    <div className="relative h-[27px] w-[26px] overflow-hidden rounded-[18px]">
      <img
        src={assets.starDynamicPremium}
        alt="CC Casino mark"
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
    </div>
    <p className="text-[16px] font-semibold tracking-[-0.32px] text-white">CC CASINO</p>
  </div>
));

const GuideButton: React.FC = memo(() => (
  <Link
    to="/guide"
    className="shrink-0 rounded-[2px] bg-[#d2fd9c] px-[14px] py-[11px] text-[10px] tracking-[-0.2px] text-black hover:bg-[#b8e685]"
  >
    홈페이지 가이드
  </Link>
));

const LogoutButton: React.FC = memo(() => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="shrink-0 rounded-[2px] border border-white/25 px-[12px] py-[10px] text-[10px] tracking-[-0.2px] text-white hover:bg-white/10"
    >
      로그아웃
    </button>
  );
});

const UserBadge: React.FC = memo(() => {
  const { user } = useAuth();
  const { data: seasonPass } = useSeasonPassStatus();
  const name = (user?.nickname || user?.external_id || "지민").toString();
  const level = seasonPass?.current_level ?? user?.level ?? 1;

  return (
    <div className="rounded-full border border-white/15 bg-white/5 px-3 py-[6px] text-[12px] leading-none text-white/85">
      <span className="max-w-[120px] truncate align-middle">{name}</span>
      <span className="align-middle">레벨 </span>
      <span className="align-middle font-semibold" style={{ color: baseAccent }}>
        {level}
      </span>
    </div>
  );
});

const DesktopSidebarContent: React.FC = memo(() => {
  return (
    <div className="hidden h-full w-full flex-col overflow-hidden lg:flex">
      <div className="flex flex-1 flex-col gap-[49px] overflow-y-auto px-[20px] py-[30px]">
        <nav className="flex w-full items-start justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <UserBadge />
            <GuideButton />
            <LogoutButton />
          </div>
        </nav>

        <div className="flex flex-col gap-[20px]">
          <h1 className="text-[42px] font-medium leading-[1.058] tracking-[-0.84px] text-white">
            지민코드 전용
            <br />
            <span style={{ color: baseAccent }}>포인트서비스</span>
          </h1>
          <h2 className="text-[16px] font-normal leading-[1.09] text-[#cbcbcb]">
            즐거운 연말연시
            <br />
            지민이와 함께 하세요
          </h2>
        </div>

        <div className="flex flex-col gap-[20px]">
          <h3 className="text-[20px] font-medium leading-[1.15]" style={{ color: baseAccent }}>
            게임 바로가기
          </h3>
          <div className="flex gap-[10px]">
            {DesktopTiles.map((tile) => (
              <Link
                key={tile.to}
                to={tile.to}
                className={
                  "content-stretch flex h-[108px] flex-col items-center justify-center gap-[14px] rounded-[4px] bg-[#d2fd9c] px-[10px] py-[20px] " +
                  tile.widthClassDesktop
                }
              >
                <div className="relative h-[30px] w-[30px] min-h-[30px] min-w-[30px] shrink-0">
                  <img
                    src={tile.icon}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain"
                    onError={(e) => {
                      if (!tile.fallback) return;
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = tile.fallback;
                    }}
                  />
                </div>
                <p className="text-center text-[20px] font-medium leading-[1.15] text-black">{tile.title}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex w-full items-center justify-center gap-[12.8px] text-[20px] font-medium" style={{ color: baseAccent }}>
          <a href="https://ccc-010.com" target="_blank" rel="noreferrer" className="leading-[1.15]">
            CC카지노
          </a>
          <Link to="/season-pass" className="leading-[1.15]">
            레벨
          </Link>
          <Link to="/team-battle" className="leading-[1.15]">
            팀배틀
          </Link>
          <Link to="/vault" className="leading-[1.15]">
            내금고
          </Link>
        </div>
      </div>

      <footer className="w-full shrink-0 bg-[#394508] px-[20px] py-[31px] text-[#d2fd9c]">
        <div className="flex flex-col gap-[12px]">
          <p className="text-[20px] font-medium leading-[1.15]">Contact</p>
          <div className="flex flex-col gap-[2px] text-[20px] font-medium leading-[1.15]">
            <a href="https://ccc-010.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:opacity-90">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-cc-lime"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                ></path>
              </svg>
              CC카지노 바로가기
            </a>
            <a href="https://t.me/jm956" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:opacity-90">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-cc-lime"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
              </svg>
              실장텔레그램
            </a>
            <a href="https://t.me/+LksI3XlSjLlhZmE0" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:opacity-90">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-cc-lime"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
              </svg>
              지민공지채널
            </a>
            <a href="https://t.me/+IE0NYpuze_k1YWZk" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:opacity-90">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-cc-lime"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
              </svg>
              씨씨카지노 공식채널
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
});

const MobileSidebarContent: React.FC = memo(() => {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden lg:hidden">
      <div className="flex flex-1 flex-col gap-[20px] bg-black px-[20px] pb-[30px] pt-[20px]">
        <div className="flex w-full items-start justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <UserBadge />
            <GuideButton />
            <LogoutButton />
          </div>
        </div>

        <h1 className="text-[42px] font-medium leading-[1.058] tracking-[-0.84px] text-white">
          지민코드 전용
          <br />
          <span style={{ color: baseAccent }}>포인트 서비스</span>
        </h1>

        <div className="flex flex-col gap-[6px]">
          <h3
            className="text-[20px] font-medium leading-[1.15]"
            style={{ color: baseAccent, textShadow: "0px 4px 4px rgba(0,0,0,0.25)" }}
          >
            게임 바로가기
          </h3>
          <div className="flex flex-wrap gap-[10px]">
            {MobileTiles.map((tile) => (
              <Link
                key={tile.to}
                to={tile.to}
                className="flex-1 min-w-[110px]"
              >
                <div className="flex h-[120px] w-full flex-col items-center justify-center gap-[14px] rounded-[4px] bg-[#d2fd9c] px-[10px] py-[20px]">
                  <div className="relative h-[30px] w-[30px] min-h-[30px] min-w-[30px] shrink-0">
                    <img
                      src={tile.icon}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain"
                      onError={(e) => {
                        if (!tile.fallback) return;
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = tile.fallback;
                      }}
                    />
                  </div>
                  <div className="text-center text-[20px] font-medium leading-[1.15] text-black">{tile.title}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex w-full items-center justify-center gap-[12.8px] text-[20px] font-medium" style={{ color: baseAccent }}>
          <a href="https://ccc-010.com" target="_blank" rel="noreferrer" className="leading-[1.15]">
            CC 카지노
          </a>
          <Link to="/season-pass" className="leading-[1.15]">
            레벨확인
          </Link>
          <Link to="/team-battle" className="leading-[1.15]">
            팀배틀
          </Link>
          <Link to="/vault" className="leading-[1.15]">
            내 금고
          </Link>
        </div>
      </div>
    </div>
  );
});

export const SidebarMobileFooter: React.FC<{ className?: string }> = memo(({ className }) => {
  return (
    <footer className={"shrink-0 bg-[#394508] px-[20px] py-[31px] text-[#d2fd9c] " + (className ?? "")}>
      <div className="flex flex-col gap-[12px]">
        <p className="text-[20px] font-medium leading-[1.15]">Contact</p>
        <div className="flex flex-col gap-[2px] text-[20px] font-medium leading-[1.15]">
          <a href="https://ccc-010.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:opacity-90">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-cc-lime"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              ></path>
            </svg>
            CC카지노 바로가기
          </a>
          <a href="https://t.me/jm956" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:opacity-90">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-cc-lime"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
            </svg>
            실장텔레그램
          </a>
          <a href="https://t.me/+LksI3XlSjLlhZmE0" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:opacity-90">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-cc-lime"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
            </svg>
            지민공지채널
          </a>
          <a href="https://t.me/+IE0NYpuze_k1YWZk" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:opacity-90">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-cc-lime"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
            </svg>
            씨씨카지노 공식채널
          </a>
        </div>
      </div>
    </footer>
  );
});

const SidebarContainer: React.FC = memo(() => {
  return (
    <header className="landing-font h-full w-full">
      <DesktopSidebarContent />
      <MobileSidebarContent />
    </header>
  );
});

export default SidebarContainer;

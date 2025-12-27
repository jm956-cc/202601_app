"""Admin Vault operations: timer control and user vault inspection."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.vault2 import VaultAdminStateResponse, VaultTimerActionRequest
from app.services.vault_service import VaultService


_core = APIRouter(tags=["admin-vault-ops"])

# Canonical admin API base in this codebase is `/admin/api/*`.
# Some environments/clients still call `/api/admin/*` (often rewritten by NGINX).
# Expose both to avoid 404s.
router = APIRouter(prefix="/admin/api/vault", tags=["admin-vault-ops"])
legacy_router = APIRouter(prefix="/api/admin/vault", tags=["admin-vault-ops"])

router.include_router(_core)
legacy_router.include_router(_core)


def _build_admin_state(service: VaultService, db: Session, user_id: int) -> VaultAdminStateResponse:
    """Return full vault state for admin inspection."""
    now = datetime.utcnow()
    eligible, user, _ = service.get_status(db, user_id=user_id, now=now)
    if user is None:
        raise HTTPException(status_code=404, detail="USER_NOT_FOUND")

    locked_balance = int(getattr(user, "vault_locked_balance", 0) or 0)
    available_balance = int(getattr(user, "vault_available_balance", 0) or 0)
    cash_balance = int(getattr(user, "cash_balance", 0) or 0)
    expires_at = getattr(user, "vault_locked_expires_at", None)

    return VaultAdminStateResponse(
        user_id=user.id,
        eligible=eligible,
        vault_balance=int(getattr(user, "vault_balance", 0) or 0),
        locked_balance=locked_balance,
        available_balance=available_balance,
        cash_balance=cash_balance,
        expires_at=expires_at,
        locked_expires_at=expires_at,
        accrual_multiplier=service.vault_accrual_multiplier(db, now) if eligible else None,
        program_key=service.PROGRAM_KEY,
    )


@_core.get("/{user_id}", response_model=VaultAdminStateResponse)
@_core.get("/{user_id}/", response_model=VaultAdminStateResponse)
def get_user_vault_state(user_id: int, db: Session = Depends(get_db)) -> VaultAdminStateResponse:
    service = VaultService()
    return _build_admin_state(service, db, user_id)


@_core.post("/{user_id}/timer", response_model=VaultAdminStateResponse)
@_core.post("/{user_id}/timer/", response_model=VaultAdminStateResponse)
def set_user_timer(user_id: int, payload: VaultTimerActionRequest, db: Session = Depends(get_db)) -> VaultAdminStateResponse:
    service = VaultService()
    service.admin_timer_action(db, user_id=user_id, action=payload.action)
    return _build_admin_state(service, db, user_id)

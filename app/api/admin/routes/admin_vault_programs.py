"""Admin VaultProgram config endpoints.

Operational endpoints to edit Vault2 program JSON fields (unlock_rules_json/ui_copy_json)
without redeploying.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_admin_id
from app.schemas.vault2 import (
    VaultProgramResponse,
    VaultProgramUiCopyUpsertRequest,
    VaultProgramUnlockRulesUpsertRequest,
    VaultProgramConfigUpsertRequest,
    VaultEligibilityRequest,
    VaultEligibilityResponse,
    VaultGameEarnToggleRequest,
)
from app.services.vault2_service import Vault2Service


_core = APIRouter(tags=["admin-vault-programs"])

# Canonical admin API base in this codebase is `/admin/api/*`.
# Some environments/clients still call `/api/admin/*` (often rewritten by NGINX).
# Expose both to avoid 404s.
router = APIRouter(prefix="/admin/api/vault-programs", tags=["admin-vault-programs"])
legacy_router = APIRouter(prefix="/api/admin/vault-programs", tags=["admin-vault-programs"])
service = Vault2Service()


@_core.get("/stats")
@_core.get("/stats/")
def get_vault_stats(db: Session = Depends(get_db)) -> dict[str, Any]:
    return service.get_vault_stats(db)


def _to_response(p) -> VaultProgramResponse:
    return VaultProgramResponse(
        key=p.key,
        name=p.name,
        duration_hours=int(p.duration_hours),
        expire_policy=getattr(p, "expire_policy", None),
        is_active=bool(getattr(p, "is_active", True)),
        unlock_rules_json=getattr(p, "unlock_rules_json", None),
        ui_copy_json=getattr(p, "ui_copy_json", None),
        config_json=getattr(p, "config_json", None),
    )


@_core.get("/default", response_model=VaultProgramResponse)
@_core.get("/default/", response_model=VaultProgramResponse)
def get_default_program(db: Session = Depends(get_db)) -> VaultProgramResponse:
    program = service.get_default_program(db, ensure=True)
    return _to_response(program)


@_core.get("/{program_key}", response_model=VaultProgramResponse)
@_core.get("/{program_key}/", response_model=VaultProgramResponse)
def get_program(program_key: str, db: Session = Depends(get_db)) -> VaultProgramResponse:
    program = service.get_program_by_key(db, program_key=program_key)
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PROGRAM_NOT_FOUND")
    return _to_response(program)


@_core.put("/{program_key}/unlock-rules", response_model=VaultProgramResponse)
@_core.put("/{program_key}/unlock-rules/", response_model=VaultProgramResponse)
def upsert_unlock_rules(
    program_key: str,
    payload: VaultProgramUnlockRulesUpsertRequest,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_current_admin_id),
) -> VaultProgramResponse:
    try:
        program = service.update_program_unlock_rules(db, program_key=program_key, unlock_rules_json=payload.unlock_rules_json, admin_id=admin_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_response(program)


@_core.put("/{program_key}/ui-copy", response_model=VaultProgramResponse)
@_core.put("/{program_key}/ui-copy/", response_model=VaultProgramResponse)
def upsert_ui_copy(
    program_key: str,
    payload: VaultProgramUiCopyUpsertRequest,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_current_admin_id),
) -> VaultProgramResponse:
    try:
        program = service.update_program_ui_copy(db, program_key=program_key, ui_copy_json=payload.ui_copy_json, admin_id=admin_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_response(program)


@_core.put("/{program_key}/config", response_model=VaultProgramResponse)
@_core.put("/{program_key}/config/", response_model=VaultProgramResponse)
def upsert_config(
    program_key: str,
    payload: VaultProgramConfigUpsertRequest,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_current_admin_id),
) -> VaultProgramResponse:
    try:
        program = service.update_program_config(db, program_key=program_key, config_json=payload.config_json, admin_id=admin_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_response(program)


@_core.post("/{program_key}/game-earn-toggle", response_model=VaultProgramResponse)
@_core.post("/{program_key}/game-earn-toggle/", response_model=VaultProgramResponse)
def toggle_game_earn(
    program_key: str,
    payload: VaultGameEarnToggleRequest,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_current_admin_id),
) -> VaultProgramResponse:
    try:
        program = service.toggle_game_earn(db, program_key=program_key, enabled=payload.enabled, admin_id=admin_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_response(program)


@_core.get("/{program_key}/eligibility/{user_id}", response_model=VaultEligibilityResponse)
@_core.get("/{program_key}/eligibility/{user_id}/", response_model=VaultEligibilityResponse)
def get_user_eligibility(
    program_key: str,
    user_id: int,
    db: Session = Depends(get_db),
) -> VaultEligibilityResponse:
    try:
        eligible = service.get_eligibility(db, program_key=program_key, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return VaultEligibilityResponse(user_id=user_id, eligible=eligible)


@_core.post("/{program_key}/eligibility/{user_id}", response_model=VaultEligibilityResponse)
@_core.post("/{program_key}/eligibility/{user_id}/", response_model=VaultEligibilityResponse)
def upsert_user_eligibility(
    program_key: str,
    user_id: int,
    payload: VaultEligibilityRequest,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_current_admin_id),
) -> VaultEligibilityResponse:
    try:
        service.upsert_eligibility(db, program_key=program_key, user_id=user_id, eligible=payload.eligible, admin_id=admin_id)
        eligible = service.get_eligibility(db, program_key=program_key, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return VaultEligibilityResponse(user_id=user_id, eligible=eligible)


# NOTE: include_router must happen after _core routes are defined.
router.include_router(_core)
legacy_router.include_router(_core)

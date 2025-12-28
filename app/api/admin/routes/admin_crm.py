
"""Admin CRM and Messaging Endpoints."""
import csv
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.api.deps import get_db, get_current_admin_id
from app.services.user_segment_service import UserSegmentService
from app.models.user import User
from app.models.admin_message import AdminMessage, AdminMessageInbox
from app.models.admin_user_profile import AdminUserProfile

# Schemas (inline for now, or move to app/schemas/admin_crm.py)
from pydantic import BaseModel
from datetime import datetime
from app.core.security import hash_password

# Default password for auto-created users via CSV import
DEFAULT_IMPORT_PASSWORD = "1234"

class AdminUserProfileResponse(BaseModel):
    user_id: int
    external_id: Optional[str]
    real_name: Optional[str]
    phone_number: Optional[str]
    telegram_id: Optional[str]
    tags: Optional[List[str]] = []
    memo: Optional[str]
    computed_segments: List[str] = []
    
    class Config:
        from_attributes = True

class ImportResult(BaseModel):
    total_processed: int
    success_count: int
    failed_count: int
    errors: List[str]

class MessageCreate(BaseModel):
    title: str
    content: str
    target_type: str # ALL, SEGMENT, TAG, USER
    target_value: Optional[str]
    channels: List[str] = ["INBOX"]

class MessageResponse(BaseModel):
    id: int
    sender_admin_id: int
    title: str
    content: str
    target_type: str
    target_value: Optional[str]
    recipient_count: int
    read_count: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class CrmStatsResponse(BaseModel):
    total_users: int
    active_users: int
    paying_users: int
    whale_count: int
    conversion_rate: float
    retention_rate: float
    empty_tank_count: int
    
    # Advanced KPIs
    churn_rate: float
    new_user_growth: float
    message_open_rate: float
    
    # Segmentation Distribution
    segments: dict = {} # e.g. {"DAILY": 10, "WEEKLY": 5}
    
    # NEW: Imported Profile Data KPIs
    avg_active_days: float = 0  # From CSV import
    charge_risk_segments: dict = {}  # {"LOW": x, "MEDIUM": y, "HIGH": z}
    tag_counts: dict = {}  # {"태그명": count}


router = APIRouter(prefix="/admin/api/crm", tags=["admin-crm"])

@router.get("/stats", response_model=CrmStatsResponse)
def get_crm_stats(db: Session = Depends(get_db)):
    """Get aggregated CRM statistics."""
    return UserSegmentService.get_overall_stats(db)

@router.get("/segment-detail", response_model=List[AdminUserProfileResponse])
def get_segment_detail(segment_type: str, limit: int = 100, db: Session = Depends(get_db)):
    """Get users in a specific segment with profile info."""
    user_ids = UserSegmentService.get_users_by_segment(db, segment_type, limit)
    results = []
    for uid in user_ids:
        profile = UserSegmentService.get_user_profile(db, uid)
        segments = UserSegmentService.get_computed_segments(db, uid)
        
        # User object for external_id fallback
        u = db.query(User).filter(User.id == uid).first()
        
        resp = AdminUserProfileResponse(
            user_id=uid,
            external_id=u.external_id if u else None,
            real_name=profile.real_name if profile else None,
            phone_number=profile.phone_number if profile else None,
            telegram_id=profile.telegram_id if profile else None,
            tags=profile.tags if profile else [],
            memo=profile.memo if profile else None,
            computed_segments=segments
        )
        results.append(resp)
    return results

@router.post("/import-profiles", response_model=ImportResult)
async def import_profiles(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Import User Profiles from CSV.
    Expected columns: external_id, real_name, phone, telegram, memo, tags (comma-sep)
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only CSV files are supported.")

    content = await file.read()
    decoded = content.decode("utf-8-sig") # Handle BOM
    reader = csv.DictReader(io.StringIO(decoded))
    
    total = 0
    success = 0
    failed = 0
    errors = []
    
    for row in reader:
        total += 1
        try:
            # Helper to find key case-insensitively
            def get_val(keys, target_key):
                # exact match
                if target_key in keys:
                     return row[target_key]
                # case insensitive
                for k in keys:
                    if k.strip().lower() == target_key.lower():
                        return row[k]
                return None

            keys = row.keys()
            
            # 1. Identify User (External ID priority)
            ext_id = get_val(keys, "external_id") 
            # Fallback for common Korean/BOM issues
            if not ext_id:
                # Try finding any key containing 'external_id'
                for k in keys:
                    if "external_id" in k.lower():
                        ext_id = row[k]
                        break
            
            user_id_str = get_val(keys, "user_id")
            
            target_user = None
            if user_id_str:
                target_user = db.query(User).filter(User.id == int(user_id_str)).first()
            elif ext_id:
                target_user = db.query(User).filter(User.external_id == ext_id.strip()).first()
            
            if not target_user:
                # Auto-create user if external_id is provided but user doesn't exist
                if ext_id and ext_id.strip():
                    clean_ext_id = ext_id.strip()
                    # Create new user with default password
                    target_user = User(
                        external_id=clean_ext_id,
                        nickname=clean_ext_id,  # Use external_id as nickname initially
                        password_hash=hash_password(DEFAULT_IMPORT_PASSWORD),
                        level=1,
                        xp=0,
                        status="active"
                    )
                    db.add(target_user)
                    db.commit()
                    db.refresh(target_user)
                    errors.append(f"Row {total}: Created new user (ExtID: {clean_ext_id}, PW: {DEFAULT_IMPORT_PASSWORD})")
                else:
                    # No external_id provided - skip this row
                    failed += 1
                    errors.append(f"Row {total}: Skipped - No external_id provided")
                    continue
            
            # 2. Extract Data
            # Mappings for Korean headers
            tags_raw = get_val(keys, "tags") or get_val(keys, "태그")
            memo_raw = get_val(keys, "memo") or get_val(keys, "메모")
            real_name_raw = get_val(keys, "real_name") or get_val(keys, "이름") or get_val(keys, "실명")
            phone_raw = get_val(keys, "phone") or get_val(keys, "phone_number") or get_val(keys, "전화번호")
            telegram_raw = get_val(keys, "telegram") or get_val(keys, "telegram_id") or get_val(keys, "텔레그램")
            
            # New Metrics
            total_active_days_str = get_val(keys, "총 이용일수") or get_val(keys, "total_active_days")
            days_since_charge_str = get_val(keys, "마지막 충전 후 경과일") or get_val(keys, "days_since_last_charge")
            last_active_str = get_val(keys, "최근 이용일") or get_val(keys, "last_active_date_str")

            profile_data = {
                "external_id": ext_id.strip() if ext_id else target_user.external_id,
                "real_name": real_name_raw,
                "phone_number": phone_raw, # map 'phone' to 'phone_number'
                "telegram_id": telegram_raw,
                "memo": memo_raw
            }
            
            if total_active_days_str:
                try:
                    profile_data["total_active_days"] = int(str(total_active_days_str).replace(",","").strip())
                except:
                    pass
            
            if days_since_charge_str:
                try:
                    profile_data["days_since_last_charge"] = int(str(days_since_charge_str).replace(",","").strip())
                except:
                    pass

            if last_active_str:
                profile_data["last_active_date_str"] = str(last_active_str).strip()

            # Tags
            if tags_raw:
                profile_data["tags"] = [t.strip() for t in tags_raw.split(",") if t.strip()]
            
            UserSegmentService.upsert_user_profile(db, target_user.id, profile_data)
            success += 1
            
        except Exception as e:
            failed += 1
            errors.append(f"Row {total}: {str(e)}")
            
    return ImportResult(
        total_processed=total,
        success_count=success,
        failed_count=failed,
        errors=errors[:10] # Limit error size
    )

@router.get("/user/{user_id}/segments", response_model=AdminUserProfileResponse)
def get_user_crm_info(user_id: int, db: Session = Depends(get_db)):
    """Get manual profile + computed segments."""
    profile = UserSegmentService.get_user_profile(db, user_id)
    segments = UserSegmentService.get_computed_segments(db, user_id)
    
    # Construct response
    resp = AdminUserProfileResponse(
        user_id=user_id,
        external_id=None,
        real_name=None,
        phone_number=None,
        telegram_id=None,
        tags=[],
        memo=None,
        computed_segments=segments
    )
    
    if profile:
        resp.external_id = profile.external_id
        resp.real_name = profile.real_name
        resp.phone_number = profile.phone_number
        resp.telegram_id = profile.telegram_id
        resp.tags = profile.tags or []
        resp.memo = profile.memo
        
    return resp

@router.post("/messages", response_model=MessageResponse)
def send_message(
    payload: MessageCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_current_admin_id)
):
    """Send admin message (Async fan-out)."""
    # Create record
    msg = AdminMessage(
        sender_admin_id=admin_id,
        title=payload.title,
        content=payload.content,
        target_type=payload.target_type,
        target_value=payload.target_value,
        channels=payload.channels
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    
    # Fan-out logic (Async fan-out with fresh session)
    background_tasks.add_task(fan_out_message, msg.id, payload.target_type, payload.target_value)
    
    return msg

@router.get("/messages", response_model=List[MessageResponse])
def list_messages(
    skip: int = 0, 
    limit: int = 50, 
    db: Session = Depends(get_db)
):
    return db.query(AdminMessage).order_by(AdminMessage.created_at.desc()).offset(skip).limit(limit).all()


# Helper for fan-out
def fan_out_message(message_id: int, target_type: str, target_value: Optional[str]):
    # Create a fresh session for background task
    db = SessionLocal()
    try:
        # 1. Select Users
        target_user_ids = []
        
        if target_type == "ALL":
            target_user_ids = [u.id for u in db.query(User.id).all()]
            
        elif target_type == "USER":
            if target_value:
                target_user_ids = [int(uid.strip()) for uid in target_value.split(",")]
                
        elif target_type == "SEGMENT":
            if target_value:
                # target_value should be something like "WHALE", "DORMANT", etc.
                target_user_ids = UserSegmentService.get_users_by_segment(db, target_value, limit=10000)
        
        # 2. Insert Inbox
        inbox_items = []
        for uid in target_user_ids:
            inbox_items.append(AdminMessageInbox(
                user_id=uid,
                message_id=message_id
            ))
        
        if inbox_items:
            db.bulk_save_objects(inbox_items)
            # Update Stats
            msg = db.query(AdminMessage).filter(AdminMessage.id == message_id).first()
            if msg:
                msg.recipient_count = len(inbox_items)
            db.commit()
    except Exception as e:
        db.rollback()
        # Log error in production
        import logging
        logging.error(f"Error in fan_out_message: {e}")
    finally:
        db.close()

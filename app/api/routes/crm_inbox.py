from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.admin_message import AdminMessage, AdminMessageInbox

router = APIRouter(prefix="/api/crm/messages", tags=["crm-inbox"])

class InboxMessageResponse(BaseModel):
    id: int
    title: str
    content: str
    created_at: datetime
    is_read: bool
    read_at: Optional[datetime]

    class Config:
        from_attributes = True

@router.get("/inbox", response_model=List[InboxMessageResponse])
def get_my_inbox(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's inbox messages."""
    # Join AdminMessageInbox with AdminMessage
    results = db.query(
        AdminMessage.id,
        AdminMessage.title,
        AdminMessage.content,
        AdminMessage.created_at,
        AdminMessageInbox.is_read,
        AdminMessageInbox.read_at
    ).join(
        AdminMessageInbox, AdminMessage.id == AdminMessageInbox.message_id
    ).filter(
        AdminMessageInbox.user_id == current_user.id
    ).order_by(
        AdminMessage.created_at.desc()
    ).all()

    return [
        InboxMessageResponse(
            id=r.id,
            title=r.title,
            content=r.content,
            created_at=r.created_at,
            is_read=r.is_read,
            read_at=r.read_at
        ) for r in results
    ]

@router.post("/{message_id}/read")
def mark_as_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a message as read."""
    inbox_item = db.query(AdminMessageInbox).filter(
        AdminMessageInbox.user_id == current_user.id,
        AdminMessageInbox.message_id == message_id
    ).first()

    if not inbox_item:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if not inbox_item.is_read:
        inbox_item.is_read = True
        inbox_item.read_at = datetime.utcnow()
        
        # Update aggregate stats
        msg = db.query(AdminMessage).filter(AdminMessage.id == message_id).first()
        if msg:
            msg.read_count = (msg.read_count or 0) + 1
            
        db.commit()
    
    return {"status": "ok"}

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str
    document_type_id: str | None
    uploaded_at: datetime
    uploaded_by_role: str

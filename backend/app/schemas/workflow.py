from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

WorkflowStatus = Literal["active", "paused"]
WorkflowDestination = Literal["internal_db"]
WorkflowTriggerType = Literal["manual", "repository_polling"]


class WorkflowFieldThreshold(BaseModel):
    min: str | None = None
    max: str | None = None


class WorkflowCreate(BaseModel):
    name: str
    document_type_id: str | None = None
    destination: WorkflowDestination = "internal_db"
    trigger_type: WorkflowTriggerType = "manual"
    field_thresholds: dict[str, WorkflowFieldThreshold] = {}


class WorkflowUpdate(WorkflowCreate):
    pass


class WorkflowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    status: WorkflowStatus
    trigger_type: WorkflowTriggerType
    document_type_id: str | None
    destination: WorkflowDestination
    field_thresholds: dict[str, WorkflowFieldThreshold]
    created_at: datetime
    updated_at: datetime

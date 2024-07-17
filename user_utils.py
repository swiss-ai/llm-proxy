import os
from datetime import datetime
from typing import Tuple
from pydantic import BaseModel
from sqlmodel import SQLModel, Field, Session, create_engine

class APIKey(SQLModel, table=True):
    key: str = Field(primary_key=True)
    budget: int = Field(default=1000)
    created_at: datetime = Field(default=datetime.now())
    updated_at: datetime = Field(default=datetime.now())

if __name__ =="__main__":
    pg_host = os.environ.get("PG_HOST", "localhost")
    engine = create_engine(pg_host, echo=True)
    SQLModel.metadata.create_all(engine)
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # SQL Server Express (Windows Auth / Trusted Connection)
    sql_server_instance: str = r"OMIKRON\SQLEXPRESS"
    sql_database: str = "RancoDocExtract"
    sql_odbc_driver: str = "ODBC Driver 18 for SQL Server"

    # Azure Document Intelligence
    azure_di_endpoint: str = ""
    azure_di_key: str = ""

    # Azure OpenAI (Foundry) - API surface v1 (Responses API), sin api-version.
    # AZURE_OPENAI_ENDPOINT es la URL completa que entrega Foundry, terminada en
    # ".../openai/v1/responses" o ".../openai/v1" (ambas formas se aceptan).
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_openai_deployment: str = ""

    # Pipeline
    confidence_threshold: float = 0.8
    storage_dir: Path = Path(__file__).resolve().parent.parent / "storage"
    retry_backoff_seconds: float = 2.0

    # Subida de documentos
    max_upload_mb: int = 25
    allowed_upload_extensions: set[str] = {
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".tif",
        ".tiff",
        ".bmp",
        ".heif",
    }

    @property
    def sqlalchemy_database_uri(self) -> str:
        driver = self.sql_odbc_driver.replace(" ", "+")
        return (
            f"mssql+pyodbc://@{self.sql_server_instance}/{self.sql_database}"
            f"?driver={driver}&trusted_connection=yes&TrustServerCertificate=yes"
        )

    @property
    def master_sqlalchemy_database_uri(self) -> str:
        """Connection to the `master` DB, used only to create the app database if missing."""
        driver = self.sql_odbc_driver.replace(" ", "+")
        return (
            f"mssql+pyodbc://@{self.sql_server_instance}/master"
            f"?driver={driver}&trusted_connection=yes&TrustServerCertificate=yes"
        )

    @property
    def azure_openai_base_url(self) -> str:
        """Base URL para el SDK de OpenAI (el cliente agrega '/responses' al llamar)."""
        url = self.azure_openai_endpoint.rstrip("/")
        if url.endswith("/responses"):
            url = url[: -len("/responses")]
        return url

    @property
    def azure_di_configured(self) -> bool:
        return bool(self.azure_di_endpoint and self.azure_di_key)

    @property
    def azure_openai_configured(self) -> bool:
        return bool(
            self.azure_openai_endpoint
            and self.azure_openai_key
            and self.azure_openai_deployment
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

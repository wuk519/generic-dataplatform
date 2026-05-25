from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://dataplatform:dataplatform@localhost:5432/dataplatform"
    secret_key: str = "change-me-in-production-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24
    cors_origins: list[str] = ["http://localhost:5173"]

    # Optional: if both are set, an admin user is created automatically on
    # startup when no admin with this username exists. Leave blank in production
    # and use `python -m scripts.create_admin` instead.
    admin_username: str | None = None
    admin_password: str | None = None


settings = Settings()

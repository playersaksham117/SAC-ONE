from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    supabase_jwt_secret: str
    admin_api_key: str
    app_secret: str
    environment: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()

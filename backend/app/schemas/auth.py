from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_reset_password: bool = False


class ResetPasswordRequest(BaseModel):
    old_password: str
    new_password: str

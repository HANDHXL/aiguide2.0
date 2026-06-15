from fastapi import APIRouter, Depends, HTTPException
from backend.schemas.auth import RegisterRequest, LoginRequest, AuthResponse, UserInfo
from backend.services.auth_service import register_user, authenticate_user, create_token
from backend.api.dependencies import get_current_user
from backend.database.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest):
    try:
        user = register_user(req.username, req.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    token = create_token(user.id, user.username)
    return AuthResponse(token=token, user_id=user.id, username=user.username)


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest):
    try:
        user = authenticate_user(req.username, req.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    token = create_token(user.id, user.username)
    return AuthResponse(token=token, user_id=user.id, username=user.username)


@router.get("/me", response_model=UserInfo)
def get_me(user: User = Depends(get_current_user)):
    return UserInfo(user_id=user.id, username=user.username)

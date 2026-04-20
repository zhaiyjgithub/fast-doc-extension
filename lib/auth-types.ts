export type AuthUserType = 'doctor' | 'admin'

export type AuthTokens = {
  accessToken: string
  refreshToken: string
}

export type AuthUser = {
  userId: string
  email: string
  userType: AuthUserType
  providerId: string | null
}

export type PersistedAuthSession = AuthTokens & {
  username: string
  user: AuthUser
}

/** Backend `POST /v1/auth/login` and `POST /v1/auth/refresh` payload under `data`. */
export type ProviderAuthLoginResponseData = {
  access_token: string
  refresh_token: string
  token_type: string
  user_type: AuthUserType
  user_id: string
  provider_id: string | null
}

/** Backend `GET /v1/auth/me` payload under `data`. */
export type ProviderAuthMeResponseData = {
  user_id: string
  email: string
  user_type: AuthUserType
  provider_id: string | null
}

/** Backend `POST /v1/auth/logout` payload under `data`. */
export type ProviderAuthLogoutResponseData = {
  message: string
}

export type ProviderAuthLoginResponse = {
  data: ProviderAuthLoginResponseData
}

export type ProviderAuthMeResponse = {
  data: ProviderAuthMeResponseData
}

export type ProviderAuthLogoutResponse = {
  data: ProviderAuthLogoutResponseData
}

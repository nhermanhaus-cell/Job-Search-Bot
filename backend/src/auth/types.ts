export type AuthContext = {
  userId: string;
  profileId: string;
  sessionId: string;
};

export type AuthProvider = "apple" | "google";
export type AuthIntent = "signup" | "login";

export type PublicUser = {
  id: string;
  email: string | null;
  name: string | null;
  providers: string[];
};

export type AuthSessionResponse = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  user: PublicUser;
  onboardingDone: boolean;
};

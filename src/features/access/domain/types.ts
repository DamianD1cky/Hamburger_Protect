import type {
  CampaignRole,
  EmployeePosition,
} from "../../campaign/domain/types";
export interface AppSession {
  user: {
    id: string;
    authUserId: string;
    displayName: string;
    isAnonymous: boolean;
    email?: string | null;
    metadata?: Record<string, unknown> | null;
  };
}
export interface GmAccess {
  userId: string;
  accountName: string;
  displayName: string;
  status: "pending" | "approved" | "rejected" | "revoked";
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string;
}

export interface CampaignJoinRequest {
  id: string;
  campaignId: string;
  userId: string;
  campaignName: string;
  characterName: string;
  jobTitle: string;
  profileText: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string;
}

export interface ActiveCampaignAccess {
  campaignId: string;
  name: string;
  joinCode: string;
  status: "active" | "archived";
  role: CampaignRole;
  characterName: string;
  jobTitle: EmployeePosition;
  joinedAt: string;
}

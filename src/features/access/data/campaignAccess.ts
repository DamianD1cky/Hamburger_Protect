import { backend } from "../../../lib/backend";
import * as legacy from "./nhostCampaignAccess";
import * as next from "./supabaseCampaignAccess";
export type {
  GmAccess,
  CampaignJoinRequest,
  ActiveCampaignAccess,
} from "../domain/types";
export {
  GM_USERNAME_PATTERN,
  GM_PASSWORD_MIN_LENGTH,
  normalizeGmUsername,
  getAccessErrorMessage,
} from "../domain/account";
export const getActiveCampaign =
  backend === "supabase" ? next.getActiveCampaign : legacy.getActiveCampaign;
export const getGmAccess =
  backend === "supabase" ? next.getGmAccess : legacy.getGmAccess;
export const registerGm =
  backend === "supabase" ? next.registerGm : legacy.registerGm;
export const signInGm =
  backend === "supabase" ? next.signInGm : legacy.signInGm;
export const createCampaign =
  backend === "supabase" ? next.createCampaign : legacy.createCampaign;
export const joinCampaign =
  backend === "supabase" ? next.joinCampaign : legacy.joinCampaign;
export const getOwnJoinRequest =
  backend === "supabase" ? next.getOwnJoinRequest : legacy.getOwnJoinRequest;
export const getCampaignJoinInbox =
  backend === "supabase"
    ? next.getCampaignJoinInbox
    : legacy.getCampaignJoinInbox;
export const reviewCampaignJoin =
  backend === "supabase" ? next.reviewCampaignJoin : legacy.reviewCampaignJoin;
export const cancelCampaignJoin =
  backend === "supabase" ? next.cancelCampaignJoin : legacy.cancelCampaignJoin;
export const signOut = backend === "supabase" ? next.signOut : legacy.signOut;

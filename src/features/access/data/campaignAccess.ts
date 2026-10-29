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
export const applyForGm =
  backend === "supabase"
    ? next.applyForGm
    : async (): Promise<never> => {
        throw new Error("Nhost 已冻结，请使用 Supabase 后端");
      };
export const registerAccount =
  backend === "supabase" ? next.registerAccount : legacy.registerGm;
export const signInAccount =
  backend === "supabase" ? next.signInAccount : legacy.signInGm;
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
export const listPublicCampaigns =
  backend === "supabase" ? next.listPublicCampaigns : async () => [];
export const getVisitorMessages =
  backend === "supabase"
    ? next.getVisitorMessages
    : async () => {
        throw new Error("公开参观仅支持 Supabase 后端");
      };
export const submitVisitorMessage =
  backend === "supabase"
    ? next.submitVisitorMessage
    : async () => {
        throw new Error("公开参观仅支持 Supabase 后端");
      };
export const deleteVisitorMessage =
  backend === "supabase"
    ? next.deleteVisitorMessage
    : async () => {
        throw new Error("公开参观仅支持 Supabase 后端");
      };
export const signOut = backend === "supabase" ? next.signOut : legacy.signOut;

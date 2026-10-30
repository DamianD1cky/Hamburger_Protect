import { flushSync } from "react-dom";

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let activeTransition: ViewTransition | null = null;

/** The callback changes only the view; fetch data before taking snapshots. */
export async function transitionCampaignView(
  direction: "enter" | "exit",
  campaignId: string,
  publicView: boolean,
  update: () => void,
) {
  activeTransition?.skipTransition();
  if (!document.startViewTransition || prefersReducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  const named = new Set<HTMLElement>();
  const nameTitle = () => {
    const list = publicView ? ".public-room-list" : ".campaign-access-rows";
    const title = document.querySelector<HTMLElement>(
      `${list} [data-campaign-entry="${CSS.escape(campaignId)}"] strong`,
    ) ?? document.querySelector<HTMLElement>(".campaign-scene-title");
    if (title) {
      title.style.viewTransitionName = "campaign-title";
      named.add(title);
    }
  };
  nameTitle();
  root.dataset.campaignTransition = direction;
  let changed = false;
  let transition: ViewTransition | null = null;
  try {
    transition = document.startViewTransition(() => {
      changed = true;
      flushSync(update);
      nameTitle();
    });
    activeTransition = transition;
    // A skipped snapshot must not become an unhandled rejection.
    void transition.ready.catch(() => {});
    await transition.finished;
  } catch {
    if (!changed) update();
  } finally {
    for (const title of named) title.style.viewTransitionName = "";
    if (activeTransition === transition) {
      activeTransition = null;
      delete root.dataset.campaignTransition;
    }
  }
}

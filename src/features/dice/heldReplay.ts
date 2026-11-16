import type { PhysicsRequest, ReplayTrack } from "./physicsProtocol";
import type { ThrowLaunch } from "./trayPhysics";
import type { TrayDie } from "./trayModels";

export interface HeldCandidate { launch: ThrowLaunch; tracks: ReplayTrack[] }

/** Keep only the newest hand pose; a slow worker must not queue every move.
 * Results and the stationary scene are fixed for the lifetime of one grab. */
export class HeldReplay {
  candidate: HeldCandidate | null = null;
  private dice: TrayDie[] | null = null;
  private launch: ThrowLaunch | null = null;
  private key = "";
  private version = 0;
  private building = false;
  private cancelled = false;
  private build: (request: Omit<PhysicsRequest, "id">) => Promise<ReplayTrack[]>;
  private stationary: PhysicsRequest["stationary"];
  private onReady: (candidate: HeldCandidate) => void;
  private onError: (error: unknown) => void;

  constructor(
    build: (request: Omit<PhysicsRequest, "id">) => Promise<ReplayTrack[]>,
    stationary: PhysicsRequest["stationary"],
    onReady: (candidate: HeldCandidate) => void,
    onError: (error: unknown) => void,
  ) {
    this.build = build; this.stationary = stationary;
    this.onReady = onReady; this.onError = onError;
  }

  setDice(dice: TrayDie[]) {
    if (this.dice || this.cancelled) return;
    this.dice = dice;
    this.pump();
  }

  setLaunch(launch: ThrowLaunch) {
    if (this.cancelled) return;
    const key = JSON.stringify(launch);
    if (key === this.key) return;
    this.key = key; this.launch = launch; this.version++;
    this.candidate = null;
    this.pump();
  }

  cancel() { this.cancelled = true; this.version++; this.candidate = null; }

  private pump() {
    if (this.cancelled || this.building || !this.dice || !this.launch) return;
    const version = this.version, launch = this.launch;
    this.building = true;
    void this.build({ dice: this.dice, stationary: this.stationary, launch }).then((tracks) => {
      if (this.cancelled || version !== this.version) return;
      this.candidate = { launch, tracks };
      this.onReady(this.candidate);
    }, (error) => {
      if (!this.cancelled && version === this.version) this.onError(error);
    }).finally(() => {
      this.building = false;
      if (!this.cancelled && version !== this.version) this.pump();
    });
  }
}

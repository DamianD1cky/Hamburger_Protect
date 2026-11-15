import type { PhysicsRequest, PhysicsResponse, ReplayTrack } from "./physicsProtocol";

/** One worker per open tray; closing terminates computation and old replies. */
export function createPhysicsClient() {
  const worker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
  let sequence = 0;
  let failure: Error | null = null;
  const pending = new Map<number, { resolve: (tracks: ReplayTrack[]) => void; reject: (error: Error) => void }>();
  const fail = (error: Error) => {
    failure = error;
    pending.forEach((item) => item.reject(error));
    pending.clear();
  };
  worker.onmessage = (event: MessageEvent<PhysicsResponse>) => {
    const item = pending.get(event.data.id);
    if (!item) return;
    pending.delete(event.data.id);
    if (event.data.error) item.reject(new Error(event.data.error));
    else item.resolve(event.data.tracks ?? []);
  };
  worker.onerror = () => fail(new Error("骰子物理计算暂时不可用"));
  worker.onmessageerror = () => fail(new Error("骰子物理结果无法读取"));
  return {
    build(request: Omit<PhysicsRequest, "id">): Promise<ReplayTrack[]> {
      if (failure) return Promise.reject(failure);
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ ...request, id });
      });
    },
    dispose() { worker.terminate(); fail(new Error("骰盘已关闭")); },
  };
}

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ThrowLaunch } from "./trayPhysics";
import { createModelLibrary, disposeModel, getDieShape, readDieFace, type TrayDie, type DieAppearance } from "./trayModels";
import { createSurfaceLibrary } from "./surfaceMaterials";
import { createProceduralTray } from "./proceduralTray";
import { createPhysicsClient } from "./physicsClient";
import type { ReplayTrack } from "./physicsProtocol";
import { expandDiceSelection, matchThrowDice } from "./traySelection";
import { createSelectionGlow } from "./selectionGlow";
import { HeldReplay, type HeldCandidate } from "./heldReplay";
import { clampTrayMove, dieBounds, findTraySpace, footprint, trayOuter, type DiePose } from "./trayPlacement";

export interface DiceSelection { ids: string[]; x: number; y: number; dragging?: boolean }
export interface DiceSceneHandle { allocate: (types: TrayDie["sides"][]) => DiePose[] | null }
interface Props {
  ref?: Ref<DiceSceneHandle>;
  dice: TrayDie[];
  skin: string;
  throwId: string | null;
  throwLaunch: ThrowLaunch | null;
  selection: DiceSelection | null;
  disabled: boolean;
  canThrow: boolean;
  waiting: boolean;
  waitingIds: string[];
  reducedMotion: boolean;
  onSelect: (selection: DiceSelection | null) => void;
  onRolling: (rolling: boolean) => void;
  onThrow: (ids: string[], launch: ThrowLaunch) => Promise<boolean>;
  onPrepare: (ids: string[]) => Promise<TrayDie[] | null>;
}
interface SceneController extends DiceSceneHandle {
  update: (props: Props) => void;
  select: (id: string, additive?: boolean) => void;
  dispose: () => void;
}

export function DiceScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  useImperativeHandle(props.ref, () => ({ allocate: (types) => controller.current?.allocate(types) ?? null }), []);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch { setFailed(true); return; }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.prepend(renderer.domElement);
    const scene = new T.Scene();
    const room = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room, .04);
    scene.environment = environment.texture;
    scene.environmentIntensity = .55;
    room.dispose(); pmrem.dispose();
    const playfield = new T.Group();
    scene.add(playfield);
    const camera = new T.PerspectiveCamera(38, 1, .1, 100);
    const light = new T.DirectionalLight(0xffefd8, 3.7);
    light.position.set(-3, 10, 5); light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: .1, far: 24 });
    light.shadow.normalBias = .02;
    light.shadow.bias = -.0005;
    scene.add(light, new T.HemisphereLight(0xdce7ef, 0x40372b, 2));
    const rimLight = new T.DirectionalLight(0xb1cbe7, 1.7);
    rimLight.position.set(4, 5, -4); scene.add(rimLight);
    const surfaces = createSurfaceLibrary();
    const modelLibrary = createModelLibrary(surfaces);
    const tray = createProceduralTray(surfaces, latest.current.skin);
    playfield.add(tray);
    const proxies = container.querySelector<HTMLDivElement>(".dice-pick-targets")!;
    const marquee = container.querySelector<HTMLDivElement>(".dice-selection-box")!;
    const models = new Map<string, ReturnType<typeof modelLibrary.create>>();
    let currentDice: TrayDie[] = [];
    let currentSkin = "";
    let previousThrow: string | null = null;
    let tracks: ReplayTrack[] = [];
    const physics = createPhysicsClient();
    let simulationRevision = 0;
    let preparing = false;
    let waiting = false;
    let startTime = 0;
    let frame = 0;
    let stopped = false;
    let rolling = false;
    let replayOffset = 0;
    let hand: {
      ids: string[];
      source: TrayDie[];
      preparation: HeldReplay;
      ready: boolean;
      targets: Map<string, T.Quaternion>;
      lastFrame: number;
      released: ThrowLaunch | null;
      play: ((candidate: HeldCandidate) => void) | null;
      fail: ((error: unknown) => void) | null;
      error: unknown;
    } | null = null;
    container.dataset.rolling = "false"; container.dataset.phase = "idle";
    let glow: ReturnType<typeof createSelectionGlow> | undefined;
    let selectedBodies: T.Object3D[] = [];
    const raycaster = new T.Raycaster();
    const pointer = new T.Vector2();
    const poseOf = (model: ReturnType<typeof modelLibrary.create>): DiePose => ({
      position: model.group.position.toArray() as DiePose["position"],
      quaternion: model.group.quaternion.toArray() as DiePose["quaternion"],
    });
    const allocate = (types: TrayDie["sides"][]): DiePose[] | null => {
      const occupied = [...models].map(([id, model]) =>
        footprint(dieBounds(getDieShape(currentDice.find((die) => die.id === id)!.sides).geometry, poseOf(model))));
      const poses: DiePose[] = [];
      for (const sides of types) {
        const shape = getDieShape(sides);
        const rotation = new T.Quaternion().setFromUnitVectors(shape.faces[0].readNormal, new T.Vector3(0, 1, 0));
        const bounds = dieBounds(shape.geometry, { position: [0, 0, 0], quaternion: rotation.toArray() });
        const position = findTraySpace(bounds, occupied);
        if (!position) return null;
        poses.push({ position, quaternion: rotation.toArray() });
        occupied.push(footprint(bounds.translate(new T.Vector3(...position))));
      }
      return poses;
    };
    let awaitingThrow = false;
    let cancelledPointer: number | null = null;
    let gesture: {
      pointerId: number; x: number; y: number;
      additive: boolean; previous: string[]; selected: string[]; dragging: boolean;
      timer: number; kind: "press" | "marquee" | "lift"; mouse: boolean;
      poses: Map<string, DiePose>; planeStart: T.Vector3 | null; planeY: number;
      samples: { x: number; z: number; time: number }[]; distance: number;
      velocity: ThrowLaunch["velocity"];
    } | null = null;
    const project = (id: string): { x: number; y: number } | null => {
      const model = models.get(id);
      if (!model) return null;
      const center = model.group.getWorldPosition(new T.Vector3()).project(camera);
      return { x: (center.x + 1) / 2 * container.clientWidth, y: (1 - center.y) / 2 * container.clientHeight };
    };
    const projectSelection = (ids: string[], dragging = false): DiceSelection | null => {
      const linked = expandDiceSelection(currentDice, ids);
      const points = linked.map(project).filter((point) => point !== null);
      if (!points.length) return null;
      return {
        ids: linked, dragging,
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      };
    };
    const syncTargets = () => {
      scene.updateMatrixWorld(true);
      for (const die of currentDice) {
        const target = proxies.querySelector<HTMLElement>(`[data-die-id="${die.id}"]`);
        const screen = project(die.id);
        if (!target || !screen) continue;
        target.style.left = `${screen.x}px`; target.style.top = `${screen.y}px`;
        const model = models.get(die.id)!;
        target.dataset.position = model.group.position.toArray().join(",");
        const bounds = footprint(dieBounds(getDieShape(die.sides).geometry, poseOf(model)));
        target.dataset.footprint = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].join(",");
        const visualRotation = model.group.quaternion.clone().multiply(model.body.quaternion);
        const top = readDieFace(getDieShape(die.sides), visualRotation);
        const pending = model.group.userData.appearance === "rolling";
        target.dataset.appearance = String(model.group.userData.appearance);
        target.dataset.orientation = model.group.quaternion.toArray().join(",");
        target.dataset.visualOrientation = visualRotation.toArray().join(",");
        target.dataset.faceTransform = model.body.quaternion.toArray().join(",");
        target.dataset.marksTransform = model.marks.quaternion.toArray().join(",");
        target.dataset.visibleFace = model.group.userData.hidden ? "" : String(top.value);
        target.dataset.faceValue = pending || model.group.userData.hidden ? "" : String(die.value ?? "");
        target.dataset.topFace = pending || model.group.userData.hidden ? "" : String(top.value);
        target.dataset.faceAlignment = String(top.readNormal.clone().applyQuaternion(visualRotation).y);
        target.dataset.model = String(model.group.userData.model ?? "neutral");
        target.dataset.modelInstance = String(model.group.id);
      }
      const selected = latest.current.selection;
      if (selected && !gesture?.dragging && !awaitingThrow && !waiting && !preparing && !rolling) latest.current.onSelect(projectSelection(selected.ids));
    };
    const render = (now = performance.now()) => {
      if (stopped) return;
      container.dataset.frameTime = String(now);
      if (hand?.preparation.candidate) {
        let ready = hand.preparation.candidate !== null && hand.targets.size === hand.ids.length;
        const delta = Math.min(.05, Math.max(0, (now - hand.lastFrame) / 1000));
        hand.lastFrame = now;
        for (const [id, target] of hand.targets) {
          const resultId = hand.preparation.candidate?.tracks[hand.ids.indexOf(id)]?.die.id;
          const model = models.get(id) ?? (resultId ? models.get(resultId) : undefined);
          if (!model) { ready = false; continue; }
          if (latest.current.reducedMotion) model.group.quaternion.copy(target);
          else model.group.quaternion.rotateTowards(target, 10 * delta);
          if (model.group.quaternion.angleTo(target) > .0001) ready = false;
        }
        hand.ready = ready;
        container.dataset.handPreparation = ready ? "ready" : hand.preparation.candidate ? "orienting" : "loading";
        syncTargets();
        if (ready && hand.play) {
          const play = hand.play, candidate = hand.preparation.candidate!;
          hand.play = null;
          play(candidate);
        }
      }
      if (rolling) {
        const index = latest.current.reducedMotion ? Infinity : replayOffset + Math.max(0, (now - startTime) / 1000 * 120);
        let done = true;
        for (const track of tracks) {
          const model = models.get(track.die.id);
          if (!model) continue;
          const last = track.samples.length / 7 - 1;
          const sample = Math.min(index, last), a = Math.floor(sample) * 7, b = Math.min(Math.floor(sample) + 1, last) * 7;
          const alpha = sample - Math.floor(sample);
          model.group.position.fromArray(track.samples, a)
            .lerp(new T.Vector3().fromArray(track.samples, b), alpha);
          model.group.quaternion.fromArray(track.samples, a + 3)
            .slerp(new T.Quaternion().fromArray(track.samples, b + 3), alpha).normalize();
          if (index < last) done = false;
        }
        container.dataset.phase = tracks.some((track) => index < track.preparationFrames) ? "preparing" : "replay";
        if (done) {
          for (const track of tracks) {
            const model = models.get(track.die.id);
            if (model) model.group.userData.appearance = track.die.value === null ? "secret" : "numbered";
          }
          rolling = false;
          container.dataset.rolling = "false"; container.dataset.phase = "idle";
          tracks = [];
          syncTargets(); latest.current.onRolling(false);
        }
      }
      if (rolling) syncTargets();
      if (!rolling && !waiting && !preparing && selectedBodies.length) glow?.render();
      else renderer.render(scene, camera);
      if (rolling || (hand?.preparation.candidate && !hand.ready && !hand.error)) frame = requestAnimationFrame(render);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    const discardHand = () => {
      hand?.preparation.cancel(); hand = null;
      container.dataset.handPreparation = "";
    };
    const beginReplay = (dice: TrayDie[], launch: ThrowLaunch) => {
      const revision = ++simulationRevision;
      const selected = new Set(dice.map((die) => die.id));
      const stationary = currentDice.filter((die) => !selected.has(die.id)).map((die) => ({
        die, pose: poseOf(models.get(die.id)!),
      }));
      setError(""); preparing = true; rolling = false; tracks = [];
      for (const die of dice) {
        const model = models.get(die.id)!;
        modelLibrary.appearance(model, currentSkin, die.value === null ? "secret" : "rolling");
      }
      container.dataset.rolling = "false"; container.dataset.phase = "preparing";
      latest.current.onRolling(true);
      syncTargets(); schedule();
      const start = (result: ReplayTrack[], skipPreparation: boolean) => {
        if (stopped || revision !== simulationRevision) return;
        discardHand();
        tracks = result; preparing = false; rolling = true;
        replayOffset = skipPreparation ? result[0]?.preparationFrames ?? 0 : 0;
        startTime = performance.now();
        container.dataset.rolling = "true";
        schedule();
      };
      const fail = () => {
        if (stopped || revision !== simulationRevision) return;
        discardHand();
        preparing = false;
        // Preserve the committed record; never invent a fallback roll or
        // silently display an unrelated face as its result.
        for (const die of dice) {
          const model = models.get(die.id);
          if (model) modelLibrary.appearance(model, currentSkin, "secret");
        }
        container.dataset.phase = "error";
        setError("投掷动画未能准备，已保留服务器结果，请查看投掷记录。");
        latest.current.onRolling(false);
        schedule();
      };
      if (hand?.released === launch) {
        hand.play = (candidate) => start(candidate.tracks, true);
        hand.fail = fail;
        const matches = matchThrowDice(hand.source, dice);
        if (matches) hand.preparation.setDice(hand.ids.map((id) => matches.get(id)!));
        else { fail(); return; }
        if (hand.error) fail();
        else if (hand.ready && hand.preparation.candidate) start(hand.preparation.candidate.tracks, true);
        else schedule();
      } else {
        discardHand();
        void physics.build({ dice, stationary, launch }).then((result) => start(result, false), fail);
      }
    };
    const resize = () => {
      if (gesture) onPointerCancel();
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(devicePixelRatio, width < 600 ? 1.5 : 2);
      renderer.setSize(Math.round(width * ratio), Math.round(height * ratio), false);
      renderer.domElement.style.width = `${width}px`; renderer.domElement.style.height = `${height}px`;
      glow?.resize(renderer.domElement.width, renderer.domElement.height);
      camera.aspect = width / height;
      playfield.rotation.y = width < 680 ? Math.PI / 2 : 0;
      playfield.updateMatrixWorld(true);
      let distance = 13.6;
      // Fit the actual tray corners in portrait and landscape; changing only
      // the camera aspect ratio can still crop the side walls on phones.
      for (let i = 0; i < 6; i++) {
        camera.position.set(0, distance, distance * .64);
        camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        let extent = 0;
        for (const [x, z] of trayOuter) {
          const corner = new T.Vector3(x, 1.8, z).applyMatrix4(playfield.matrixWorld).project(camera);
          extent = Math.max(extent, Math.abs(corner.x), Math.abs(corner.y));
        }
        if (extent <= .92) break;
        distance *= extent / .9;
      }
      syncTargets(); schedule();
    };
    const select = (id: string, additive = false) => {
      if (rolling || preparing || awaitingThrow || latest.current.disabled) return;
      const previous = latest.current.selection?.ids ?? [];
      const linked = expandDiceSelection(currentDice, [id]);
      const ids = additive
        ? previous.includes(id) ? previous.filter((item) => !linked.includes(item)) : [...previous, ...linked]
        : linked;
      latest.current.onSelect(projectSelection(ids));
    };
    const localPoint = (event: PointerEvent) => {
      const box = renderer.domElement.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(container.clientWidth, event.clientX - box.left)),
        y: Math.max(0, Math.min(container.clientHeight, event.clientY - box.top)),
      };
    };
    const aim = (point: { x: number; y: number }) => {
      pointer.set(point.x / container.clientWidth * 2 - 1, -point.y / container.clientHeight * 2 + 1);
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
    };
    const hitDie = (point: { x: number; y: number }) => {
      aim(point);
      const hit = raycaster.intersectObjects([...models.values()].map((m) => m.group), true)[0];
      let node: T.Object3D | null = hit?.object ?? null;
      while (node && !node.userData.dieId) node = node.parent;
      return node?.userData.dieId as string | undefined;
    };
    const onPlane = (point: { x: number; y: number }, height: number) => {
      aim(point);
      const hit = raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -height), new T.Vector3());
      return hit ? playfield.worldToLocal(hit) : null;
    };
    const pick = (event: PointerEvent) => {
      const id = hitDie(localPoint(event));
      if (id) select(id, event.shiftKey || event.ctrlKey || event.metaKey);
      else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) latest.current.onSelect(null);
    };
    const heldLaunch = (): ThrowLaunch => ({
      dice: gesture!.selected.map((id) => ({
        sides: currentDice.find((die) => die.id === id)!.sides,
        // Use the original hull orientation, not our animated hand
        // orientation, so preparing never feeds back into its own physics.
        pose: { position: models.get(id)!.group.position.toArray(), quaternion: gesture!.poses.get(id)!.quaternion },
      })),
      velocity: [...gesture!.velocity],
    });
    const refreshHand = () => {
      if (!hand || gesture?.kind !== "lift") return;
      hand.preparation.setLaunch(heldLaunch());
      hand.ready = false;
      if (!hand.preparation.candidate) container.dataset.handPreparation = "loading";
      schedule();
    };
    const beginHand = () => {
      discardHand();
      const ids = [...gesture!.selected];
      const source = ids.map((id) => currentDice.find((die) => die.id === id)!);
      const stationary = currentDice.filter((die) => !ids.includes(die.id)).map((die) => ({
        die, pose: poseOf(models.get(die.id)!),
      }));
      const session: NonNullable<typeof hand> = {
        ids, source, ready: false, targets: new Map(), lastFrame: performance.now(),
        released: null, play: null, fail: null, error: null,
        preparation: new HeldReplay(physics.build, stationary, (candidate) => {
          if (stopped || hand !== session) return;
          session.error = null;
          session.targets = new Map(candidate.tracks.map((track, i) => [
            ids[i], new T.Quaternion().fromArray(track.samples, track.preparationFrames * 7 + 3).normalize(),
          ]));
          session.ready = false; session.lastFrame = performance.now();
          schedule();
        }, (error) => {
          if (stopped || hand !== session) return;
          session.error = error; session.fail?.(error);
        }),
      };
      hand = session;
      refreshHand();
      void latest.current.onPrepare(ids).then((results) => {
        if (stopped || hand !== session || !results) return;
        const matches = matchThrowDice(source, results);
        if (matches) session.preparation.setDice(ids.map((id) => matches.get(id)!));
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || rolling || preparing || awaitingThrow || latest.current.disabled) return;
      if (gesture) { onPointerCancel(); return; }
      const point = localPoint(event);
      cancelledPointer = null;
      gesture = {
        pointerId: event.pointerId, ...point, dragging: false,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        previous: latest.current.selection?.ids ?? [], selected: [],
        timer: 0, kind: "press", mouse: event.pointerType === "mouse",
        poses: new Map(), planeStart: null, planeY: 1.8, samples: [], distance: 0,
        velocity: [0, .5, 0],
      };
      const id = hitDie(point);
      if (id && gesture.previous.includes(id) && !gesture.additive && latest.current.canThrow) {
        gesture.timer = window.setTimeout(() => {
          if (!gesture || gesture.kind !== "press" || latest.current.disabled || !latest.current.canThrow) return;
          gesture.kind = "lift"; gesture.dragging = true;
          gesture.selected = [...gesture.previous];
          for (const selected of gesture.selected) {
            const model = models.get(selected);
            if (!model) continue;
            gesture.poses.set(selected, poseOf(model));
          }
          gesture.planeY = Math.max(...[...gesture.poses.values()].map((pose) => pose.position[1])) + 1.2;
          gesture.planeStart = onPlane(gesture, gesture.planeY);
          for (const selected of gesture.selected) models.get(selected)!.group.position.y += 1.2;
          container.dataset.gesture = "lift";
          latest.current.onSelect(projectSelection(gesture.selected, true));
          beginHand();
          syncTargets(); schedule();
        }, 350);
      }
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const point = localPoint(event);
      if (gesture.kind === "lift") {
        const next = onPlane(point, gesture.planeY);
        if (!next || !gesture.planeStart) return;
        const bounds = [...gesture.poses].map(([id, pose]) =>
          footprint(dieBounds(getDieShape(currentDice.find((die) => die.id === id)!.sides).geometry, pose)));
        const delta = clampTrayMove(bounds, next.x - gesture.planeStart.x, next.z - gesture.planeStart.z);
        const dx = delta.x, dz = delta.z;
        for (const [id, pose] of gesture.poses) {
          models.get(id)!.group.position.set(pose.position[0] + dx, pose.position[1] + 1.2, pose.position[2] + dz);
        }
        gesture.distance = Math.max(gesture.distance, Math.hypot(point.x - gesture.x, point.y - gesture.y));
        const now = performance.now();
        gesture.samples = [...gesture.samples.filter((sample) => now - sample.time < 120), { x: dx, z: dz, time: now }];
        const first = gesture.samples[0], last = gesture.samples.at(-1)!;
        const elapsed = Math.max(.03, (last.time - first.time) / 1000);
        gesture.velocity = [
          T.MathUtils.clamp((last.x - first.x) / elapsed, -10, 10), .5,
          T.MathUtils.clamp((last.z - first.z) / elapsed, -10, 10),
        ];
        refreshHand();
        syncTargets(); schedule();
        return;
      }
      if (!gesture.dragging && Math.hypot(point.x - gesture.x, point.y - gesture.y) < 6) return;
      clearTimeout(gesture.timer);
      if (!gesture.mouse) return;
      gesture.kind = "marquee";
      gesture.dragging = true;
      const left = Math.min(point.x, gesture.x), top = Math.min(point.y, gesture.y);
      const right = Math.max(point.x, gesture.x), bottom = Math.max(point.y, gesture.y);
      marquee.hidden = false;
      Object.assign(marquee.style, {
        left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`,
      });
      scene.updateMatrixWorld(true);
      const enclosed = currentDice.filter((die) => {
        const screen = project(die.id);
        return screen && screen.x >= left && screen.x <= right && screen.y >= top && screen.y <= bottom;
      }).map((die) => die.id);
      gesture.selected = expandDiceSelection(currentDice, gesture.additive ? [...gesture.previous, ...enclosed] : enclosed);
      latest.current.onSelect(projectSelection(gesture.selected, true));
    };
    const finishGesture = () => {
      const ended = gesture;
      clearTimeout(ended?.timer);
      gesture = null; marquee.hidden = true;
      container.dataset.gesture = "";
      if (ended && renderer.domElement.hasPointerCapture(ended.pointerId)) {
        renderer.domElement.releasePointerCapture(ended.pointerId);
      }
      return ended;
    };
    const restorePoses = (poses: Map<string, DiePose>) => {
      for (const [id, pose] of poses) {
        const model = models.get(id);
        if (model) { model.group.position.set(...pose.position); model.group.quaternion.set(...pose.quaternion); }
      }
      syncTargets(); schedule();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === cancelledPointer) { cancelledPointer = null; return; }
      if (event.button !== 0 || rolling || latest.current.disabled) { onPointerCancel(); return; }
      if (gesture && event.pointerId !== gesture.pointerId) return;
      const launch = gesture?.kind === "lift" ? heldLaunch() : null;
      const ended = finishGesture();
      if (ended?.kind === "lift") {
        if (ended.distance < 12) {
          discardHand();
          restorePoses(ended.poses);
          latest.current.onSelect(projectSelection(ended.previous));
          return;
        }
        if (hand && launch) hand.released = launch;
        awaitingThrow = true;
        // Remain in the held pose until result + complete replay are ready.
        container.dataset.gesture = "pending";
        void latest.current.onThrow(ended.selected, launch!).then((saved) => {
          if (stopped) return;
          awaitingThrow = false; container.dataset.gesture = "";
          if (!saved) {
            discardHand();
            restorePoses(ended.poses);
            latest.current.onSelect(projectSelection(ended.previous));
          }
        });
      } else if (ended?.dragging) {
        latest.current.onSelect(projectSelection(ended.selected));
      } else pick(event);
    };
    const onPointerCancel = () => {
      const ended = finishGesture();
      if (ended) {
        discardHand();
        cancelledPointer = ended.pointerId;
        restorePoses(ended.poses);
        latest.current.onSelect(projectSelection(ended.previous));
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture) {
        event.preventDefault(); event.stopPropagation(); onPointerCancel();
      }
    };
    const clearModels = () => {
      for (const model of models.values()) { playfield.remove(model.group); disposeModel(model.group); }
      models.clear();
    };
    controller.current = {
      select,
      allocate,
      update(next) {
        const newThrow = next.throwId !== null && next.throwId !== previousThrow;
        if (next.waiting && !newThrow && !rolling && !preparing) container.dataset.phase = "request";
        if (!next.waiting && waiting && !newThrow && !rolling && !preparing) container.dataset.phase = "idle";
        waiting = next.waiting;
        const resultDice = newThrow ? next.dice.filter((die) => die.rollId === next.throwId!.split(":")[0]) : [];
        const matches = newThrow && next.waitingIds.length
          ? matchThrowDice(currentDice.filter((die) => next.waitingIds.includes(die.id)), resultDice) : null;
        const inheritedPoses = new Map<string, DiePose>();
        if (matches) {
          for (const [oldId, die] of matches) {
            const model = models.get(oldId);
            if (model) {
              inheritedPoses.set(die.id, poseOf(model));
            }
          }
          // Transfer the existing model instance to its authoritative ID.
          // No public die is rebuilt or relabelled at response time.
          for (const [oldId, die] of matches) {
            const model = models.get(oldId);
            if (!model) continue;
            models.delete(oldId); models.set(die.id, model); model.group.userData.dieId = die.id;
          }
        }
        const changed = currentDice !== next.dice || currentSkin !== next.skin;
        if (changed) {
          const previousPoses = new Map([...models].map(([id, model]) => [id, poseOf(model)]));
          const skinChanged = currentSkin !== next.skin;
          currentDice = next.dice; currentSkin = next.skin;
          for (const [id, model] of models) {
            if (!currentDice.some((die) => die.id === id)) {
              playfield.remove(model.group); disposeModel(model.group); models.delete(id);
            }
          }
          for (const [index, die] of currentDice.entries()) {
            const existing = models.get(die.id);
            if (existing && existing.group.userData.sides === die.sides &&
              (inheritedPoses.has(die.id) || existing.group.userData.hidden === (!!die.rollId && die.value === null))) {
              if (die.rollId && die.value === null) modelLibrary.appearance(existing, next.skin, "secret");
              if (skinChanged) {
                modelLibrary.appearance(existing, next.skin, existing.group.userData.appearance as DieAppearance);
              }
              continue;
            }
            if (existing) { playfield.remove(existing.group); disposeModel(existing.group); }
            const model = modelLibrary.create(die, next.skin);
            model.group.position.set((index % 5 - Math.min(currentDice.length - 1, 4) / 2) * 1.65, .63,
              (Math.floor(index / 5) - (Math.ceil(currentDice.length / 5) - 1) / 2) * 1.55);
            if (die.value !== null) {
              const previewShape = getDieShape(die.sides);
              const face = previewShape.faces.find((f) => f.value === die.value) ?? previewShape.faces[0];
              model.group.quaternion.setFromUnitVectors(face.readNormal, new T.Vector3(0, 1, 0));
            } else model.group.rotation.set(.08, index * .48 + .3, .06);
            const pose = inheritedPoses.get(die.id) ?? previousPoses.get(die.id) ?? die.initialPose;
            if (pose) { model.group.position.set(...pose.position); model.group.quaternion.set(...pose.quaternion); }
            if (matches && [...matches.values()].some((result) => result.id === die.id)) {
              modelLibrary.appearance(model, next.skin, die.value === null ? "secret" : "rolling");
            }
            playfield.add(model.group); models.set(die.id, model);
          }
          if (skinChanged) {
            tray.traverse((node) => {
              if (node instanceof T.Mesh && node.userData.surfaceSlot) {
                node.material = surfaces.material(node.userData.surfaceSlot, next.skin);
              }
            });
          }
        }
        previousThrow = next.throwId;
        if (newThrow) {
          if (resultDice.length) {
            beginReplay(resultDice, next.throwLaunch ?? {
              dice: resultDice.map((die, index) => ({ sides: die.sides, pose: {
                position: [-3.7 + (index % 5) * 1.6, 2 + Math.floor(index / 5) * 1.15, -2 + (Math.floor(index / 5) % 2) * 1.6],
                quaternion: models.get(die.id)!.group.quaternion.toArray(),
              } })),
              velocity: [2.4, .5, 2.5],
            });
          } else {
            container.dataset.phase = "idle"; latest.current.onRolling(false);
          }
        }
        selectedBodies = [...models].filter(([id]) => !rolling && next.selection?.ids.includes(id))
          .map(([, model]) => model.body);
        if (selectedBodies.length && !glow) {
          glow = createSelectionGlow(renderer, scene, camera);
          glow.resize(renderer.domElement.width, renderer.domElement.height);
        }
        glow?.select(selectedBodies);
        scene.updateMatrixWorld(true);
        if (!rolling) syncTargets();
        schedule();
      },
      dispose() {
        stopped = true; cancelAnimationFrame(frame);
        discardHand();
        simulationRevision++; physics.dispose();
        finishGesture();
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
        renderer.domElement.removeEventListener("lostpointercapture", onPointerCancel);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("blur", onPointerCancel);
        observer.disconnect(); clearModels(); disposeModel(tray);
        modelLibrary.dispose(); surfaces.dispose();
        glow?.dispose();
        environment.dispose();
        light.shadow.dispose();
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      },
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.domElement.addEventListener("lostpointercapture", onPointerCancel);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onPointerCancel);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    controller.current.update(latest.current);
    container.dataset.ready = "true";
    schedule();
    return () => { controller.current?.dispose(); controller.current = null; };
  }, []);
  // Synchronize newly mounted pick targets before paint, including when
  // reduced motion lets the next interaction happen without an animation.
  useLayoutEffect(() => { controller.current?.update(props); }, [
    props.dice, props.skin, props.throwId, props.selection?.ids, props.reducedMotion,
    props.throwLaunch, props.waiting, props.waitingIds,
  ]);
  return <div className="dice-scene dice-tray-scene" ref={host} aria-label="3D 骰盘">
    <div className="dice-pick-targets">
      {props.dice.map((die, index) => <button type="button" key={die.id} data-die-id={die.id}
        data-face-value={die.value ?? ""} className="dice-pick-target" aria-pressed={!!props.selection?.ids.includes(die.id)}
        aria-label={`骰子 ${index + 1}，d${die.sides}${die.sides === 100 ? "，十位" : ""}${die.rollId ? die.value === null ? "，暗骰" : `，点数 ${die.sides === 100 ? (die.value - 1) * 10 : die.value}` : ""}`}
        onClick={(event) => controller.current?.select(die.id, event.shiftKey || event.ctrlKey || event.metaKey)} disabled={props.disabled} />)}
    </div>
    <div className="dice-selection-box" hidden aria-hidden="true" />
    {error && <p className="dice-scene-fallback" role="alert">{error}</p>}
    {failed && <p className="dice-scene-fallback">此设备无法显示 3D 骰盘，请使用公式投掷。</p>}
  </div>;
}

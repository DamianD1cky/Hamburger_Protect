import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ThrowLaunch } from "./trayPhysics";
import { createModelLibrary, disposeModel, getDieShape, readDieFace, faceCorrection, type TrayDie } from "./trayModels";
import { createSurfaceLibrary } from "./surfaceMaterials";
import { createProceduralTray } from "./proceduralTray";
import { createPhysicsClient } from "./physicsClient";
import type { ReplayTrack } from "./physicsProtocol";
import { expandDiceSelection } from "./traySelection";
import { createSelectionGlow } from "./selectionGlow";
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
  reducedMotion: boolean;
  onSelect: (selection: DiceSelection | null) => void;
  onRolling: (rolling: boolean) => void;
  onThrow: (ids: string[], launch: ThrowLaunch) => Promise<boolean>;
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
    let tracks: (ReplayTrack & { rotation: T.Quaternion })[] = [];
    const physics = createPhysicsClient();
    let simulationRevision = 0;
    let preparing = false;
    let startTime = 0;
    let frame = 0;
    let stopped = false;
    let rolling = false;
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
        const top = readDieFace(getDieShape(die.sides), model.group.quaternion);
        target.dataset.topFace = die.rollId && die.value === null ? "" : String(top.value);
        target.dataset.model = String(model.group.userData.model ?? "neutral");
      }
      const selected = latest.current.selection;
      if (selected && !gesture?.dragging && !awaitingThrow) latest.current.onSelect(projectSelection(selected.ids));
    };
    const render = (now = performance.now()) => {
      if (stopped) return;
      if (rolling && !preparing) {
        const elapsed = (now - startTime) / 1000;
        const index = Math.max(0, Math.floor(elapsed * 120));
        let done = true;
        for (const track of tracks) {
          const model = models.get(track.die.id);
          if (!model) continue;
          const last = track.samples.length / 7 - 1;
          const offset = Math.min(index, last) * 7;
          model.group.position.fromArray(track.samples, offset);
          model.group.quaternion.fromArray(track.samples, offset + 3).multiply(track.rotation);
          if (index < last) done = false;
        }
        if (done) {
          rolling = false; container.dataset.rolling = "false";
          latest.current.onRolling(false); syncTargets();
        }
      }
      if (!rolling && selectedBodies.length) glow?.render();
      else renderer.render(scene, camera);
      if (rolling && !preparing) frame = requestAnimationFrame(render);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
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
      if (rolling || awaitingThrow || latest.current.disabled) return;
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
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || rolling || awaitingThrow || latest.current.disabled) return;
      if (gesture) { onPointerCancel(); return; }
      const point = localPoint(event);
      cancelledPointer = null;
      gesture = {
        pointerId: event.pointerId, ...point, dragging: false,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        previous: latest.current.selection?.ids ?? [], selected: [],
        timer: 0, kind: "press", mouse: event.pointerType === "mouse",
        poses: new Map(), planeStart: null, planeY: 1.8, samples: [], distance: 0,
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
      const ended = finishGesture();
      if (ended?.kind === "lift") {
        if (ended.distance < 12) {
          restorePoses(ended.poses);
          latest.current.onSelect(projectSelection(ended.previous));
          return;
        }
        const recent = ended.samples.filter((sample) => performance.now() - sample.time < 160);
        const first = recent[0], last = recent.at(-1);
        const elapsed = first && last ? Math.max(.03, (last.time - first.time) / 1000) : 1;
        const velocity: ThrowLaunch["velocity"] = [
          first && last ? T.MathUtils.clamp((last.x - first.x) / elapsed, -10, 10) : 0,
          .5,
          first && last ? T.MathUtils.clamp((last.z - first.z) / elapsed, -10, 10) : 0,
        ];
        const launch: ThrowLaunch = {
          dice: ended.selected.map((id) => ({ sides: currentDice.find((die) => die.id === id)!.sides, pose: poseOf(models.get(id)!) })),
          velocity,
        };
        awaitingThrow = true;
        container.dataset.gesture = "pending";
        void latest.current.onThrow(ended.selected, launch).then((saved) => {
          if (stopped) return;
          awaitingThrow = false; container.dataset.gesture = "";
          if (!saved) {
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
        const changed = currentDice !== next.dice || currentSkin !== next.skin;
        if (changed) {
          const previousDice = new Map(currentDice.map((die) => [die.id, die]));
          const previousPoses = new Map([...models].map(([id, model]) => [id, poseOf(model)]));
          const skinChanged = currentSkin !== next.skin;
          currentDice = next.dice; currentSkin = next.skin;
          for (const [id, model] of models) {
            if (!currentDice.some((die) => die.id === id)) {
              playfield.remove(model.group); disposeModel(model.group); models.delete(id);
            }
          }
          for (const [index, die] of currentDice.entries()) {
            const previous = previousDice.get(die.id);
            const existing = models.get(die.id);
            if (existing && previous?.sides === die.sides &&
              existing.group.userData.hidden === (!!die.rollId && die.value === null)) {
              if (skinChanged) {
                existing.body.material = surfaces.material("body", next.skin);
                const marks = existing.group.getObjectByName("marks") as T.Mesh;
                marks.material = surfaces.material("marks", next.skin, die.sides !== 6 || existing.group.userData.hidden);
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
            const pose = previousPoses.get(die.id) ?? die.initialPose;
            if (pose) { model.group.position.set(...pose.position); model.group.quaternion.set(...pose.quaternion); }
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
        const newThrow = next.throwId !== null && next.throwId !== previousThrow;
        previousThrow = next.throwId;
        if (newThrow) {
          const revision = ++simulationRevision;
          const rollId = next.throwId!.split(":")[0];
          const moving = currentDice.filter((die) => die.rollId === rollId);
          const stationary = currentDice.filter((die) => die.rollId !== rollId).map((die) => {
            const model = models.get(die.id)!;
            return {
              die,
              pose: {
                position: model.group.position.toArray() as [number, number, number],
                quaternion: model.group.quaternion.toArray() as [number, number, number, number],
              },
            };
          });
          preparing = true; rolling = true;
          container.dataset.rolling = "true";
          latest.current.onRolling(true);
          void physics.build({ dice: moving, stationary, launch: next.throwLaunch }).then((result) => {
            if (stopped || revision !== simulationRevision) return;
            tracks = result.map((track) => ({ ...track, rotation: new T.Quaternion(...track.correction) }));
            preparing = false;
            if (next.reducedMotion) {
              tracks.forEach((track) => {
                const model = models.get(track.die.id)!;
                const offset = track.samples.length - 7;
                model.group.position.fromArray(track.samples, offset);
                model.group.quaternion.fromArray(track.samples, offset + 3).multiply(track.rotation);
              });
              rolling = false;
              container.dataset.rolling = "false";
              latest.current.onRolling(false);
              syncTargets();
            } else { startTime = performance.now(); }
            schedule();
          }).catch(() => {
            if (stopped || revision !== simulationRevision) return;
            preparing = false; rolling = false;
            container.dataset.rolling = "false";
            latest.current.onRolling(false);
            for (const die of moving) {
              const model = models.get(die.id);
              if (!model || die.value === null) continue;
              const shape = getDieShape(die.sides);
              const value = die.sides === "F" ? die.value < 0 ? 1 : die.value === 0 ? 3 : 5 : die.value;
              model.group.quaternion.multiply(faceCorrection(shape, model.group.quaternion, value));
            }
            setError("物理动画暂时不可用，投掷结果已保留。");
            syncTargets(); schedule();
          });
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
  useLayoutEffect(() => { controller.current?.update(props); }, [props.dice, props.skin, props.throwId, props.selection?.ids, props.reducedMotion, props.throwLaunch]);
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

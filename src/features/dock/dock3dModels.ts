import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type Dock3DKind = "note" | "sticker" | "archive" | "dice";

function makeNoteLinesTexture(): T.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "#fff08a");
  grad.addColorStop(0.65, "#f7d44c");
  grad.addColorStop(1, "#e8b92c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle top adhesive band
  ctx.fillStyle = "rgba(180, 128, 12, 0.16)";
  ctx.fillRect(0, 0, 256, 44);

  // Clean horizontal ruled lines + stylized ink strokes
  ctx.strokeStyle = "rgba(120, 82, 16, 0.24)";
  ctx.lineWidth = 3;
  for (let y = 76; y <= 216; y += 34) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(228, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(56, 38, 16, 0.55)";
  ctx.fillRect(32, 62, 124, 9);
  ctx.fillStyle = "rgba(56, 38, 16, 0.35)";
  ctx.fillRect(32, 98, 178, 7);
  ctx.fillRect(32, 132, 152, 7);
  ctx.fillRect(32, 166, 112, 7);

  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

function makeD20NumberTexture(): T.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#fff8dc";
  ctx.font = "700 62px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("20", 64, 68);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

function roundedSquareShape(size: number, radius: number): T.Shape {
  const s = new T.Shape();
  const h = size / 2;
  const r = Math.min(radius, h * 0.45);
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

function buildNoteModel(): { root: T.Group; disposables: Array<{ dispose: () => void }> } {
  const root = new T.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const padShape = roundedSquareShape(1.42, 0.14);
  const stackGeo = new T.ExtrudeGeometry(padShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 3,
  });
  stackGeo.center();
  const stackMat = new T.MeshStandardMaterial({
    color: "#e2b228",
    roughness: 0.52,
    metalness: 0.04,
  });
  const stackMesh = new T.Mesh(stackGeo, stackMat);
  stackMesh.position.set(0, -0.04, -0.08);
  root.add(stackMesh);
  disposables.push(stackGeo, stackMat);

  // Curled top sticky note leaf
  const topTex = makeNoteLinesTexture();
  const leafGeo = new T.PlaneGeometry(1.42, 1.42, 14, 14);
  const pos = leafGeo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Gentle upward curl on bottom-right corner
    const cornerDist = Math.max(0, (x + 0.15) * 0.72 + (-y + 0.15) * 0.72);
    const lift = Math.pow(cornerDist, 2.35) * 0.36;
    pos.setZ(i, lift);
  }
  leafGeo.computeVertexNormals();
  const leafMat = new T.MeshPhysicalMaterial({
    map: topTex,
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.18,
    side: T.DoubleSide,
  });
  const leafMesh = new T.Mesh(leafGeo, leafMat);
  leafMesh.position.set(0, -0.02, 0.085);
  root.add(leafMesh);
  disposables.push(topTex, leafGeo, leafMat);

  // Sculpted 3D glossy red pushpin
  const pinGroup = new T.Group();
  const pinPoints = [
    new T.Vector2(0.015, 0.0),
    new T.Vector2(0.20, 0.02),
    new T.Vector2(0.22, 0.07),
    new T.Vector2(0.11, 0.13),
    new T.Vector2(0.12, 0.28),
    new T.Vector2(0.24, 0.34),
    new T.Vector2(0.24, 0.41),
    new T.Vector2(0.0, 0.43),
  ];
  const pinGeo = new T.LatheGeometry(pinPoints, 24);
  const pinMat = new T.MeshPhysicalMaterial({
    color: "#e62e3d",
    roughness: 0.16,
    metalness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const pinHead = new T.Mesh(pinGeo, pinMat);
  pinHead.rotation.x = Math.PI / 2;
  pinGroup.add(pinHead);

  const needleGeo = new T.CylinderGeometry(0.022, 0.008, 0.18, 12);
  const needleMat = new T.MeshStandardMaterial({
    color: "#d9e2ea",
    metalness: 0.92,
    roughness: 0.18,
  });
  const needle = new T.Mesh(needleGeo, needleMat);
  needle.rotation.x = Math.PI / 2;
  needle.position.z = -0.08;
  pinGroup.add(needle);

  pinGroup.position.set(0.02, 0.52, 0.12);
  pinGroup.rotation.set(-0.28, 0.12, 0.0);
  root.add(pinGroup);
  disposables.push(pinGeo, pinMat, needleGeo, needleMat);

  root.rotation.set(-0.18, 0.24, -0.06);
  return { root, disposables };
}

function buildStickerModel(): { root: T.Group; disposables: Array<{ dispose: () => void }> } {
  const root = new T.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Glossy vinyl white outer backing rim
  const rimGeo = new T.CylinderGeometry(0.86, 0.86, 0.09, 40);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new T.MeshPhysicalMaterial({
    color: "#fff8f2",
    roughness: 0.24,
    clearcoat: 0.85,
  });
  const rimMesh = new T.Mesh(rimGeo, rimMat);
  root.add(rimMesh);
  disposables.push(rimGeo, rimMat);

  // Coral-rose glossy inner face disc
  const faceGeo = new T.CylinderGeometry(0.75, 0.75, 0.11, 40);
  faceGeo.rotateX(Math.PI / 2);
  const faceMat = new T.MeshPhysicalMaterial({
    color: "#ff5c6c",
    roughness: 0.18,
    metalness: 0.06,
    clearcoat: 1.0,
    iridescence: 0.38,
    iridescenceIOR: 1.45,
  });
  const faceMesh = new T.Mesh(faceGeo, faceMat);
  faceMesh.position.z = 0.015;
  root.add(faceMesh);
  disposables.push(faceGeo, faceMat);

  // Embossed 3D golden smiley face relief
  const goldMat = new T.MeshPhysicalMaterial({
    color: "#ffe074",
    roughness: 0.22,
    metalness: 0.45,
    clearcoat: 0.9,
  });
  const eyeGeo = new T.SphereGeometry(0.095, 16, 16);
  const leftEye = new T.Mesh(eyeGeo, goldMat);
  leftEye.position.set(-0.24, 0.15, 0.09);
  leftEye.scale.set(1, 1.15, 0.55);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.24;
  root.add(leftEye, rightEye);

  const smileGeo = new T.TorusGeometry(0.28, 0.055, 14, 28, Math.PI);
  const smile = new T.Mesh(smileGeo, goldMat);
  smile.position.set(0, -0.02, 0.085);
  smile.rotation.z = Math.PI;
  root.add(smile);

  // Cute peeled corner curl tab at top-right
  const peelGeo = new T.ConeGeometry(0.32, 0.36, 3);
  const peelMat = new T.MeshPhysicalMaterial({
    color: "#fff4eb",
    roughness: 0.32,
    clearcoat: 0.6,
  });
  const peel = new T.Mesh(peelGeo, peelMat);
  peel.position.set(0.56, 0.54, 0.14);
  peel.rotation.set(0.45, 0.35, -0.78);
  root.add(peel);

  disposables.push(goldMat, eyeGeo, smileGeo, peelGeo, peelMat);
  root.rotation.set(-0.14, -0.22, 0.08);
  return { root, disposables };
}

function buildArchiveModel(): { root: T.Group; disposables: Array<{ dispose: () => void }> } {
  const root = new T.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const kraftMat = new T.MeshStandardMaterial({
    color: "#9a6835",
    roughness: 0.62,
    metalness: 0.06,
  });
  const kraftDarkMat = new T.MeshStandardMaterial({
    color: "#6e4620",
    roughness: 0.68,
    metalness: 0.05,
  });
  const brassMat = new T.MeshPhysicalMaterial({
    color: "#e2b75b",
    roughness: 0.26,
    metalness: 0.88,
    clearcoat: 0.35,
  });

  // Main banker's dossier box body
  const boxGeo = new T.BoxGeometry(1.48, 0.94, 1.06);
  const boxMesh = new T.Mesh(boxGeo, kraftMat);
  boxMesh.position.set(0, -0.18, 0);
  root.add(boxMesh);

  // Dark inner recess at top
  const innerGeo = new T.BoxGeometry(1.36, 0.12, 0.94);
  const innerMesh = new T.Mesh(innerGeo, kraftDarkMat);
  innerMesh.position.set(0, 0.27, 0);
  root.add(innerMesh);

  // 3 staggered colored dossier folders peeking out
  const folderSpecs = [
    { color: "#f6e5b8", z: -0.24, y: 0.42, x: -0.16, rot: -0.05 },
    { color: "#d64d4d", z: 0.0, y: 0.47, x: 0.04, rot: 0.02 },
    { color: "#4e8cd9", z: 0.22, y: 0.40, x: 0.18, rot: 0.06 },
  ];
  const folderGeo = new T.BoxGeometry(1.22, 0.56, 0.08);
  const tabGeo = new T.BoxGeometry(0.42, 0.14, 0.085);
  for (const spec of folderSpecs) {
    const fMat = new T.MeshStandardMaterial({ color: spec.color, roughness: 0.55 });
    const fGroup = new T.Group();
    const sheet = new T.Mesh(folderGeo, fMat);
    const tab = new T.Mesh(tabGeo, fMat);
    tab.position.set(spec.x, 0.32, 0);
    fGroup.add(sheet, tab);
    fGroup.position.set(0, spec.y - 0.12, spec.z);
    fGroup.rotation.z = spec.rot;
    root.add(fGroup);
    disposables.push(fMat);
  }

  // Slightly tilted lid resting back
  const lidGeo = new T.BoxGeometry(1.56, 0.16, 1.12);
  const lidMesh = new T.Mesh(lidGeo, kraftDarkMat);
  lidMesh.position.set(0, 0.52, -0.44);
  lidMesh.rotation.x = -0.58;
  root.add(lidMesh);

  // Brass nameplate frame + ivory card + pull knob on front face
  const plateGeo = new T.BoxGeometry(0.68, 0.34, 0.06);
  const plate = new T.Mesh(plateGeo, brassMat);
  plate.position.set(0, -0.08, 0.54);
  root.add(plate);

  const cardGeo = new T.BoxGeometry(0.54, 0.22, 0.07);
  const cardMat = new T.MeshStandardMaterial({ color: "#fbf3df", roughness: 0.7 });
  const card = new T.Mesh(cardGeo, cardMat);
  card.position.set(0, -0.08, 0.545);
  root.add(card);

  const knobGeo = new T.SphereGeometry(0.085, 16, 16);
  const knob = new T.Mesh(knobGeo, brassMat);
  knob.position.set(0, -0.38, 0.56);
  root.add(knob);

  disposables.push(
    kraftMat,
    kraftDarkMat,
    brassMat,
    boxGeo,
    innerGeo,
    folderGeo,
    tabGeo,
    lidGeo,
    plateGeo,
    cardGeo,
    cardMat,
    knobGeo,
  );
  root.rotation.set(0.24, -0.42, 0.04);
  return { root, disposables };
}

function buildDiceModel(): { root: T.Group; disposables: Array<{ dispose: () => void }> } {
  const root = new T.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const bodyGeo = new T.IcosahedronGeometry(0.96, 0);
  const bodyMat = new T.MeshPhysicalMaterial({
    color: "#1b67e6",
    roughness: 0.14,
    metalness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    iridescence: 0.58,
    iridescenceIOR: 1.5,
  });
  const bodyMesh = new T.Mesh(bodyGeo, bodyMat);
  root.add(bodyMesh);

  // Gleaming golden facet edge lines
  const edgesGeo = new T.EdgesGeometry(bodyGeo);
  const edgesMat = new T.LineBasicMaterial({
    color: "#ffe192",
    transparent: true,
    opacity: 0.88,
  });
  const edgeLines = new T.LineSegments(edgesGeo, edgesMat);
  edgeLines.scale.setScalar(1.012);
  root.add(edgeLines);

  // Subtle gilded "20" emblem oriented on the front-facing facet
  const numTex = makeD20NumberTexture();
  const numGeo = new T.PlaneGeometry(0.56, 0.56);
  const numMat = new T.MeshBasicMaterial({
    map: numTex,
    transparent: true,
    depthWrite: false,
  });
  const numMesh = new T.Mesh(numGeo, numMat);
  numMesh.position.set(0, 0.03, 0.84);
  root.add(numMesh);

  disposables.push(bodyGeo, bodyMat, edgesGeo, edgesMat, numTex, numGeo, numMat);
  root.rotation.set(0.22, 0.34, -0.08);
  return { root, disposables };
}

class Dock3DStudio {
  private readonly renderer: T.WebGLRenderer;
  private readonly camera: T.PerspectiveCamera;
  private readonly environment: T.WebGLRenderTarget;
  private readonly scenes = new Map<
    Dock3DKind,
    {
      scene: T.Scene;
      root: T.Group;
      baseRot: T.Euler;
      disposables: Array<{ dispose: () => void }>;
    }
  >();

  constructor() {
    const renderer = new T.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
      preserveDrawingBuffer: true,
    });
    renderer.setSize(144, 144, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    this.renderer = renderer;

    const pmrem = new T.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();

    const camera = new T.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(0, 0.22, 4.15);
    camera.lookAt(0, 0, 0);
    this.camera = camera;
  }

  private getEntry(kind: Dock3DKind) {
    const existing = this.scenes.get(kind);
    if (existing) return existing;

    const scene = new T.Scene();
    scene.environment = this.environment.texture;
    scene.environmentIntensity = 0.78;

    const keyLight = new T.DirectionalLight(0xfff1dc, 3.1);
    keyLight.position.set(-2.5, 4.2, 4.5);
    const fillLight = new T.HemisphereLight(0xdcebff, 0x3b2d22, 1.5);
    const rimLight = new T.DirectionalLight(0x98c9ff, 1.8);
    rimLight.position.set(3.2, 2.0, -3.0);
    scene.add(keyLight, fillLight, rimLight);

    const built =
      kind === "note"
        ? buildNoteModel()
        : kind === "sticker"
          ? buildStickerModel()
          : kind === "archive"
            ? buildArchiveModel()
            : buildDiceModel();
    scene.add(built.root);
    const entry = {
      scene,
      root: built.root,
      baseRot: built.root.rotation.clone(),
      disposables: built.disposables,
    };
    this.scenes.set(kind, entry);
    return entry;
  }

  renderToCanvas(
    target: HTMLCanvasElement,
    kind: Dock3DKind,
    hoverProgress: number,
    phase: number,
  ): boolean {
    const entry = this.getEntry(kind);
    const wobble = hoverProgress;
    entry.root.rotation.set(
      entry.baseRot.x + Math.sin(phase * 2.1) * 0.14 * wobble,
      entry.baseRot.y + Math.sin(phase * 1.4) * 0.42 * wobble + 0.18 * wobble,
      entry.baseRot.z + Math.cos(phase * 1.8) * 0.08 * wobble,
    );
    entry.root.position.y = Math.sin(phase * 2.6) * 0.07 * wobble;
    const scale = 1 + 0.06 * wobble;
    entry.root.scale.setScalar(scale);

    this.renderer.render(entry.scene, this.camera);

    if (target.width !== 144 || target.height !== 144) {
      target.width = 144;
      target.height = 144;
    }
    const ctx = target.getContext("2d");
    if (!ctx) return false;
    ctx.clearRect(0, 0, 144, 144);
    ctx.drawImage(this.renderer.domElement, 0, 0, 144, 144);
    return true;
  }
}

let studioSingleton: Dock3DStudio | null | false = null;

function getDock3DStudio(): Dock3DStudio | null {
  if (studioSingleton === false) return null;
  if (studioSingleton) return studioSingleton;
  if (typeof document === "undefined") return null;
  try {
    studioSingleton = new Dock3DStudio();
    return studioSingleton;
  } catch {
    studioSingleton = false;
    return null;
  }
}

export function renderDock3DIcon(
  target: HTMLCanvasElement,
  kind: Dock3DKind,
  hoverProgress = 0,
  phase = 0,
): boolean {
  const studio = getDock3DStudio();
  if (!studio) return false;
  return studio.renderToCanvas(target, kind, hoverProgress, phase);
}

# 自制骰子与骰盘

运行时不使用 `assets/dice/*.glb` 或 `md/model` 中的导入模型。旧文件保留为历史制作资料，不进入 Vite 构建。当前模型完全由 TypeScript 生成，纹理在本机 Canvas 中生成。

## 几何与物理

`diceShapes.ts` 与 `modelGeometry.json` 定义规则凸多面体的碰撞顶点、面方向和编号。`proceduralGeometry.ts` 在该轮廓内生成平面、圆弧边和球面角，d6 的点数是带圆滑洞口的真实凹槽。

其他骰型使用独立字面网格：所有面合并为一份 geometry、一个 draw call。d4 在三个相邻面重复显示顶点编号；d10 显示 0–9，0 代表 10；d100 十位显示 00–90；Fate 显示 −/•/+。暗骰生成没有点数凹槽的几何，仅显示问号。

`proceduralTray.ts` 用连续六边形截面生成木框、金属收边、毛毡底面和两圈缝线。碰撞继续使用简单底面和六面墙，不使用视觉网格计算碰撞。

光学粗糙度和金属度只改变观感，不改变物理摩擦、弹性或服务器点数。

投掷先立即抬起并转动所选骰子，同时请求服务器点数，随后在 Worker 中准备物理回放。等待期间不生成或展示本地临时结果，请求失败恢复原姿态。物理回放末尾用 0.3 秒平稳收尾，将朝上读数对齐并分配不重叠的地面空位；未重投的骰子保持原位置。密集骰池需要时统一调整移动骰子的朝向和摆位，避免边角卡住或堆叠。

## 材质槽

每个网格都有稳定的 `name` 和 `userData.surfaceSlot`：

| 槽 | 用途 |
| --- | --- |
| `body` | 骰身 |
| `marks` | 点数或数字 |
| `rim` | 骰盘框体 |
| `lining` | 内衬 |
| `trim` | 金属收边 |
| `stitch` | 缝线 |

所有表面都有 UV 和法线。骰身的平面使用每面 UV；圆角使用局部边/角 UV。普通细纹可以直接替换，要求完整跨面图案时需按该 UV 设计图集或使用三平面 shader 投影。

`createSurfaceLibrary()` 和 `createModelLibrary()` 由每个打开的骰盘拥有，同一皮肤共享材质、纹理和几何。关闭后统一释放。移除一颗骰子只移除它的实例，不能 dispose 其他骰子仍在使用的资源。

## 注册材质预设

`surfaceMaterials.ts` 提供 `registerSurfaceSkin()`；无需修改建模代码：

```ts
const unregister = registerSurfaceSkin("bronze", {
  body: {
    color: "#b98a50",
    metalness: 1,
    roughness: 0.3,
    physical: false,
    map: null,
    bumpMap: null,
  },
  marks: { color: "#29251f", metalness: 0.1 },
  lining: { color: "#344138", roughness: 0.98 },
});
```

将皮肤 ID 传给 `DiceScene.skin` 即可；应用内置的选择菜单目前包含青玉、象牙、黑曜石和霓虹。新增菜单选项使用同一注册 ID。预设不再需要时调用 `unregister()`。

支持 `map`、`normalMap`、`roughnessMap`、`metalnessMap`、`bumpMap`。注册时未指定的 map 使用默认纹理，显式设为 `null` 则移除。传入的外部纹理由调用者管理，材质库不自动销毁它们。

现有皮肤之间切换只更换材质引用，保持几何、位置、旋转和投掷记录。替换材质必须保持不透明骰身，以免通过透明表面暴露暗骰的呈现信息。

## 数字图集

默认图集是 1024×1024、8×8 格，每格 128×128，颜色为白色、背景透明；最终颜色由 `marks.color` 决定。

| 图集序号（从 0 开始） | 内容 |
| --- | --- |
| 0–20 | 0–20 |
| 21–30 | 00、10、20 … 90 |
| 31 | ? |
| 32–34 | −、•、+ |

替换 `marks.map` 时保留上述格位和透明背景。图集沿用普通 CanvasTexture/Texture 的方向；这不是 glTF UV，不应沿用旧 glTF 纹理的 `flipY=false`。d6 的实体点数使用单独的 `marks` 材质，不依赖图集。

底色纹理使用 sRGB，法线/粗糙度/金属度/凹凸贴图为非颜色数据。运行时生成的细节纹理为 256×256；数字图集只创建一次，各骰面不单独分配纹理。

## shader 扩展或完全替换材质

默认使用 Three.js 内置 PBR；需要局部特殊效果时注册一个明确的 shader key：

```ts
registerSurfaceSkin("pulse", {
  body: {
    shader: {
      key: "pulse-v1",
      apply(shader) {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          "#include <color_fragment>\ndiffuseColor.rgb *= vec3(1.0, 0.85, 0.75);",
        );
      },
    },
  },
});
```

改变 shader 代码时更新 key，改变 uniform 数值时无需生成新材质。连续动画需要主动请求场景渲染；当前骰盘静止时按需渲染，不会为了动画皮肤自动启动常驻循环。

也可以根据 `mesh.userData.surfaceSlot` 直接将 `mesh.material` 换成自己的 `ShaderMaterial` 或其他 Three.js 材质。完全替换时，调用者负责光照、色彩空间、阴影和资源释放。UI 仍可切回内置皮肤。

## 验证

`npm run check:dice` 包含碰撞对称性、实际读数、UV/法线完整性、隐藏模型、低面数预算和实例资源共享测试。界面回归覆盖桌面/手机的选择、换肤、局部重投、暗骰和长按拖起投掷。

最大 d6 约 3,050 个三角面；其余类型约 268–1,260 个三角面。材质有清漆、纹理和动态阴影时仍需在目标手机上测帧率，不能只依据三角面数判定性能。

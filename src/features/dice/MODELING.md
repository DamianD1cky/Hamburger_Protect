# 自制骰子与骰盘

运行时不使用 `assets/dice/*.glb` 或 `md/model` 中的导入模型。旧文件保留为历史制作资料，不进入 Vite 构建。当前模型完全由 TypeScript 生成，纹理在本机 Canvas 中生成。

## 几何与物理

`diceShapes.ts` 与 `modelGeometry.json` 定义规则凸多面体的碰撞顶点、面方向和编号。`proceduralGeometry.ts` 在该轮廓内生成平面、圆弧边和球面角，d6 的点数是带圆滑洞口的真实凹槽。

其他骰型使用独立字面网格：所有面合并为一份 geometry、一个 draw call。d4 在三个相邻面重复显示顶点编号；d10 显示 0–9，0 代表 10；d100 十位显示 00–90；Fate 显示 −/•/+。暗骰生成没有点数凹槽的几何，仅显示问号。

`proceduralTray.ts` 用连续六边形截面生成木框、金属收边、毛毡底面和两圈缝线。碰撞继续使用简单底面和六面墙，不使用视觉网格计算碰撞。

光学粗糙度和金属度只改变观感，不改变物理摩擦、弹性或服务器点数。

投掷采用结果先行。`PreparedRoll` 锁定公式、可见性、替换范围和 requestId，抓起时开始请求，松手消费同一个 Promise 或已缓存结果。取消手势只恢复位置；再次抓取、按钮继续或失败重试都复用原意图。本人结果从 Realtime 提前到达不会触发动画，只有显式提交展示才替换骰盘。已裁定的记录不会因为取消手势被删除。

结果取得后，`buildThrow()` 在 Worker 内按 1/120 秒步长计算完整轨迹，将固定的骰体对称变换烘焙到全部帧。`HeldReplay` 在拖动期间提前计算轨迹，只允许一项计算在执行，并合并后续输入为最新位置与力度。过期计算不能改变当前定向，取消和关闭后返回的轨迹也被忽略。轨迹计算使用抓起时的原始朝向，不用动画中的朝向重新求解，避免反馈循环。

每次最新轨迹准备完成，整颗骰子在手中以最多 10 弧度/秒转向该轨迹的出手姿态。准备完成后，松手直接从 `preparationFrames` 所指的飞行起点播放同一条轨迹，跳过原地定向前缀，既不重算也不再次定向。鼠标最后一刻改变位置/力度，或服务器结果尚未返回时，允许完成剩余准备再出手，不能将旧轨迹或未知点数当作可播放结果。按钮投掷没有拖动阶段，仍通过轨迹中的准备前缀衔接起点。数字网格和骰体局部旋转始终为单位四元数，Worker 浮点旋转读入时归一化，避免已完成定向仍被误判为未就绪。

松手后网络较慢时仍保持手中姿态，按钮投掷则保持盘上姿态，直到结果和轨迹就绪。播放协议只含已确定的位置/姿态样本与准备帧数，不携带运行时点数修正。暗骰使用问号。网络失败保留相同请求，动画计算失败保留服务器记录并明确提示，不能生成替代点数。未重投的骰子保持原位置。轨迹末尾用于贴合盘底和分离堆叠的几何处理也在离线计算中完成，不改变已经确定的数字映射。

实现参考：[Roll20 的服务器裁定说明](https://app.roll20.net/forum/permalink/1692467/)、[Dice So Nice 的已求值 Roll 动画流程](https://riccisi.gitlab.io/foundryvtt-dice-so-nice/api/integration/)、[交互投掷](https://riccisi.gitlab.io/foundryvtt-dice-so-nice/guide/interactive-throws/)、[dice-box-threejs 的预设结果接口](https://www.npmjs.com/package/@3d-dice/dice-box-threejs)。本项目借鉴“先确定结果、再播放”的分层方式，保留自制模型、Worker 回放和服务器权限系统。

## 手机布局与选择

手机竖屏相机由 `trayViewport.ts` 按完整骰盘边框与抓起高度拟合，并收紧视角；
不改变模型尺寸、世界坐标或物理碰撞。竖屏成员头像放到顶部一排，横屏恢复侧栏，
为骰盘留出宽度。多选使用显式 `selectionMode`，触摸点选切换加入／移出；
选取期间不展开扇形菜单，点空白保留当前组。全选与清除是独立操作，
空选择禁用投掷；结束多选后仍可从扇形菜单设置选定骰子。d100 配对沿用
`expandDiceSelection()`，不会把十位、个位当成两个独立逻辑投掷。

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

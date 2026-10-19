export const burgerIndexSteps = Array.from({ length: 9 }, (_, index) => {
  const value = index + 1;
  const color = value <= 3 ? "red" : value <= 6 ? "yellow" : "green";
  return {
    value,
    color,
    label: `${{ red: "红", yellow: "黄", green: "绿" }[color]}${(index % 3) + 1}`,
  };
});
export function burgerIndexInfo(value: number) {
  const step = burgerIndexSteps[value - 1] ?? burgerIndexSteps[4];
  return {
    ...step,
    service:
      step.color === "red"
        ? "餐厅关闭"
        : step.color === "yellow"
          ? "有限服务"
          : "正常服务",
    bonus:
      step.color === "red"
        ? "全员生存力 +1"
        : step.color === "green"
          ? "全员智力 +1"
          : "全员无额外加值",
    description:
      step.color === "red"
        ? "餐厅严重受损或遭到破坏。"
        : step.color === "yellow"
          ? "发电机供电、停电，或食物即将耗尽。"
          : "电力正常，受到的损害几乎为零。",
  };
}

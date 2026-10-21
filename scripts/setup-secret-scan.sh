#!/bin/sh
set -eu
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "请先安装 Gitleaks：macOS 运行 brew install gitleaks。" >&2
  exit 1
fi
configured=$(git config --local --get core.hooksPath || true)
if [ -n "$configured" ] && [ "$configured" != ".githooks" ]; then
  echo "已有 Git hooks 配置，请将 .githooks 中的检查合并到现有 hooks。" >&2
  exit 1
fi
git config --local core.hooksPath .githooks
echo "已启用提交前与推送前密钥扫描。"

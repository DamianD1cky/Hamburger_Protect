interface InvocationFailure {
  name?: string;
  context?: unknown;
}

export async function diceInvocationError(
  error: InvocationFailure,
  response?: Response,
): Promise<string> {
  const http = response ?? (error.context instanceof Response ? error.context : undefined);
  if (http) {
    const body = await http.clone().json().catch(() => null);
    const serverMessage = body?.error ?? body?.message;
    if (http.status === 401) return "登录状态已失效，请重新登录后再投掷。";
    if (http.status === 404) return "服务器尚未部署骰子功能，请联系 GM 或站长。";
    if (serverMessage === "ORIGIN_NOT_ALLOWED") {
      return "当前页面地址未获骰子服务授权，请使用正式站或联系站长配置。";
    }
    if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage;
    return `骰子服务返回错误（${http.status}），请重试或联系站长。`;
  }
  if (error.name === "FunctionsFetchError") {
    return "无法连接骰子服务，请检查网络或当前页面地址后重试；重试不会重复投掷。";
  }
  return "投掷未确认，请重试；重试不会产生第二次结果。";
}

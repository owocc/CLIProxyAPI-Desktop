const translations: Record<string, string> = {
  "quota.service.xaiPaidAccount": "付费 API 账号",
  "quota.service.xaiPaidHealth": "付费 API 对话可用。xAI 暂不为此 OAuth 凭证提供额度总量数据。",
  "quota.service.xaiPaidQuotaUnavailable": "此账号不提供剩余额度。",
  "quota.service.window.sevenDayFable": "7 天 Fable 窗口",
  "quota.service.error.resetCreditsInvalid": "重置次数接口返回了无法识别的数据",
  "quota.service.daily": "每日额度",
  "quota.service.relative.daysHours": "{days} 天 {hours} 小时后",
  "quota.service.relative.days": "{days} 天后",
  "quota.service.relative.hoursMinutes": "{hours} 小时 {minutes} 分钟后",
  "quota.service.relative.hours": "{hours} 小时后",
  "quota.service.relative.minutes": "{minutes} 分钟后",
  "quota.service.duration.unknown": "未知周期",
  "quota.service.duration.days": "{count} 天",
  "quota.service.duration.hours": "{count} 小时",
  "quota.service.duration.minutes": "{count} 分钟",
  "quota.service.duration.seconds": "{count} 秒",
  "quota.service.limit.fiveHours": "5 小时限额",
  "quota.service.limit.week": "周限额",
  "quota.service.limit.month": "月限额",
  "quota.service.limit.duration": "{duration}限额",
  "quota.service.codeReview": "代码审查",
  "quota.service.additional": "附加 {index}",
  "quota.service.window.fiveHour": "5 小时窗口",
  "quota.service.window.sevenDay": "7 天窗口",
  "quota.service.window.sevenDayOAuth": "7 天 OAuth 应用窗口",
  "quota.service.window.sevenDayOpus": "7 天 Opus 窗口",
  "quota.service.window.sevenDaySonnet": "7 天 Sonnet 窗口",
  "quota.service.window.sevenDayCowork": "7 天 Cowork 窗口",
  "quota.service.window.duration": "{duration}窗口",
  "quota.service.extraUsage": "额外用量",
  "quota.service.usedOf": "已用 {used} / {limit}",
  "quota.service.weekly": "每周额度",
  "quota.service.limit.numbered": "限制 {index}",
  "quota.service.product.numbered": "产品 {index}",
  "quota.service.monthlyIncluded": "月度包含额度",
  "quota.service.onDemand": "按量付费额度",
  "quota.service.quota": "配额",
  "quota.service.quota.numbered": "配额 {index}",
  "quota.service.error.missingAuthIndex": "缺少 auth-index，无法查询配额",
  "quota.service.error.missingProject": "缺少 Antigravity project ID",
  "quota.service.error.antigravityEmpty": "Antigravity 返回成功，但没有可识别的配额分组",
  "quota.service.error.upstreamEmpty": "上游返回了空配额数据",
  "quota.service.error.noResponse": "配额接口无响应",
  "quota.service.error.missingResetAuthIndex": "缺少 auth-index，无法查询主动重置次数",
  "quota.service.error.unsupportedProvider": "暂不支持该提供商的配额查询",
  "quota.service.error.unrecognized": "上游返回了配额数据，但无法识别",
  "quota.service.error.codexResetOnly": "只有 Codex 凭据支持使用重置额度",
  "quota.service.error.missingConsumeAuthIndex": "缺少 auth-index，无法使用重置额度",
  "quota.fileDisabled": "凭据已被停用",
  "quota.resetPassed": "重置时间已到，请刷新确认",
}

export type AppLocale = "zh-CN" | "en"

export function getCurrentLocale(): AppLocale {
  return "zh-CN"
}

export function translate(
  locale: AppLocale,
  key: string,
  variables?: Record<string, string | number>,
): string {
  let template = translations[key] || key
  if (variables) {
    Object.entries(variables).forEach(([k, v]) => {
      template = template.split(`{${k}}`).join(String(v))
    })
  }
  return template
}

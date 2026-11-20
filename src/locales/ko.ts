import type { Messages } from "@/locales/en"

export const ko: Messages = {
  "banked.available": "{count}회 사용 가능",
  "banked.expiresIn": "리셋 {count}회가 {time} 후 만료됩니다",
  "banked.unknownExpiry": "리셋 {count}회: 만료일 알 수 없음",
  "banked.kind.session": "5시간 리셋",
  "banked.kind.weekly": "주간 리셋",
  "banked.kind.fable": "Fable 리셋",
  "banked.kind.full": "전체 리셋",
  "banked.kind.any": "리셋",
  "banked.fableNote": "5시간 한도와 Fable 한도를 리셋합니다. 주간 한도에는 Fable이 사용한 만큼만 돌아옵니다.",
  "banked.openUsage": "사용량 페이지를 열어 리셋 사용",
  "banked.linkFailed": "사용량 페이지를 열 수 없습니다. 다시 시도하세요.",
  "banked.alertTitle": "{provider}: 리셋이 곧 만료됩니다",
  "banked.alertBody": "리셋 {count}회가 {time} 후 만료됩니다. 제공업체의 사용량 페이지를 열어 사용하세요.",
  "app.minimize": "트레이로 최소화",
  "app.close": "닫기",
  "app.pin": "항상 위에 표시",
  "app.unpin": "항상 위에 표시 안 함",
  "tray.showStats": "통계 표시",
  "tray.goToSettings": "설정",
  "tray.debugLevel": "로그 수준",
  "tray.copyLogPath": "로그 경로 복사",
  "tray.about": "OpenTokenUsage 정보",
  "tray.quit": "종료",

  "nav.home": "홈",
  "nav.help": "도움말",
  "nav.settings": "설정",
  "nav.refreshUsage": "사용량 새로 고침",
  "nav.disablePlugin": "플러그인 사용 안 함",
  "nav.inspect": "요소 검사",

  "footer.downloading": "업데이트 다운로드 중 {progress}%",
  "footer.downloadingIndeterminate": "업데이트 다운로드 중…",
  "footer.restartToUpdate": "다시 시작하여 업데이트",
  "footer.installing": "설치 중…",
  "footer.updatesSoon": "곧 업데이트",
  "footer.updateFailed": "업데이트 실패",
  "footer.updateCheckFailed": "업데이트를 확인할 수 없습니다",
  "footer.updateDownloadFailed": "업데이트를 다운로드할 수 없습니다",
  "footer.updateInstallFailed": "업데이트를 설치할 수 없습니다",
  "footer.refreshing": "새로 고치는 중…",
  "footer.paused": "일시 중지됨",
  "footer.nextUpdate": "{time} 후 다음 업데이트",
  "footer.refreshNow": "지금 새로 고침",

  "duration.dh": "{d}일 {h}시간",
  "duration.hm": "{h}시간 {m}분",
  "duration.ms": "{m}분 {s}초",
  "duration.m": "{m}분",
  "duration.s": "{s}초",
  "duration.lt1m": "1분 미만",

  "settings.autoRefresh.title": "자동 새로 고침",
  "settings.autoRefresh.desc": "사용량을 가져오는 주기",
  "settings.autoRefresh.minutes": "{n}분",
  "settings.autoRefresh.smart": "스마트",
  "settings.autoRefresh.smartHint": "사용량이 변경되면 2분마다 확인합니다. 몇 번 확인해도 변화가 없으면 계정별 확인 간격을 5분, 10분, 15분으로 늘립니다.",
  "settings.autoRefresh.hour": "1시간",
  "settings.usageMode.title": "사용량 표시",
  "settings.usageMode.desc": "남은 양 또는 사용한 양 표시",
  "settings.usageMode.left": "남음",
  "settings.usageMode.used": "사용됨",
  "settings.usageMode.workdays": "주간 속도를 평일 기준으로",
  "settings.usageMode.workdaysHint": "월요일부터 금요일까지만 계산하므로 조용한 주말이 여유처럼 보이지 않습니다.",
  "settings.currency.title": "통화",
  "settings.currency.desc": "입력한 환율로 비용을 다른 통화로 표시합니다",
  "settings.currency.rate": "1 USD당 {code}",
  "settings.currency.hint": "환율은 온라인에서 가져오지 않으므로 가끔 업데이트하세요. 공급자는 미국 달러로 청구합니다.",
  "settings.resetTimers.title": "초기화 타이머",
  "settings.resetTimers.desc": "카운트다운 또는 시각",
  "settings.resetTimers.relative": "상대",
  "settings.resetTimers.absolute": "절대",
  "settings.resetTimers.todayAt": "오늘 {time}",
  "settings.timeFormat.title": "시간 형식",
  "settings.timeFormat.desc": "12시간제 또는 24시간제",
  "settings.timeFormat.auto": "자동",
  "settings.timeFormat.12h": "12시간제",
  "settings.timeFormat.24h": "24시간제",
  "settings.tray.title": "트레이 아이콘",
  "settings.tray.desc": "작업 표시줄의 시계 옆에 표시할 항목",
  "settings.tray.icon": "아이콘",
  "settings.tray.percent": "백분율",
  "settings.tray.bars": "막대",
  "settings.tray.numbers": "공급자별 숫자",
  "settings.tray.logos": "공급자별 로고",
  "settings.tray.logoColors": "컬러 로고",
  "settings.strip.title": "작업 표시줄 표시(실험적)",
  "settings.strip.desc": "작업 표시줄에 공급자 로고와 세션 및 주간 사용량을 표시합니다.",

  "settings.widgets.title": "바탕 화면 위젯",

  "settings.widgets.desc": "공급자 로고와 세션·주간 사용량을 바탕 화면의 원하는 곳에 표시합니다.",

  "settings.stripLook.title": "작업 표시줄 표시 및 위젯 모양",

  "settings.stripLook.desc": "작업 표시줄 표시와 위젯이 함께 쓰는 공급자, 글꼴, 색상입니다.",

  "settings.categories": "설정 범주",


  "settings.cards.sessionsOnOverview": "개요에도 표시 (끄면 카드의 상세 페이지에만)",


  "settings.newBadge": "신규",


  "settings.plugins.signedOut": "로그아웃됨",


  "settings.claudeCode.desktopLogin": "Claude 앱의 로그인 사용",


  "settings.claudeCode.desktopLoginHint": "Claude Code에 로그인되어 있지 않으면 Claude 카드가 Claude 앱의 로그인으로 사용량을 읽습니다. 읽기만 하고 갱신하지 않습니다.",


  "settings.configBroken": "저장되지 않음: {path}이 올바른 JSON이 아닙니다. 파일을 고치거나 삭제한 뒤 다시 저장하세요.",


  "settings.strip.desktopEdgeSide": "가장자리",


  "settings.strip.desktopEdgeRight": "오른쪽",


  "settings.strip.desktopEdgeLeft": "왼쪽",


  "settings.strip.desktopEdgeTop": "위쪽",


  "settings.strip.desktopPinned": "화면 가장자리 레일을 열린 채로 두기(고정 버튼으로도 전환)",


  "settings.strip.onlyWhileRunning": "AI 도구가 실행 중일 때만",


  "settings.strip.onlyWhileRunningHint": "이 표시에 있는 제공자의 앱이나 CLI(Claude Code, Codex 등)가 하나도 실행 중이 아니면 숨겨집니다.",


  "settings.strip.desktopSlide": "화면 가장자리 레일을 부드럽게 밀어서 열기",


  "settings.strip.desktopSlideMs": "슬라이드 시간",


  "settings.strip.desktopGradient": "화면 가장자리 레일에 부드러운 그라데이션 적용",


  "whatsNew.title": "새로운 기능",


  "whatsNew.close": "닫기",


  "whatsNew.video": "이 버전의 새로운 기능을 보여 주는 짧은 동영상",


  "settings.whatsNew.title": "새로운 기능",


  "settings.whatsNew.label": "업데이트 후 새로운 기능 표시",


  "settings.whatsNew.hint": "업데이트 후 패널을 처음 열 때 한 번: 릴리스 노트와, 업데이트에 포함된 경우 짧은 동영상을 보여 줍니다. 동영상은 창을 닫으면 삭제됩니다.",


  "rate.perMinute": "{tokens}/분",


  "settings.strip.tokenRate": "분당 실시간 토큰(Claude, Codex), 트레이 도움말에도 표시",


  "settings.strip.desktopEdge": "화면 가장자리",


  "settings.strip.desktopEdgeHint": "화면 가장자리(오른쪽, 왼쪽, 위쪽)에 붙어 거의 보이지 않으며, 포인터를 올리면 밀려 나옵니다.",


  "settings.cards.tokscale": "tokscale로 약 30개 도구 추가(Gemini CLI, Copilot, Kiro…)",


  "settings.cards.tokscaleHint": "오픈 소스 tokscale을 bunx 또는 npx로 실행하며(bun 또는 Node.js 필요), tokscale 자체와 가격표를 내려받습니다. 해당 도구의 로컬 로그는 최대 30분에 한 번 읽습니다.",


  "settings.balances.title": "사용자 지정 잔액",


  "settings.balances.desc": "New API, One API, Sub2API 또는 직접 만든 엔드포인트: 잔액을 Custom balances 카드에 표시",


  "settings.balances.name": "이름",


  "settings.balances.preset": "종류",


  "settings.balances.custom": "사용자 지정 엔드포인트",


  "settings.balances.url": "주소",


  "settings.balances.env": "키가 담긴 환경 변수(OTU_…)",


  "settings.balances.userId": "사용자 ID",


  "settings.balances.path": "경로",


  "settings.balances.remaining": "잔액 위치",


  "settings.balances.used": "사용량 위치",


  "settings.balances.total": "합계 위치",


  "settings.balances.divisor": "나눌 값",


  "settings.balances.currency": "통화",


  "settings.balances.auth": "키 헤더",


  "settings.balances.remove": "제거",


  "settings.balances.add": "잔액 추가",


  "settings.balances.save": "저장",


  "settings.balances.saved": "저장했습니다. 보려면 Custom balances 카드를 켜세요.",


  "settings.balances.invalid": "저장하지 못했습니다. 주소, 변수 이름(OTU_로 시작하고 이어서 A–Z, 0–9, _), 경로를 확인하세요.",


  "settings.balances.hint": "키 자체는 저장되지 않습니다. 키를 환경 변수에 넣고 그 이름을 입력하세요. 경로는 응답 안의 위치를 가리킵니다(예: data.balance).",


  "year.title": "1년 사용량",


  "year.streak": "{days}일 연속",


  "year.summary": "최장 연속 {longest}일 · 사용한 날 {active}일 · {tokens} 토큰",


  "year.cell": "{date}: {tokens} 토큰",


  "settings.cards.yearHeatmap": "Claude와 Codex 상세 페이지에 1년간의 일별 사용량과 연속 기록",


  "settings.cards.keepUsage": "로그가 삭제된 사용량도 보존",


  "settings.cards.keepUsageHint": "Claude Code는 기본적으로 30일 뒤 로그를 지웁니다. 하루하루의 토큰을 앱 데이터 폴더에 보관해 1년 보기와 내보내기에서 계속 셉니다.",


  "settings.export.title": "사용량 내보내기",


  "settings.export.desc": "일별 토큰과 최근 한도를 CSV와 JSON으로 다운로드 폴더에 저장",


  "settings.export.now": "지금 내보내기",


  "settings.export.done": "저장됨: {path}",


  "settings.export.failed": "내보내기를 저장하지 못했습니다.",


  "settings.export.daily": "하루에 한 번 다시 저장",


  "card.sessions.cache": "캐시 {time}",


  "card.sessions.cacheHint": "이 세션의 프롬프트 캐시 남은 시간입니다. 만료되면 다음 프롬프트가 전체 컨텍스트를 다시 보내 한도를 더 많이 씁니다.",


  "settings.cards.cacheTimer": "Claude 세션의 프롬프트 캐시 남은 시간",


  "settings.cards.contextFill": "각 세션의 컨텍스트 창 사용률",


  "spend.planMultiple": "{name}: 요금제의 {times}배",


  "spend.planMultipleHint": "API 가격 기준 30일({cost})은 요금제 월 가격({price})의 {times}배입니다.",


  "settings.plans.title": "구독",


  "settings.plans.desc": "각 요금제의 월 가격. API 가격 기준 사용량과 비교합니다",


  "settings.plans.multiple": "지출 요약에 각 요금제의 사용량을 가격의 배수로 표시",


  "settings.plans.price": "{name}: 월 가격",


  "settings.claudeCode.retention": "Claude Code 로그 보관 기간",


  "settings.claudeCode.retentionDays": "{days}일",


  "settings.claudeCode.retentionHint": "Claude Code는 시작할 때 오래된 기록을 지웁니다. 시간대 표, 프로젝트, 지출은 이 기록에서 읽습니다.",


  "settings.alerts.refills": "한도가 초기화 전에 다시 채워질 때 (초기화 크레딧 또는 부분 충전)",


  "settings.alerts.refillPoints": "최소",


  "settings.alerts.points": "{points}포인트",


  "settings.strip.followDetail": "자세히: 각 한도와 초기화까지 남은 시간",


  "settings.strip.activityDots": "에이전트가 작업 중(초록)이거나 응답을 기다릴 때(노랑) 로고에 점 표시",


  "settings.strip.desktopClickThroughKey": "클릭하거나 끌 때 누르고 있을 키",


  "settings.cards.title": "카드에 표시",


  "settings.cards.desc": "개요에서 한도 외에 보여 줄 항목",


  "settings.cards.liveSessions": "Claude Code와 Codex 카드에 실행 중인 세션",


  "settings.cards.spend": "카드 아래 지출 요약",


  "settings.cards.spendTools": "이 도구들의 자체 기록도 포함",


  "alert.refill.title": "{provider}: {label}이(가) 일찍 다시 채워졌습니다",


  "alert.refill.body": "{percent}%를 다시 사용할 수 있습니다.",


  "settings.strip.followActive": "사용 중인 앱 따라가기",


  "settings.strip.followActiveHint": "지금 쓰는 창의 AI 도구가 맨 앞에 표시됩니다.",


  "settings.strip.desktopClickThrough": "클릭이 뒤에 있는 창으로 통과하게 하기",


  "spend.title": "지출",


  "spend.today": "오늘",


  "spend.yesterday": "어제",


  "spend.month": "30일",


  "spend.cost": "비용",


  "spend.tokens": "토큰",


  "spend.models": "모델, 최근 30일 (토큰 기준)",


  "settings.strip.desktopCycle": "차례로",


  "settings.strip.desktopCycleHint": "각 제공자를 8초씩 보여 주는 위젯 하나",


  "settings.theme.halloween": "핼러윈",


  "settings.theme.glass": "유리",


  "settings.theme.glassHint": "패널 뒤의 바탕 화면을 흐리게 합니다 (Windows 11)",


  "label.Installed models": "설치된 모델",


  "label.Loaded now": "현재 로드됨",


  "label.Vouchers": "바우처",


  "label.Cash": "현금",


  "label.Requests today": "오늘 요청",


  "label.Requests this month": "이번 달 요청",


  "label.Models": "모델",


  "label.Token Plan usage": "Token Plan 사용량",


  "card.customize": "행 사용자 지정",


  "card.customizeHint": "행을 끌어서 순서를 바꾸고 필요 없는 행은 숨기세요. Ctrl+Z는 실행 취소, Esc는 닫기입니다.",


  "card.customizeMove": "{row} 이동",


  "card.customizeShow": "{row} 표시",


  "card.customizeHide": "{row} 숨기기",


  "card.customizeReset": "기본값으로 되돌리기",


  "card.customizeDone": "완료",


  "weekDays.capacity": "이번 주의 모델 사용 비율로 보면 한도 전체는 약 {tokens} 토큰이며, API 가격으로 {cost}에 해당합니다.",


  "weekDays.capacityTokens": "이번 주의 모델 사용 비율로 보면 한도 전체는 약 {tokens} 토큰입니다.",


  "card.copyImage": "이미지로 복사",


  "card.imageCopied": "클립보드에 복사했습니다",


  "card.imageCopyFailed": "이미지를 복사하지 못했습니다",


  "settings.privacy.title": "개인 정보",


  "settings.privacy.hideWhenSharing": "화면 공유 시 숨기기",


  "settings.privacy.hideWhenSharingHint": "패널과 바탕 화면 위젯은 화면 공유, 녹화, 스크린샷에 절대 나타나지 않으며 본인에게는 계속 보입니다. Windows는 화면 공유 여부를 앱에 알려 주지 않으므로 알림 영역의 숫자와 작업 표시줄 표시는 프레젠테이션 중이거나 누군가 이 PC를 원격으로 제어하는 동안에만 숨겨집니다.",


  "settings.backup.reset": "모든 설정 초기화",


  "settings.backup.resetHint": "모든 설정이 기본값으로 돌아갑니다. 공급자, 계정, 프로젝트 예산은 그대로 유지됩니다. 앱이 다시 시작됩니다.",


  "settings.backup.resetConfirm": "초기화 후 다시 시작",


  "settings.backup.resetCancel": "취소",


  "settings.backup.resetError": "설정을 초기화하지 못했습니다.",


  "settings.proxy.title": "프록시",


  "settings.proxy.desc": "공급자, 상태 페이지, 업데이트 요청을 프록시 서버를 통해 보냅니다.",


  "settings.proxy.enable": "프록시 사용",


  "settings.proxy.url": "프록시 주소",


  "settings.proxy.save": "저장",


  "settings.proxy.saved": "저장했습니다. 다음 요청부터 적용됩니다.",


  "settings.proxy.invalid": "프록시 주소가 아닙니다. 호스트가 포함된 http://, https://, socks5:// 또는 socks5h://를 사용하세요(예: http://127.0.0.1:8080).",


  "settings.proxy.error": "프록시를 저장하지 못했습니다.",


  "card.showUsed": "사용량 표시",


  "card.showLeft": "남은 양 표시",

  "settings.category.usage": "사용량",

  "settings.category.taskbar": "작업 표시줄 및 바탕 화면",

  "settings.category.appearance": "모양",

  "settings.category.app": "앱",
  "settings.strip.position": "위치",
  "settings.strip.positionLeft": "왼쪽",
  "settings.strip.positionRight": "오른쪽",

  "settings.strip.positionCenter": "가운데",
  "settings.strip.offset": "간격 (px)",
  "settings.strip.positionHint": "오른쪽은 알림 영역 옆에 표시됩니다. 다른 쪽은 Windows 아이콘 정렬을 따릅니다. 아이콘이 가운데 정렬이면 왼쪽 가장자리, 왼쪽 정렬이면 작업 표시줄 가운데입니다. 시작, 앱, 위젯과 겹치지 않으며 간격은 디스플레이 배율에 따라 조정됩니다.",
  "settings.strip.enable": "작업 표시줄에 표시",
  "settings.strip.enableHint": "Windows에는 공식 위치가 없어 업데이트로 위치가 바뀌거나 숨겨질 수 있습니다. 켜져 있는 동안 알림 영역에는 앱 아이콘만 표시되며, 다른 아이콘 스타일을 고르면 이 표시가 꺼집니다.",
  "settings.strip.preview": "미리 보기",
  "settings.strip.providers": "공급자(최대 {max}개)",
  "settings.strip.providersHint": "체크하면 표시되고, 끌어서 순서를 바꿉니다. 이 순서는 이 표시에만 적용됩니다.",
  "settings.strip.monitors": "표시 위치",
  "settings.strip.monitorsPrimary": "기본 작업 표시줄",
  "settings.strip.monitorsAll": "모든 작업 표시줄",
  "settings.strip.monitorsPick": "모니터 선택",
  "settings.strip.monitorMain": "{name}(기본)",
  "settings.strip.monitorDisconnected": "{name}(연결 안 됨)",
  "settings.strip.monitorNoTaskbar": "{name}(작업 표시줄 없음)",
  "settings.strip.monitorsHint": "작업 표시줄이 있는 모니터에만 표시됩니다. Windows 작업 표시줄 설정에서 모든 디스플레이에 작업 표시줄 표시를 켜세요.",
  "settings.accounts.title": "추가 계정",
  "settings.accounts.desc": "업무용과 개인용처럼 두 번째 Claude 또는 Codex 로그인을 각각 별도의 카드로 확인합니다.",
  "settings.accounts.provider": "제공업체",
  "settings.accounts.label": "계정 이름",
  "settings.accounts.labelPlaceholder": "업무, 개인…",
  "settings.accounts.add": "추가하고 로그인",
  "settings.accounts.signIn": "로그인",
  "settings.accounts.copyPath": "폴더 경로 복사",
  "settings.accounts.remove": "제거",
  "settings.accounts.confirmRemove": "한 번 더 클릭하면 제거",
  "settings.accounts.addFailed": "계정을 추가하지 못했습니다.",
  "settings.accounts.hint": "추가하면 터미널이 열리고 한 번만 로그인하면 됩니다. 로그인 정보는 이 계정 전용 폴더에 저장되므로 평소 로그인은 그대로입니다. 터미널에서도 이 계정을 쓰려면 CLAUDE_CONFIG_DIR 또는 CODEX_HOME을 그 폴더로 지정하세요.",
  "settings.claudeCode.title": "Claude Code 상태 표시줄",
  "settings.claudeCode.desc": "Claude Code가 자체 5시간 및 주간 사용량을 앱에 전달하므로 Claude 카드가 Anthropic에 훨씬 덜 자주 요청하고 요청 한도에 덜 걸립니다.",
  "settings.claudeCode.label": "Claude Code 상태 표시줄 사용",
  "settings.claudeCode.hint": "Claude의 settings.json에 상태 표시줄 명령을 추가하며, 끄면 제거됩니다. Claude Code 상태 표시줄에는 아무것도 표시되지 않으며, 사용량은 Windows에 포함된 curl로 전송됩니다.",
  "settings.claudeCode.other": "Claude Code에서 이미 사용자의 상태 표시줄을 실행 중입니다. 그대로 두므로 이 옵션은 꺼진 상태로 유지됩니다.",
  "settings.claudeCode.unreadable": "Claude의 settings.json을 JSON으로 읽을 수 없어 변경하지 않았습니다.",
  "settings.strip.lineMode": "{name}에 표시할 값",
  "settings.strip.lineBoth": "둘 다",
  "settings.strip.colorMode": "사용량에 따라 색 지정",
  "settings.strip.colorHeat": "히트(노랑 → 주황 → 빨강)",
  "settings.strip.colorTraffic": "신호등(초록 → 노랑 → 빨강)",
  "settings.strip.colorCool": "쿨(파랑 → 보라 → 빨강)",
  "settings.strip.colorMono": "단순, 한도 근처에서만 빨강",

  "settings.strip.colorPace": "속도에 따라",
  "settings.strip.colorThresholds": "사용자 지정 기준",
  "settings.strip.colorOff": "끄기",
  "settings.strip.drag": "{name} 끌기",
  "settings.strip.font": "글꼴",
  "settings.strip.size": "크기",
  "settings.strip.bold": "굵게",
  "settings.strip.showPercentSign": "% 기호 표시",
  "settings.strip.customTextColor": "사용자 지정 글자 색",
  "settings.strip.warnAt": "경고 기준",
  "settings.strip.criticalAt": "위험 기준",
  "settings.strip.usageColorsHint": "한도 중 이미 사용한 비율을 기준으로 합니다.",
  "settings.strip.reset": "모양 초기화",
  "settings.strip.desktop": "바탕 화면에 표시",
  "settings.strip.desktopHint": "원하는 곳으로 끌어 놓을 수 있는 위젯입니다. 클릭하면 패널이 열리고, 포인터를 올리면 한도가 초기화되는 시간이 표시됩니다. 값이 오르면 깜박인 뒤 1분 동안 강조 색으로 표시됩니다. 전체 화면 앱이 앞에 있는 동안에는 숨겨집니다. 아래의 공급자와 모양 설정이 위젯에도 적용됩니다.",
  "settings.strip.desktopLayout": "위젯",
  "settings.strip.desktopRow": "가로로",

  "settings.strip.desktopColumn": "세로로",
  "settings.strip.desktopSeparate": "따로",
  "settings.strip.desktopPlate": "배경 불투명도",
  "settings.strip.desktopLogo": "로고",
  "settings.strip.desktopLogoBrand": "컬러",
  "settings.strip.desktopLogoWhite": "흰색",
  "settings.strip.desktopLogoBlack": "검은색",
  "settings.strip.desktopOnTop": "항상 위에 표시",
  "settings.strip.desktopSnap": "화면 가장자리와 서로에게 맞춤",
  "settings.strip.desktopLocked": "위치 고정 (포인터를 올리면 투명해짐)",

  "settings.strip.desktopBars": "숫자 아래 막대",
  "settings.tray.perProviderHint": "아이콘이 ^ 안으로 들어가면 작업 표시줄 설정에서 켜서 시계 옆에 두세요.",
  "settings.tray.openTaskbarSettings": "작업 표시줄 설정 열기",
  "settings.tray.provider": "공급자",
  "settings.tray.metric": "지표",
  "settings.tray.color": "색",
  "settings.tray.colorTitle": "트레이 백분율 텍스트 색",
  "settings.tray.paceColor": "속도에 따라 색상 표시",
  "settings.tray.paceColorHint": "녹색: 여유 있음. 노란색: 적정 속도. 빨간색: 초기화 전에 소진 예상.",
  "settings.tray.auto": "자동",
  "settings.tray.tightest": "가장 많이 사용",
  "settings.theme.title": "테마",
  "settings.theme.desc": "다크(완전한 검정), 라이트 또는 핼러윈",
  "settings.theme.light": "밝게",
  "settings.theme.dark": "다크",
  "settings.theme.darkHint": "완전한 검정, OLED 화면에 적합",
  "settings.language.title": "언어",
  "settings.language.desc": "앱에 표시되는 언어",
  "settings.language.system": "Windows 기본값",
  "settings.shortcut.title": "전역 바로 가기 키",
  "settings.shortcut.desc": "어디서나 패널 표시",
  "settings.shortcut.pressKeys": "키를 누르세요…",
  "settings.shortcut.clickToSet": "클릭하여 설정",
  "settings.shortcut.record": "바로 가기 키를 기록하려면 키를 누르세요",
  "settings.shortcut.clear": "바로 가기 키 지우기",
  "settings.shortcut.hint": "기록 중에 Esc 키를 누르면 지워집니다.",
  "settings.startOnLogin.title": "시작 프로그램",
  "settings.startOnLogin.desc": "Windows에 로그인할 때 OpenTokenUsage 열기",
  "settings.startOnLogin.label": "로그인 시 시작",
  "settings.backup.title": "설정 백업",
  "settings.backup.desc": "설정을 다른 컴퓨터로 옮깁니다. 로그인 정보와 계정은 포함되지 않습니다.",
  "settings.backup.export": "내보내기",
  "settings.backup.import": "가져오고 다시 시작",
  "settings.backup.saved": "{path}에 저장했습니다",
  "settings.backup.exportError": "백업을 저장하지 못했습니다.",
  "settings.backup.importError": "파일을 읽지 못했습니다.",
  "settings.backup.notBackup": "OpenTokenUsage 설정 백업 파일이 아닙니다.",
  "settings.alerts.title": "알림",
  "settings.alerts.desc": "사용량 기준, 사용 속도, 한도 리셋 및 7일 또는 24시간 이내에 만료되는 저장된 리셋",
  "settings.alerts.label": "사용량 알림",
  "settings.panel.title": "패널",
  "settings.panel.desc": "패널이 열리는 위치입니다. 제목 표시줄의 핀을 누르면 다른 창 위에 계속 표시됩니다.",
  "settings.panel.remember": "위치 기억",
  "settings.panel.rememberHint": "제목 표시줄을 끌어 패널을 옮기면 다음부터 작업 표시줄 위가 아니라 같은 자리에서 열립니다.",
  "settings.panel.navSide": "공급자 표시줄",
  "settings.panel.navLeft": "왼쪽",
  "settings.panel.navRight": "오른쪽",
  "settings.alerts.levels": "알림 기준",
  "settings.alerts.ticksHint": "막대에 각 단계가 눈금으로 표시됩니다.",
  "settings.alerts.perProvider": "공급자별",
  "settings.alerts.sameAsAll": "모든 공급자와 동일",
  "settings.alerts.spikes": "세션이 평소보다 훨씬 빠르게 토큰을 쓸 때(대개 에이전트가 반복에 빠진 경우)",
  "settings.alerts.none": "없음",
  "settings.alerts.sound": "소리",
  "settings.alerts.play": "재생",
  "settings.alerts.chooseFile": "내 소리 사용…",
  "settings.alerts.fileHint": "MP3, WAV, OGG, M4A를 지원합니다. 긴 소리는 {seconds}초에서 잘립니다.",
  "settings.alerts.fileError": "이 파일은 재생할 수 없습니다. MP3나 WAV 파일을 사용해 보세요.",
  "settings.alerts.fileTooLarge": "이 파일은 {mb}MB보다 큽니다. 더 짧은 소리를 선택하세요.",
  "sound.windows": "Windows 기본값",
  "sound.chime": "차임",
  "sound.glass": "유리",
  "sound.steel": "스틸 드럼",
  "sound.pizzicato": "피치카토",
  "sound.retro": "레트로",
  "sound.two-tone": "두 음",
  "sound.three-tone": "세 음",
  "sound.rise": "상승",
  "sound.none": "소리 없음",
  "sound.custom": "내 소리: {name}",
  "settings.plugins.title": "공급자",
  "settings.plugins.desc": "체크하면 공급자가 켜지고, 끌어서 순서를 바꿉니다. 눈 아이콘은 시계 옆 알림 영역 아이콘에서 표시하거나 숨깁니다.",
  "settings.plugins.inTray": "알림 영역 아이콘에 표시 중. 클릭하면 숨깁니다(사이드 메뉴에는 남음).",
  "settings.plugins.notInTray": "알림 영역 아이콘에서 숨겨짐. 클릭하면 표시합니다.",

  "overview.noProviders": "사용 중인 공급자 없음",
  "status.minor": "서비스 성능 저하",
  "status.major": "부분 중단",
  "status.critical": "주요 중단",
  "status.maintenance": "유지 관리",
  "status.open": "상태 페이지 열기",

  "card.retry": "다시 시도",
  "error.runInTerminal": "터미널에서 {cmd} 실행",
  "error.envSteps": "API 키에서 키를 복사한 뒤 환경 변수를 열고 이름이 {name}인 사용자 변수를 만들어 키를 붙여넣으세요. 다음 새로 고침 때 적용됩니다.",
  "error.openEnvEditor": "환경 변수 열기",
  "card.updated": "{time} 업데이트됨",
  "card.justNow": "방금",
  "card.minutesAgo": "{n}분 전",
  "card.hoursAgo": "{n}시간 전",
  "card.daysAgo": "{n}일 전",
  "card.availableIn": "{time} 후 사용 가능",
  "card.limitReached": "한도 도달",
  "card.valueLeft": "{value} 남음",
  "card.percentCap": "{value}% 한도",
  "card.amountLimit": "{value} 한도",
  "card.sessions.title": "실행 중인 세션",
  "card.sessions.busy": "작업 중",
  "card.sessions.shell": "명령 실행 중",
  "card.sessions.idle": "유휴",
  "card.sessions.waiting": "입력 대기 중",
  "card.sessions.context": "컨텍스트 {percent}%",
  "card.sessions.compactSoon": "곧 압축됨",
  "detail.cost": "비용",
  "detail.models": "모델",
  "heatmap.title": "시간대별 사용량(최근 4주)",
  "weekDays.title": "요일별 주간 한도",
  "weekDays.day": "{day}: 주간 한도의 약 {percent}",
  "weekDays.note": "지금까지 쓴 주간 한도 {percent}를 날마다 쓴 토큰의 금액에 따라 나눈 값입니다(로컬 로그 기준).",
  "weekDays.loadFailed": "날짜별 사용량을 읽지 못했습니다. 몇 분 뒤 다시 시도합니다.",
  "heatmap.peak": "가장 많이 쓴 시간: {day} {hour}",
  "heatmap.cell": "{day} {hour}: {tokens} 토큰",
  "heatmap.dayTotal": "{day}, 4주 합계: {tokens} 토큰",
  "heatmap.unreadable": "읽지 못한 로그 파일: {count}개",
  "projects.title": "프로젝트",
  "projects.thisMonth": "이번 달",
  "projects.lastMonth": "지난달",
  "projects.weeklyLimit": "주간 한도",
  "projects.total": "합계",
  "projects.tokens": "토큰 {tokens}개",
  "projects.noBranch": "브랜치 없음",
  "projects.unknown": "알 수 없는 폴더",
  "projects.more": "{count}개 더 보기",
  "projects.less": "간단히 보기",
  "projects.empty": "이 달에는 사용량이 없습니다.",
  "projects.emptyWeek": "이번 주간 한도 기간에는 사용량이 없습니다.",
  "projects.unattributed": "{cost}은(는) 어느 프로젝트에도 연결되지 않았습니다.",
  "projects.apiPrices": "API 정가 기준: 이 사용량을 API로 썼을 때의 금액이며, 요금제 청구액이 아닙니다.",
  "projects.unpriced": "금액을 보려면 bun 또는 Node.js(ccusage용)가 필요해 토큰 수를 표시합니다.",
  "projects.unpricedFailed": "ccusage가 지금 이번 달 금액을 계산하지 못해 토큰 수를 표시합니다. 몇 분 뒤 다시 시도합니다.",
  "projects.unpricedFailedWeek": "ccusage가 지금 이번 주간 한도 기간의 금액을 계산하지 못해 토큰 수를 표시합니다. 몇 분 뒤 다시 시도합니다.",
  "projects.loadFailed": "프로젝트를 읽지 못했습니다. 몇 분 뒤 다시 시도합니다.",
  "projects.forecast": "이 속도라면 월말에 {cost}",
  "projects.budget": "월 예산",
  "projects.budgetSave": "저장",
  "projects.budgetRemove": "삭제",
  "projects.budgetInvalid": "50 또는 1,250.50처럼 금액을 입력하세요.",
  "projects.budgetUsed": "예산의 {percent} 사용({budget} 중 {spent})",
  "projects.export": "CSV로 내보내기",
  "projects.saved": "{path}에 저장했습니다",
  "projects.exportFailed": "파일을 저장하지 못했습니다.",
  "projects.alert.title": "{project} 예산({provider})",
  "projects.alert.body": "월 예산 {budget}의 {percent}를 사용했습니다. 지금까지 {spent}.",

  "pace.ahead": "여유 있음",
  "pace.onTrack": "적정 속도",
  "pace.behind": "소진 예상",
  "pace.limitIn": "{time} 후 한도 도달",
  "pace.usedAtReset": "초기화 시 {percent}% 사용",
  "pace.leftAtReset": "초기화 시 {percent}% 남음",
  "pace.runsOutIn": "{time} 후 소진",
  "pace.short": "{value} 부족",
  "pace.deficit": "{value} 초과",
  "pace.markerHint": "선은 균등한 사용 속도를 나타냅니다(기간의 {percent}% 경과)",

  "reset.soon": "곧 초기화",
  "reset.in": "{time} 후 초기화",
  "reset.todayAt": "오늘 {time}에 초기화",
  "reset.tomorrowAt": "내일 {time}에 초기화",
  "reset.onDateAt": "{date} {time}에 초기화",
  "alert.threshold.title": "{provider}: {label} {percent}% 사용",
  "alert.threshold.left": "{provider}: {label} {percent}% 남음",
  "alert.reset.title": "{provider}: {label} 초기화됨",
  "alert.reset.body": "한도를 다시 사용할 수 있습니다.",
  "alert.pace.title": "{provider}: {label} 곧 소진",
  "alert.pace.body": "이 속도라면 초기화 전 {time} 후 한도에 도달합니다.",
  "alert.spike.title": "{provider}: {folder}에서 토큰을 빠르게 쓰고 있습니다",
  "alert.spike.body": "15분 동안 {tokens} 토큰, 평소의 {times}배입니다. 에이전트가 반복에 빠졌나요?",
  "alert.update.title": "OpenTokenUsage {version} 준비 완료",
  "alert.update.body": "패널을 열고 다시 시작하여 업데이트를 선택하세요.",
  "alert.signIn.title": "{provider}: 다시 로그인하세요",
  "alert.signIn.body": "다시 로그인할 때까지 사용량이 업데이트되지 않습니다.",

  "sparkline.peak": "최고 {value}",
  "sparkline.summary": "{label}: {days}일, 최근 {date} {latest}, 최고 {peak}.",

  "about.viewChangelog": "변경 로그 보기",
  "about.windowsPort": "Windows 포팅",
  "about.source": "소스 코드",
  "support.buyMeACoffee": "커피 한 잔 사주기",
  "support.navLabel": "OpenTokenUsage 후원하기",
  "support.title": "모든 프로젝트의 동반자",
  "support.body": "OpenTokenUsage는 개발하는 동안 한도를 지켜봐서, 아이디어 도중에 한도 때문에 놀라는 일이 없게 합니다. 새 제공업체 추가, API 변경 대응, 모든 번역을 개발자 한 명이 이어 가고 있습니다.",
  "support.ask": "AI로 만든 것이 수익을 내기 시작했다면, 처음부터 곁에 있던 이 앱과 조금 나눠 주세요. 커피 한 잔이 개발 시간을 지원하고 업데이트를 계속 이어 가게 합니다.",
  "support.later": "나중에",
  "support.starAsk": "또는 GitHub에서 별을 눌러 주세요. 무료이고 다른 사람들이 이 앱을 찾는 데 도움이 됩니다.",
  "star.title": "OpenTokenUsage가 마음에 드시나요?",
  "star.body": "GitHub 별은 무료이고 다른 사람들이 이 앱을 찾는 데 도움이 됩니다.",
  "star.button": "GitHub에서 별 누르기",
  "faq.title": "자주 묻는 질문",
  "faq.notDetected.q": "제공업체가 검색되지 않는다고 나옵니다. 어떻게 해야 하나요?",
  "faq.notDetected.a": "OpenTokenUsage는 제공업체의 앱이나 CLI가 이 PC에 저장한 로그인 정보를 읽습니다. 그곳에서 로그인하거나, 카드에 버튼이 보이면 그 버튼을 사용한 뒤(터미널에서 로그인 명령을 실행합니다) 새로 고침하세요.",
  "faq.refresh.q": "사용량은 얼마나 자주 새로 고쳐지나요?",
  "faq.refresh.a": "{settings} → {autoRefresh}에서 설정합니다. {smart}는 사용량이 바뀌는 동안 2분마다(Claude는 10분마다) 확인하고, 바뀌지 않으면 15분까지 간격을 늘립니다. 오른쪽 아래의 카운트다운을 클릭하면 바로 새로 고칩니다. 직접 새로 고친 제공업체는 다음 새로 고침까지 5분을 기다립니다.",
  "faq.rateLimited.q": "Claude에 요청 한도에 도달했다고 나오는 이유는 무엇인가요?",
  "faq.rateLimited.a": "Anthropic은 로그인당 시간당 약 30회의 사용량 조회를 허용하며, 이 횟수는 Claude Code 및 사용량을 표시하는 다른 도구와 함께 쓰입니다. 모두 쓰면 Anthropic이 최대 1시간 기다리도록 요청하고, 앱은 다시 시작한 뒤에도 이를 지킵니다. 요청을 줄이려면 {settings} → {claudeCode}을(를) 켜세요. 그러면 Claude Code가 자체 사용량을 앱에 전달합니다.",
  "faq.accounts.q": "두 번째 Claude 또는 Codex 계정도 추적할 수 있나요?",
  "faq.accounts.a": "네. {settings} → {accounts}에서 자체 로그인과 카드를 가진 계정을 추가할 수 있습니다. 실행 중인 WSL 배포판 안의 다른 로그인은 “· WSL”로 끝나는 별도의 카드로 표시됩니다.",
  "faq.taskbar.q": "패널을 열지 않고 사용량을 볼 수 있나요?",
  "faq.taskbar.a": "네. {settings} → {tray}에서는 시계 옆에 제공업체별 숫자나 로고를 표시할 수 있고, {strip}은 세션 및 주간 사용량을 작업 표시줄에 바로 표시합니다. {alerts}는 선택한 수준에서 알려 줍니다.",
  "faq.privacy.q": "제 데이터가 이 PC 밖으로 나가나요?",
  "faq.privacy.a": "원격 분석, 분석 도구, 앱 자체 서버가 없습니다. 앱은 이 PC에 이미 있는 로그인으로 사용 중인 제공업체와 통신하고, 그 상태 페이지 및 업데이트를 위한 GitHub와도 통신합니다. 설정과 캐시된 사용량은 이 PC에 남습니다.",
  "faq.update.q": "어떻게 업데이트하나요?",
  "faq.update.a": "앱은 15분마다 확인하고 새 버전을 직접 내려받습니다. 준비되면 알림이 오고 왼쪽 아래에 “{restart}”가 표시됩니다. WinGet 사용 시: winget upgrade PowerUserZ.OpenTokenUsage",
  "faq.askOnGitHub": "답을 찾지 못하셨나요? GitHub에 질문하기",
  "changelog.title": "릴리스 정보",
  "changelog.back": "뒤로",
  "changelog.loading": "릴리스 정보를 가져오는 중…",
  "changelog.failed": "릴리스 정보를 불러오지 못했습니다",
  "changelog.failedHint": "인터넷 연결을 확인하거나 몇 분 후에 다시 시도하세요.",
  "changelog.tryAgain": "다시 시도",
  "changelog.releasedOn": "{date} 릴리스",
  "changelog.unpublished": "게시되지 않은 릴리스",
  "changelog.olderVersions": "이전 버전을 찾으시나요?",
  "changelog.fullChangelog": "전체 변경 로그 보기",
  "changelog.noNotes": "v{version} 릴리스 정보 없음",
  "changelog.noNotesHint": "시험판 또는 로컬 빌드일 수 있습니다.",
  "changelog.viewAll": "GitHub에서 모든 릴리스 보기",

  "label.Session": "세션",
  "label.Weekly": "주간",
  "label.Claude Weekly": "Claude 주간",
  "label.Argon Weekly": "Argon 주간",
  "label.Monthly": "월간",
  "label.Today": "오늘",
  "label.Yesterday": "어제",
  "label.Last 30 Days": "최근 30일",
  "label.Cache Hit Rate": "캐시 적중률",
  "label.Credits": "크레딧",
  "label.Balance": "잔액",
  "label.Status": "상태",
  "label.API keys": "API 키",
  "label.Dashboard": "대시보드",
  "label.Usage dashboard": "사용량 대시보드",
  "label.Usage Trend": "사용량 추이",
  "label.Rate Limit Resets": "속도 제한 초기화",
  "label.Extra usage spent": "추가 사용 금액",
  "label.Reviews": "리뷰",
  "label.Requests": "요청",
  "label.Total usage": "총 사용량",
  "label.Auto usage": "Auto 사용량",
  "label.API usage": "API 사용량",
  "label.On-demand": "온디맨드",
}

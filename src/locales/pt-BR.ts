import type { Messages } from "@/locales/en"

export const ptBR: Messages = {
  "banked.available": "{count} disponíveis",
  "banked.expiresIn": "{count} redefinições expiram em {time}",
  "banked.unknownExpiry": "{count} redefinições: validade desconhecida",
  "banked.kind.session": "Redefinição de 5 horas",
  "banked.kind.weekly": "Redefinição semanal",
  "banked.kind.fable": "Redefinição do Fable",
  "banked.kind.full": "Redefinição completa",
  "banked.kind.any": "Redefinição",
  "banked.fableNote": "Redefine o limite de 5 horas e o limite do Fable. O limite semanal só recupera o que o Fable usou.",
  "banked.openUsage": "Abrir a página de uso para usar uma redefinição",
  "banked.linkFailed": "Não foi possível abrir a página de uso. Tente novamente.",
  "banked.alertTitle": "{provider}: as redefinições expiram em breve",
  "banked.alertBody": "{count} redefinições expiram em {time}. Abra a página de uso do provedor para usá-las.",
  "app.minimize": "Minimizar para a área de notificação",
  "app.close": "Fechar",
  "app.pin": "Manter na frente",
  "app.unpin": "Parar de manter na frente",
  "tray.showStats": "Mostrar estatísticas",
  "tray.goToSettings": "Configurações",
  "tray.debugLevel": "Nível de log",
  "tray.copyLogPath": "Copiar caminho do log",
  "tray.about": "Sobre o OpenTokenUsage",
  "tray.quit": "Sair",

  "nav.home": "Início",
  "nav.help": "Ajuda",
  "nav.settings": "Configurações",
  "nav.refreshUsage": "Atualizar uso",
  "nav.disablePlugin": "Desativar plug-in",
  "nav.inspect": "Inspecionar elemento",

  "footer.downloading": "Baixando atualização {progress}%",
  "footer.downloadingIndeterminate": "Baixando atualização…",
  "footer.restartToUpdate": "Reiniciar para atualizar",
  "footer.installing": "Instalando…",
  "footer.updatesSoon": "Atualizações em breve",
  "footer.updateFailed": "Falha na atualização",
  "footer.updateCheckFailed": "Não foi possível verificar atualizações",
  "footer.updateDownloadFailed": "Não foi possível baixar a atualização",
  "footer.updateInstallFailed": "Não foi possível instalar a atualização",
  "footer.refreshing": "Atualizando…",
  "footer.paused": "Pausado",
  "footer.nextUpdate": "Atualização em {time}",
  "footer.refreshNow": "Atualizar agora",

  "duration.dh": "{d} d {h} h",
  "duration.hm": "{h} h {m} min",
  "duration.ms": "{m} min {s} s",
  "duration.m": "{m} min",
  "duration.s": "{s} s",
  "duration.lt1m": "<1 min",

  "settings.autoRefresh.title": "Atualização automática",
  "settings.autoRefresh.desc": "Com que frequência o uso é atualizado",
  "settings.autoRefresh.minutes": "{n} min",
  "settings.autoRefresh.smart": "Inteligente",
  "settings.autoRefresh.smartHint": "Verifica a cada 2 minutos após mudanças no uso. Se não mudar por algumas verificações, o intervalo passa para 5, 10 e depois 15 minutos por conta.",
  "settings.autoRefresh.hour": "1 hora",
  "settings.usageMode.title": "Exibição de uso",
  "settings.usageMode.desc": "Mostre o que resta ou o que já foi usado",
  "settings.usageMode.left": "Restante",
  "settings.usageMode.used": "Usado",
  "settings.usageMode.workdays": "Ritmo semanal em dias úteis",
  "settings.usageMode.workdaysHint": "Conta só de segunda a sexta, para que um fim de semana tranquilo não pareça folga.",
  "settings.currency.title": "Moeda",
  "settings.currency.desc": "Mostrar custos em outra moeda com a cotação que você informar",
  "settings.currency.rate": "1 USD em {code}",
  "settings.currency.hint": "A cotação não é buscada online: atualize-a de vez em quando. Os provedores cobram em dólares americanos.",
  "settings.resetTimers.title": "Timers de redefinição",
  "settings.resetTimers.desc": "Contagem regressiva ou horário",
  "settings.resetTimers.relative": "Relativo",
  "settings.resetTimers.absolute": "Absoluto",
  "settings.resetTimers.todayAt": "hoje às {time}",
  "settings.timeFormat.title": "Formato de hora",
  "settings.timeFormat.desc": "Relógio de 12 ou 24 horas",
  "settings.timeFormat.auto": "Automático",
  "settings.timeFormat.12h": "12 horas",
  "settings.timeFormat.24h": "24 horas",
  "settings.tray.title": "Ícone na barra de tarefas",
  "settings.tray.desc": "O que aparece ao lado do relógio na barra de tarefas",
  "settings.tray.icon": "Ícone",
  "settings.tray.percent": "Porcentagem",
  "settings.tray.bars": "Barras",
  "settings.tray.numbers": "Número por provedor",
  "settings.tray.logos": "Logo por provedor",
  "settings.tray.logoColors": "Logos coloridos",
  "settings.strip.title": "Faixa na barra de tarefas (experimental)",
  "settings.strip.desc": "Logotipos dos provedores com uso da sessão e semanal na barra de tarefas.",

  "settings.widgets.title": "Widgets na área de trabalho",

  "settings.widgets.desc": "Logos dos provedores com o uso da sessão e semanal, em qualquer lugar da área de trabalho.",

  "settings.stripLook.title": "Aparência da faixa e dos widgets",

  "settings.stripLook.desc": "Os provedores, a fonte e as cores que a faixa e os widgets compartilham.",

  "settings.categories": "Categorias de configurações",


  "settings.cards.sessionsOnOverview": "Também na visão geral (desativado: só na página de um cartão)",


  "settings.newBadge": "Novo",


  "settings.plugins.signedOut": "Desconectado",


  "settings.claudeCode.desktopLogin": "Usar o login do app Claude",


  "settings.claudeCode.desktopLoginHint": "Se o Claude Code não estiver conectado, o cartão do Claude lê o uso com o login do app Claude. Ele só é lido, nunca renovado.",


  "settings.configBroken": "Não salvo: ~/.openusage/config.json não é um JSON válido. Corrija ou apague esse arquivo e salve de novo.",


  "settings.strip.desktopEdgeSide": "Borda",


  "settings.strip.desktopEdgeRight": "Direita",


  "settings.strip.desktopEdgeLeft": "Esquerda",


  "settings.strip.desktopEdgeTop": "Topo",


  "settings.strip.desktopPinned": "Manter aberta a barra da borda da tela (também pelo botão de fixar)",


  "settings.strip.onlyWhileRunning": "Só enquanto uma ferramenta de IA estiver rodando",


  "settings.strip.onlyWhileRunningHint": "A faixa some enquanto nenhum app ou CLI dos seus provedores (Claude Code, Codex, …) estiver rodando.",


  "settings.strip.desktopSlide": "Deslizar suavemente a barra da borda da tela",


  "settings.strip.desktopSlideMs": "Duração do deslizamento",


  "settings.strip.desktopGradient": "Degradê suave na barra da borda da tela",


  "whatsNew.title": "Novidades",


  "whatsNew.close": "Fechar",


  "whatsNew.video": "Um vídeo curto com as novidades desta versão",


  "settings.whatsNew.title": "Novidades",


  "settings.whatsNew.label": "Mostrar as novidades depois de uma atualização",


  "settings.whatsNew.hint": "Uma vez, na primeira vez que o painel abre após uma atualização: as notas da versão e um vídeo curto, se a atualização trouxer um. O vídeo é apagado quando você fecha a janela.",


  "rate.perMinute": "{tokens}/min",


  "settings.strip.tokenRate": "Tokens por minuto ao vivo (Claude, Codex), também na dica da bandeja",


  "settings.strip.desktopEdge": "Borda da tela",


  "settings.strip.desktopEdgeHint": "Encaixado em uma borda da tela (direita, esquerda ou topo), quase escondido; desliza para fora sob o ponteiro.",


  "settings.cards.tokscale": "Cerca de 30 ferramentas a mais pelo tokscale (Gemini CLI, Copilot, Kiro…)",


  "settings.cards.tokscaleHint": "Executa o tokscale, de código aberto, com bunx ou npx (precisa de bun ou Node.js), que baixa a si mesmo e sua lista de preços. Lê os logs locais dessas ferramentas no máximo a cada 30 minutos.",


  "settings.balances.title": "Saldos personalizados",


  "settings.balances.desc": "New API, One API, Sub2API ou seu próprio endpoint: o saldo deles no cartão Custom balances",


  "settings.balances.name": "Nome",


  "settings.balances.preset": "Tipo",


  "settings.balances.custom": "Endpoint personalizado",


  "settings.balances.url": "Endereço",


  "settings.balances.env": "Variável de ambiente com a chave (OTU_…)",


  "settings.balances.userId": "ID do usuário",


  "settings.balances.path": "Caminho",


  "settings.balances.remaining": "Saldo em",


  "settings.balances.used": "Usado em",


  "settings.balances.total": "Total em",


  "settings.balances.divisor": "Dividir por",


  "settings.balances.currency": "Moeda",


  "settings.balances.auth": "Cabeçalho da chave",


  "settings.balances.remove": "Remover",


  "settings.balances.add": "Adicionar saldo",


  "settings.balances.save": "Salvar",


  "settings.balances.saved": "Salvo. Ative o cartão Custom balances para vê-los.",


  "settings.balances.invalid": "Não salvo: confira o endereço, o nome da variável (OTU_ e depois A–Z, 0–9, _) e os caminhos.",


  "settings.balances.hint": "A chave nunca é salva: coloque-a numa variável de ambiente e digite o nome dela. Os caminhos apontam para dentro da resposta, como data.balance.",


  "year.title": "Uso no ano",


  "year.streak": "sequência de {days} dias",


  "year.summary": "Maior sequência {longest} dias · {active} dias ativos · {tokens} tokens",


  "year.cell": "{date}: {tokens} tokens",


  "settings.cards.yearHeatmap": "Um ano de uso diário com sequências nas páginas do Claude e do Codex",


  "settings.cards.keepUsage": "Manter o uso cujos registros foram apagados",


  "settings.cards.keepUsageHint": "O Claude Code apaga seus registros após 30 dias por padrão. Os tokens de cada dia ficam na pasta de dados do app, para que o ano e a exportação continuem contando.",


  "settings.export.title": "Exportar uso",


  "settings.export.desc": "Tokens por dia e os últimos limites em CSV e JSON em Downloads",


  "settings.export.now": "Exportar agora",


  "settings.export.done": "Salvo: {path}",


  "settings.export.failed": "Não foi possível gravar a exportação.",


  "settings.export.daily": "Gravar de novo uma vez por dia",


  "card.sessions.cache": "cache {time}",


  "card.sessions.cacheHint": "Tempo restante do cache de prompt desta sessão. Quando acabar, o próximo prompt reenvia todo o contexto e gasta mais do limite.",


  "settings.cards.cacheTimer": "Tempo restante do cache de prompt de uma sessão do Claude",


  "settings.cards.contextFill": "Quão cheio está o contexto de cada sessão",


  "spend.planMultiple": "{name}: {times}× o plano",


  "spend.planMultipleHint": "30 dias a preços de API ({cost}) valem {times} vezes o preço mensal do plano ({price}).",


  "settings.plans.title": "Assinaturas",


  "settings.plans.desc": "Quanto cada plano custa por mês, para comparar com o uso a preços de API",


  "settings.plans.multiple": "Mostrar no resumo de gastos o uso de cada plano como múltiplo do preço",


  "settings.plans.price": "{name}: preço mensal",


  "settings.claudeCode.retention": "Guardar os registros do Claude Code por",


  "settings.claudeCode.retentionDays": "{days} dias",


  "settings.claudeCode.retentionHint": "O Claude Code apaga transcrições mais antigas ao iniciar. A grade por hora, os projetos e os gastos são lidos delas.",


  "settings.alerts.refills": "Quando um limite recarrega antes de reiniciar (um crédito de reinício ou uma recarga parcial)",


  "settings.alerts.refillPoints": "Em pelo menos",


  "settings.alerts.points": "{points} pontos",


  "settings.strip.followDetail": "Em detalhe: cada limite com o tempo até reiniciar",


  "settings.strip.activityDots": "Ponto no logo enquanto o agente trabalha (verde) ou espera por você (amarelo)",


  "settings.strip.desktopClickThroughKey": "Segure esta tecla para clicar ou arrastar",


  "settings.cards.title": "Nos cartões",


  "settings.cards.desc": "O que a visão geral mostra além dos limites",


  "settings.cards.liveSessions": "Sessões ativas do Claude Code e do Codex nos cartões",


  "settings.cards.spend": "Resumo de gastos abaixo dos cartões",


  "settings.cards.spendTools": "Contar também os registros próprios destas ferramentas",


  "alert.refill.title": "{provider}: {label} recarregou antes do prazo",


  "alert.refill.body": "{percent}% está disponível de novo.",


  "settings.strip.followActive": "Seguir o app ativo",


  "settings.strip.followActiveHint": "A ferramenta de IA da janela que você está usando vem primeiro.",


  "settings.strip.desktopClickThrough": "Deixar os cliques passarem para a janela de trás",


  "spend.title": "Gastos",


  "spend.today": "Hoje",


  "spend.yesterday": "Ontem",


  "spend.month": "30 dias",


  "spend.cost": "Custo",


  "spend.tokens": "Tokens",


  "spend.models": "Modelos, últimos 30 dias (por tokens)",


  "settings.strip.desktopCycle": "Em turnos",


  "settings.strip.desktopCycleHint": "Um único widget que mostra cada provedor por 8 segundos",


  "settings.theme.halloween": "Halloween",


  "settings.theme.glass": "Vidro",


  "settings.theme.glassHint": "Desfoca a área de trabalho atrás do painel (Windows 11)",


  "label.Installed models": "Modelos instalados",


  "label.Loaded now": "Carregados agora",


  "label.Vouchers": "Cupons",


  "label.Cash": "Dinheiro",


  "label.Requests today": "Solicitações hoje",


  "label.Requests this month": "Solicitações este mês",


  "label.Models": "Modelos",


  "label.Token Plan usage": "Uso do Token Plan",


  "card.customize": "Personalizar linhas",


  "card.customizeHint": "Arraste as linhas para ordená-las e oculte as que não precisa. Ctrl+Z desfaz, Esc fecha.",


  "card.customizeMove": "Mover {row}",


  "card.customizeShow": "Mostrar {row}",


  "card.customizeHide": "Ocultar {row}",


  "card.customizeReset": "Voltar ao padrão",


  "card.customizeDone": "Concluído",


  "weekDays.capacity": "Com a mistura de modelos desta semana, o limite inteiro equivale a cerca de {tokens} tokens, {cost} a preços de API.",


  "weekDays.capacityTokens": "Com a mistura de modelos desta semana, o limite inteiro equivale a cerca de {tokens} tokens.",


  "card.copyImage": "Copiar como imagem",


  "card.imageCopied": "Copiado para a área de transferência",


  "card.imageCopyFailed": "Não foi possível copiar a imagem",


  "settings.privacy.title": "Privacidade",


  "settings.privacy.hideWhenSharing": "Ocultar ao compartilhar a tela",


  "settings.privacy.hideWhenSharingHint": "O painel e os widgets da área de trabalho nunca aparecem em compartilhamentos de tela, gravações ou capturas; você continua vendo. O Windows não avisa os apps quando a tela é compartilhada, então os números da área de notificação e a faixa da barra de tarefas só somem enquanto você apresenta ou alguém controla este PC remotamente.",


  "settings.backup.reset": "Redefinir todas as configurações",


  "settings.backup.resetHint": "Todas as preferências voltam ao padrão. Seus provedores, contas e orçamentos de projetos continuam. O app reinicia.",


  "settings.backup.resetConfirm": "Redefinir e reiniciar",


  "settings.backup.resetCancel": "Cancelar",


  "settings.backup.resetError": "Não foi possível redefinir as configurações.",


  "settings.proxy.title": "Proxy",


  "settings.proxy.desc": "Envie as solicitações de provedores, páginas de status e atualizações por um servidor proxy.",


  "settings.proxy.enable": "Usar um proxy",


  "settings.proxy.url": "Endereço do proxy",


  "settings.proxy.save": "Salvar",


  "settings.proxy.saved": "Salvo; vale a partir da próxima solicitação.",


  "settings.proxy.invalid": "Isso não é um endereço de proxy. Use http://, https://, socks5:// ou socks5h:// com um host, por exemplo http://127.0.0.1:8080.",


  "settings.proxy.error": "Não foi possível salvar o proxy.",


  "card.showUsed": "Mostrar o usado",


  "card.showLeft": "Mostrar o restante",

  "settings.category.usage": "Uso",

  "settings.category.taskbar": "Barra de tarefas e área de trabalho",

  "settings.category.appearance": "Aparência",

  "settings.category.app": "Aplicativo",
  "settings.strip.position": "Posição",
  "settings.strip.positionLeft": "Esquerda",
  "settings.strip.positionRight": "Direita",

  "settings.strip.positionCenter": "Centro",
  "settings.strip.offset": "Espaçamento (px)",
  "settings.strip.positionHint": "Direita fica ao lado da bandeja. A outra opção segue o alinhamento dos ícones do Windows: a borda esquerda quando estão centralizados, o centro quando estão à esquerda. A faixa não cobre Iniciar, apps nem Widgets. O espaçamento acompanha a escala da tela.",
  "settings.strip.enable": "Mostrar na barra de tarefas",
  "settings.strip.enableHint": "O Windows não tem um lugar oficial para isso, então uma atualização pode movê-la ou ocultá-la. Enquanto estiver ativa, a área de notificação mostra só o ícone do app; escolher outro estilo de ícone desativa a faixa.",
  "settings.strip.preview": "Prévia",
  "settings.strip.providers": "Provedores (até {max})",
  "settings.strip.providersHint": "Marque para mostrar, arraste para reordenar. Esta ordem vale só para a faixa.",
  "settings.strip.monitors": "Mostrar em",
  "settings.strip.monitorsPrimary": "Barra de tarefas principal",
  "settings.strip.monitorsAll": "Todas as barras de tarefas",
  "settings.strip.monitorsPick": "Escolher monitores",
  "settings.strip.monitorMain": "{name} (principal)",
  "settings.strip.monitorDisconnected": "{name} (desconectado)",
  "settings.strip.monitorNoTaskbar": "{name} (sem barra de tarefas)",
  "settings.strip.monitorsHint": "Um monitor só mostra a faixa se tiver barra de tarefas: nas configurações da barra de tarefas do Windows, ative a exibição em todas as telas.",
  "settings.accounts.title": "Contas extras",
  "settings.accounts.desc": "Acompanhe um segundo login do Claude ou do Codex, como trabalho e pessoal, cada um no seu próprio cartão.",
  "settings.accounts.provider": "Provedor",
  "settings.accounts.label": "Nome da conta",
  "settings.accounts.labelPlaceholder": "Trabalho, Pessoal…",
  "settings.accounts.add": "Adicionar e entrar",
  "settings.accounts.signIn": "Entrar",
  "settings.accounts.copyPath": "Copiar caminho da pasta",
  "settings.accounts.remove": "Remover",
  "settings.accounts.confirmRemove": "Clique de novo para remover",
  "settings.accounts.addFailed": "Não foi possível adicionar a conta.",
  "settings.accounts.hint": "Ao adicionar, abre-se um terminal onde você entra uma vez. O login fica na pasta própria da conta, então seu login de sempre não é alterado. Para usar a conta também no terminal, aponte CLAUDE_CONFIG_DIR ou CODEX_HOME para essa pasta.",
  "settings.claudeCode.title": "Linha de status do Claude Code",
  "settings.claudeCode.desc": "O Claude Code passa ao app o próprio uso de 5 horas e semanal, então o cartão do Claude consulta a Anthropic bem menos e esbarra menos no limite de requisições.",
  "settings.claudeCode.label": "Usar a linha de status do Claude Code",
  "settings.claudeCode.hint": "Adiciona um comando de linha de status ao settings.json do Claude; desativar remove. O Claude Code não mostra nada na linha de status e envia o uso com o curl, que vem com o Windows.",
  "settings.claudeCode.other": "O Claude Code já executa uma linha de status sua. Ela fica como está, então esta opção continua desativada.",
  "settings.claudeCode.unreadable": "Não foi possível ler o settings.json do Claude como JSON, então ele não foi alterado.",
  "settings.strip.lineMode": "Valores mostrados para {name}",
  "settings.strip.lineBoth": "Ambos",
  "settings.strip.colorMode": "Colorir pelo uso",
  "settings.strip.colorHeat": "Calor (amarelo → laranja → vermelho)",
  "settings.strip.colorTraffic": "Semáforo (verde → amarelo → vermelho)",
  "settings.strip.colorCool": "Frio (azul → roxo → vermelho)",
  "settings.strip.colorMono": "Simples, vermelho só perto do limite",

  "settings.strip.colorPace": "Conforme o ritmo",
  "settings.strip.colorThresholds": "Limites personalizados",
  "settings.strip.colorOff": "Desativado",
  "settings.strip.drag": "Arrastar {name}",
  "settings.strip.font": "Fonte",
  "settings.strip.size": "Tamanho",
  "settings.strip.bold": "Negrito",
  "settings.strip.showPercentSign": "Mostrar o sinal %",
  "settings.strip.customTextColor": "Cor do texto personalizada",
  "settings.strip.warnAt": "Aviso a partir de",
  "settings.strip.criticalAt": "Crítico a partir de",
  "settings.strip.usageColorsHint": "Com base na parte do limite já usada.",
  "settings.strip.reset": "Restaurar aparência",
  "settings.strip.desktop": "Mostrar na área de trabalho",
  "settings.strip.desktopHint": "Widgets que você arrasta para qualquer lugar; um clique abre o painel e, com o ponteiro em cima, você vê quando os limites são redefinidos. Um número que sobe pisca e depois fica um minuto na cor de destaque. Eles somem enquanto um app em tela cheia está na frente. Os provedores e a aparência abaixo valem também para eles.",
  "settings.strip.desktopLayout": "Widgets",
  "settings.strip.desktopRow": "Lado a lado",

  "settings.strip.desktopColumn": "Empilhados",
  "settings.strip.desktopSeparate": "Separados",
  "settings.strip.desktopPlate": "Opacidade do fundo",
  "settings.strip.desktopLogo": "Logotipos",
  "settings.strip.desktopLogoBrand": "Colorido",
  "settings.strip.desktopLogoWhite": "Branco",
  "settings.strip.desktopLogoBlack": "Preto",
  "settings.strip.desktopOnTop": "Sempre em primeiro plano",
  "settings.strip.desktopSnap": "Encaixar nas bordas da tela e entre si",
  "settings.strip.desktopLocked": "Travar a posição (transparente sob o ponteiro)",

  "settings.strip.desktopBars": "Barras sob os números",
  "settings.tray.perProviderHint": "Se um ícone for parar em ^, ative-o nas configurações da barra de tarefas para mantê-lo ao lado do relógio.",
  "settings.tray.openTaskbarSettings": "Abrir configurações da barra de tarefas",
  "settings.tray.provider": "Provedor",
  "settings.tray.metric": "Métrica",
  "settings.tray.color": "Cor",
  "settings.tray.colorTitle": "Cor do texto da porcentagem",
  "settings.tray.paceColor": "Cor conforme o ritmo",
  "settings.tray.paceColorHint": "Verde: folga de sobra. Amarelo: dentro do previsto. Vermelho: vai acabar antes da redefinição.",
  "settings.tray.auto": "Automático",
  "settings.tray.tightest": "Mais usado",
  "settings.theme.title": "Tema",
  "settings.theme.desc": "Escuro (preto puro), claro ou Halloween",
  "settings.theme.light": "Claro",
  "settings.theme.dark": "Escuro",
  "settings.theme.darkHint": "Preto puro, ideal para telas OLED",
  "settings.language.title": "Idioma",
  "settings.language.desc": "Idioma dos textos do aplicativo",
  "settings.language.system": "Padrão do Windows",
  "settings.shortcut.title": "Atalho global",
  "settings.shortcut.desc": "Mostre o painel de qualquer lugar",
  "settings.shortcut.pressKeys": "Pressione as teclas…",
  "settings.shortcut.clickToSet": "Clique para definir",
  "settings.shortcut.record": "Pressione as teclas para gravar o atalho",
  "settings.shortcut.clear": "Limpar atalho",
  "settings.shortcut.hint": "Pressione Esc durante a gravação para limpar.",
  "settings.startOnLogin.title": "Inicialização",
  "settings.startOnLogin.desc": "Abrir o OpenTokenUsage ao entrar no Windows",
  "settings.startOnLogin.label": "Iniciar ao entrar",
  "settings.backup.title": "Backup das configurações",
  "settings.backup.desc": "Leve suas preferências para outro computador. Logins e contas não são incluídos.",
  "settings.backup.export": "Exportar",
  "settings.backup.import": "Importar e reiniciar",
  "settings.backup.saved": "Salvo em {path}",
  "settings.backup.exportError": "Não foi possível salvar o backup.",
  "settings.backup.importError": "Não foi possível ler o arquivo.",
  "settings.backup.notBackup": "Esse arquivo não é um backup de configurações do OpenTokenUsage.",
  "settings.alerts.title": "Notificações",
  "settings.alerts.desc": "Limites de uso, ritmo, redefinições de limites e redefinições guardadas que expiram em sete dias ou 24 horas",
  "settings.alerts.label": "Notificações de uso",
  "settings.panel.title": "Painel",
  "settings.panel.desc": "Onde o painel abre. O alfinete na barra de título o mantém acima das outras janelas.",
  "settings.panel.remember": "Lembrar a posição",
  "settings.panel.rememberHint": "Arraste o painel pela barra de título e, na próxima vez, ele abre no mesmo lugar em vez de acima da barra de tarefas.",
  "settings.panel.navSide": "Barra de provedores",
  "settings.panel.navLeft": "Esquerda",
  "settings.panel.navRight": "Direita",
  "settings.alerts.levels": "Notificar em",
  "settings.alerts.ticksHint": "As barras marcam cada nível com um entalhe.",
  "settings.alerts.perProvider": "Por provedor",
  "settings.alerts.sameAsAll": "Igual a todos os provedores",
  "settings.alerts.spikes": "Quando uma sessão gasta tokens muito mais rápido que o normal (muitas vezes um agente preso em um loop)",
  "settings.alerts.none": "nenhum",
  "settings.alerts.sound": "Som",
  "settings.alerts.play": "Tocar",
  "settings.alerts.chooseFile": "Usar meu próprio som…",
  "settings.alerts.fileHint": "MP3, WAV, OGG ou M4A. Sons mais longos são cortados em {seconds} segundos.",
  "settings.alerts.fileError": "Não é possível tocar este arquivo. Tente um arquivo MP3 ou WAV.",
  "settings.alerts.fileTooLarge": "Este arquivo tem mais de {mb} MB. Escolha um som mais curto.",
  "sound.windows": "Padrão do Windows",
  "sound.chime": "Carrilhão",
  "sound.glass": "Vidro",
  "sound.steel": "Tambor de aço",
  "sound.pizzicato": "Pizzicato",
  "sound.retro": "Retrô",
  "sound.two-tone": "Dois tons",
  "sound.three-tone": "Três tons",
  "sound.rise": "Subida",
  "sound.none": "Sem som",
  "sound.custom": "Meu som: {name}",
  "settings.plugins.title": "Provedores",
  "settings.plugins.desc": "Marque para ativar um provedor e arraste para reordenar. O olho mostra ou oculta o provedor no ícone da área de notificação, ao lado do relógio.",
  "settings.plugins.inTray": "Exibido no ícone da área de notificação. Clique para ocultá-lo ali (ele continua no menu lateral).",
  "settings.plugins.notInTray": "Oculto do ícone da área de notificação. Clique para exibi-lo.",

  "overview.noProviders": "Nenhum provedor ativado",
  "status.minor": "Serviço degradado",
  "status.major": "Interrupção parcial",
  "status.critical": "Interrupção grave",
  "status.maintenance": "Manutenção",
  "status.open": "Abrir página de status",

  "card.retry": "Tentar novamente",
  "error.runInTerminal": "Executar {cmd} no terminal",
  "error.envSteps": "Copie sua chave em Chaves de API, depois abra Variáveis de Ambiente e crie uma variável de usuário chamada {name} com essa chave. A próxima atualização a detecta.",
  "error.openEnvEditor": "Abrir Variáveis de Ambiente",
  "card.updated": "Atualizado {time}",
  "card.justNow": "agora mesmo",
  "card.minutesAgo": "há {n} min",
  "card.hoursAgo": "há {n} h",
  "card.daysAgo": "há {n} d",
  "card.availableIn": "Disponível em {time}",
  "card.limitReached": "Limite atingido",
  "card.valueLeft": "{value} restante",
  "card.percentCap": "Limite de {value}%",
  "card.amountLimit": "Limite de {value}",
  "card.sessions.title": "Sessões ativas",
  "card.sessions.busy": "Trabalhando",
  "card.sessions.shell": "Executando um comando",
  "card.sessions.idle": "Ociosa",
  "card.sessions.waiting": "Esperando você",
  "card.sessions.context": "{percent}% do contexto",
  "card.sessions.compactSoon": "Compacta em breve",
  "detail.cost": "Custo",
  "detail.models": "Modelos",
  "heatmap.title": "Uso por hora, últimas 4 semanas",
  "weekDays.title": "Limite semanal por dia",
  "weekDays.day": "{day}: cerca de {percent} do limite semanal",
  "weekDays.note": "Os {percent} do limite semanal usados até agora, divididos pelo custo dos tokens de cada dia (dos logs locais).",
  "weekDays.loadFailed": "Não foi possível ler os dias. Nova tentativa em alguns minutos.",
  "heatmap.peak": "Horário de maior uso: {day} {hour}",
  "heatmap.cell": "{day} {hour}: {tokens} tokens",
  "heatmap.dayTotal": "{day}, nas 4 semanas: {tokens} tokens",
  "heatmap.unreadable": "Arquivos de log que não puderam ser lidos: {count}",
  "projects.title": "Projetos",
  "projects.thisMonth": "Este mês",
  "projects.lastMonth": "Mês passado",
  "projects.weeklyLimit": "Limite semanal",
  "projects.total": "Total",
  "projects.tokens": "{tokens} tokens",
  "projects.noBranch": "Sem branch",
  "projects.unknown": "Pasta desconhecida",
  "projects.more": "Mostrar mais {count}",
  "projects.less": "Mostrar menos",
  "projects.empty": "Sem uso neste mês.",
  "projects.emptyWeek": "Sem uso neste limite semanal.",
  "projects.unattributed": "{cost} não pôde ser associado a um projeto.",
  "projects.apiPrices": "A preços de tabela da API: quanto este uso custaria pela API, não o que o seu plano cobra.",
  "projects.unpriced": "Os custos precisam de bun ou Node.js (para o ccusage), então são mostrados tokens.",
  "projects.unpricedFailed": "O ccusage não conseguiu calcular o custo deste mês agora, então são mostrados tokens; ele tenta de novo em alguns minutos.",
  "projects.unpricedFailedWeek": "O ccusage não conseguiu calcular o custo deste limite semanal agora, então são mostrados tokens; ele tenta de novo em alguns minutos.",
  "projects.loadFailed": "Não foi possível ler os projetos. Nova tentativa em alguns minutos.",
  "projects.forecast": "{cost} no fim do mês neste ritmo",
  "projects.budget": "Orçamento mensal",
  "projects.budgetSave": "Salvar",
  "projects.budgetRemove": "Remover",
  "projects.budgetInvalid": "Digite um valor, como 50 ou 1.250,50.",
  "projects.budgetUsed": "{percent} do orçamento usado ({spent} de {budget})",
  "projects.export": "Exportar CSV",
  "projects.saved": "Salvo em {path}",
  "projects.exportFailed": "Não foi possível salvar o arquivo.",
  "projects.alert.title": "Orçamento de {project} ({provider})",
  "projects.alert.body": "{percent} do orçamento mensal de {budget} usado: {spent} até agora.",

  "pace.ahead": "Folga de sobra",
  "pace.onTrack": "Dentro do previsto",
  "pace.behind": "Vai acabar",
  "pace.limitIn": "Limite em {time}",
  "pace.usedAtReset": "{percent}% usado na redefinição",
  "pace.leftAtReset": "{percent}% restante na redefinição",
  "pace.runsOutIn": "Acaba em {time}",
  "pace.short": "Faltam {value}",
  "pace.deficit": "Déficit de {value}",
  "pace.markerHint": "A linha marca um ritmo constante: {percent}% do período já passou",

  "reset.soon": "Redefine em breve",
  "reset.in": "Redefine em {time}",
  "reset.todayAt": "Redefine hoje às {time}",
  "reset.tomorrowAt": "Redefine amanhã às {time}",
  "reset.onDateAt": "Redefine em {date} às {time}",
  "alert.threshold.title": "{provider}: {label} com {percent}% usado",
  "alert.threshold.left": "{provider}: {label} com {percent}% restante",
  "alert.reset.title": "{provider}: {label} redefinido",
  "alert.reset.body": "Seu limite está disponível novamente.",
  "alert.pace.title": "{provider}: {label} está acabando",
  "alert.pace.body": "Nesse ritmo, você atingirá o limite em {time}, antes da redefinição.",
  "alert.spike.title": "{provider}: {folder} está gastando tokens muito rápido",
  "alert.spike.body": "{tokens} tokens em um quarto de hora, {times}× o normal. Um agente preso em um loop?",
  "alert.update.title": "OpenTokenUsage {version} está pronto",
  "alert.update.body": "Abra o painel e escolha Reiniciar para atualizar.",
  "alert.signIn.title": "{provider}: entre novamente",
  "alert.signIn.body": "O uso não será atualizado até você entrar novamente.",

  "sparkline.peak": "pico {value}",
  "sparkline.summary": "{label}: {days} dias, último {latest} em {date}, pico {peak}.",

  "about.viewChangelog": "Ver histórico de alterações",
  "about.windowsPort": "Versão para Windows",
  "about.source": "Código-fonte",
  "support.buyMeACoffee": "Me pague um café",
  "support.navLabel": "Apoiar o OpenTokenUsage",
  "support.title": "Seu parceiro em cada projeto",
  "support.body": "O OpenTokenUsage acompanha seus limites enquanto você cria, para que nenhum te pegue de surpresa no meio de uma ideia. Uma única pessoa o mantém: novos provedores, correções quando uma API muda e cada tradução.",
  "support.ask": "Se o que você cria com IA já começou a dar retorno, divida um pouco com o app que esteve ao seu lado o tempo todo. Um café paga as horas de trabalho e mantém as atualizações chegando.",
  "support.later": "Talvez depois",
  "support.starAsk": "Ou dê uma estrela no GitHub: é grátis e ajuda outras pessoas a encontrar o app.",
  "star.title": "Está gostando do OpenTokenUsage?",
  "star.body": "Uma estrela no GitHub é grátis e ajuda outras pessoas a encontrá-lo.",
  "star.button": "Dar uma estrela no GitHub",
  "faq.title": "Perguntas frequentes",
  "faq.notDetected.q": "Um provedor diz que não foi detectado. E agora?",
  "faq.notDetected.a": "O OpenTokenUsage lê o login que o app ou a CLI do provedor salvou neste PC. Entre por lá, ou use o botão do cartão quando ele aparecer (ele roda o comando de login em um terminal), e depois atualize.",
  "faq.refresh.q": "Com que frequência o uso é atualizado?",
  "faq.refresh.a": "Isso é definido em {settings} → {autoRefresh}. {smart} verifica a cada 2 minutos enquanto o uso muda (Claude a cada 10) e desacelera até 15 minutos quando não muda. Clicar na contagem regressiva no canto inferior direito atualiza na hora; um provedor atualizado manualmente espera 5 minutos até a próxima vez.",
  "faq.rateLimited.q": "Por que o Claude diz que atingiu o limite de requisições?",
  "faq.rateLimited.a": "A Anthropic permite cerca de 30 leituras de uso por hora por login, compartilhadas com o Claude Code e qualquer outra ferramenta que mostre seu uso. Quando acabam, a Anthropic pede uma espera de até uma hora, e o app respeita isso, mesmo depois de reiniciar. Para consultar menos, ative {settings} → {claudeCode}: o Claude Code passa então o próprio uso ao app.",
  "faq.accounts.q": "Posso acompanhar uma segunda conta do Claude ou do Codex?",
  "faq.accounts.a": "Sim: {settings} → {accounts} adiciona uma com login e cartão próprios. Outro login dentro de uma distribuição WSL em execução ganha um cartão próprio terminado em “· WSL”.",
  "faq.taskbar.q": "Posso ver o uso sem abrir o painel?",
  "faq.taskbar.a": "Sim. {settings} → {tray} pode mostrar um número ou logo por provedor ao lado do relógio, {strip} coloca o uso da sessão e semanal direto na barra de tarefas, e {alerts} avisa você nos níveis que escolher.",
  "faq.privacy.q": "Meus dados saem deste PC?",
  "faq.privacy.a": "Não há telemetria, análises nem servidor próprio. O app se comunica com os provedores que você usa, com o login que já está neste PC, com as páginas de status deles e com o GitHub para atualizações. As configurações e o uso em cache ficam neste PC.",
  "faq.update.q": "Como atualizo?",
  "faq.update.a": "O app verifica a cada 15 minutos e baixa uma nova versão sozinho. Quando ela está pronta, uma notificação avisa e “{restart}” aparece no canto inferior esquerdo. Com o WinGet: winget upgrade PowerUserZ.OpenTokenUsage",
  "faq.askOnGitHub": "Não encontrou sua resposta? Pergunte no GitHub",
  "changelog.title": "Notas de versão",
  "changelog.back": "Voltar",
  "changelog.loading": "Obtendo informações da versão…",
  "changelog.failed": "Não foi possível carregar as notas de versão",
  "changelog.failedHint": "Verifique sua conexão com a internet ou tente de novo em alguns minutos.",
  "changelog.tryAgain": "Tentar novamente",
  "changelog.releasedOn": "Publicado em {date}",
  "changelog.unpublished": "Versão não publicada",
  "changelog.olderVersions": "Procurando versões anteriores?",
  "changelog.fullChangelog": "Ver o histórico de alterações completo",
  "changelog.noNotes": "Não há notas de versão para v{version}",
  "changelog.noNotesHint": "Pode ser uma versão de pré-lançamento ou um build local.",
  "changelog.viewAll": "Ver todas as versões no GitHub",

  "label.Session": "Sessão",
  "label.Weekly": "Semanal",
  "label.Claude Weekly": "Claude semanal",
  "label.Argon Weekly": "Argon semanal",
  "label.Monthly": "Mensal",
  "label.Today": "Hoje",
  "label.Yesterday": "Ontem",
  "label.Last 30 Days": "Últimos 30 dias",
  "label.Cache Hit Rate": "Taxa de acerto do cache",
  "label.Credits": "Créditos",
  "label.Balance": "Saldo",
  "label.Status": "Status",
  "label.API keys": "Chaves de API",
  "label.Dashboard": "Painel",
  "label.Usage dashboard": "Painel de uso",
  "label.Usage Trend": "Tendência de uso",
  "label.Rate Limit Resets": "Redefinições de limite",
  "label.Extra usage spent": "Gasto com uso extra",
  "label.Reviews": "Revisões",
  "label.Requests": "Solicitações",
  "label.Total usage": "Uso total",
  "label.Auto usage": "Uso do Auto",
  "label.API usage": "Uso da API",
  "label.On-demand": "Sob demanda",
}

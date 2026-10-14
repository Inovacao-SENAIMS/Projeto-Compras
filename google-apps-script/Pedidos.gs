/**
 * Pedidos.gs — domínio central: listar/detalhar/criar/tramitar requisições.
 * Espelha pedidos/services.py do Django:
 *  - assumir com LockService + recheck (anti-duplo-assunção);
 *  - retornos de status obrigatórios;
 *  - histórico para cada mudança.
 */

const P_COL = {
  numero: 1, produto: 2, descricao_objeto: 3, quantidade: 4, modalidade: 5,
  urgencia: 6, possui_cotacao: 7, solicitante_nome: 8, criado_por: 9,
  data_envio: 10, status: 11, responsavel: 12, retorno_final: 13,
  criado_em: 14, atualizado_em: 15, assumido_em: 16, concluido_em: 17,
};

function _pedidoObj(linha) {
  const p = {};
  Object.keys(P_COL).forEach((k) => { p[k] = linha[P_COL[k] - 1]; });
  return p;
}

function getPedido(numeroReq) {
  const linhas = aba("Pedidos").getDataRange().getValues();
  for (let i = 1; i < linhas.length; i++) {
    if (String(linhas[i][P_COL.numero - 1]) === String(numeroReq)) {
      return { p: _pedidoObj(linhas[i]), linha: i + 1, valores: linhas[i] };
    }
  }
  return null;
}

function _editarPedido(linha, muda) {
  const sh = aba("Pedidos");
  Object.keys(muda).forEach((k) => {
    if (P_COL[k] != null) sh.getRange(linha, P_COL[k]).setValue(muda[k]);
  });
  sh.getRange(linha, P_COL.atualizado_em).setValue(new Date());
}

function _registrarHistorico(p, de, para, usuario, observacao) {
  inserirLinha("HistoricoStatus", [
    String(p.numero), de || "", para, String(usuario.email).toLowerCase(),
    String(observacao || ""), new Date(),
  ]);
}

function _serealizarPedido(p) {
  return {
    numero: String(p.numero),
    produto: p.produto,
    descricao_objeto: p.descricao_objeto,
    quantidade: p.quantidade || 1,
    modalidade: p.modalidade,
    urgencia: p.urgencia,
    possui_cotacao: !!p.possui_cotacao,
    solicitante_nome: p.solicitante_nome,
    criado_por: String(p.criado_por).toLowerCase(),
    data_envio: iso(p.data_envio),
    status: String(p.status),
    responsavel: p.responsavel ? String(p.responsavel).toLowerCase() : "",
    responsavel_nome: p.responsavel ? nomeExibicao(p.responsavel) : "",
    retorno_final: p.retorno_final,
    criado_em: iso(p.criado_em),
    assumido_em: iso(p.assumido_em),
    concluido_em: iso(p.concluido_em),
    lead_time_dias: leadTimeDias(p),
  };
}

/* ------------------------------ listar ------------------------------ */

function apiListarPedidos(payload, usuario) {
  let pedidos = lerAba("Pedidos").map(_serealizarPedido);

  /* Visibilidade: solicitante vê só o próprio; equipe vê tudo. */
  if (!isEquipe(usuario)) {
    const em = String(usuario.email).toLowerCase();
    pedidos = pedidos.filter((p) => p.criado_por === em);
  }

  /* Filtros opcionais (o client aplica ordenação; o server filtra por perfis/status) */
  if (payload.status)  pedidos = pedidos.filter((p) => p.status === payload.status);
  if (payload.modalidade) pedidos = pedidos.filter((p) => p.modalidade === payload.modalidade);

  return { ok: true, data: pedidos };
}

function apiDetalharPedido(payload, usuario) {
  const reg = getPedido(String(payload.numero || ""));
  exigir(reg, "Requisição não encontrada: " + payload.numero);

  const p = _serealizarPedido(reg.p);
  if (!isEquipe(usuario)) {
    exigir(p.criado_por === String(usuario.email).toLowerCase(),
      "Sem permissão para ver esta requisição.");
  }

  const historicos = lerAba("HistoricoStatus")
    .filter((h) => String(h.numero_req) === String(payload.numero))
    .map((h) => ({
      de: h.de, para: h.para, usuario: nomeExibicao(h.usuario),
      observacao: h.observacao, criado_em: iso(h.criado_em),
    }));

  const anexos = lerAba("AnexosAudit")
    .filter((a) => String(a.numero_req) === String(payload.numero))
    .map((a) => ({
      id: String(a.id), tipo: a.tipo, nome_original: a.nome_original,
      enviado_por: nomeExibicao(a.enviado_por), enviado_em: iso(a.enviado_em),
    }));

  return { ok: true, data: { pedido: p, historicos, anexos, transicoes: TRANSICOES[p.status] || [] } };
}

/* ------------------------------ criar ------------------------------ */

function apiCriarPedido(payload, usuario) {
  exigir(String(payload.produto || "").trim(), "Informe o produto.");

  const sh = aba("Pedidos");
  exigir(String(payload.modalidade || "").length > 0, "Modalidade RCA obrigatória.");
  const p = {
    numero: proximoNumeroPedido(),
    produto: String(payload.produto).trim(),
    descricao_objeto: String(payload.descricao_objeto || "").trim(),
    quantidade: Number(payload.quantidade || 1),
    modalidade: String(payload.modalidade || ""),
    urgencia: String(payload.urgencia || "baixa"),
    possui_cotacao: !!payload.possui_cotacao,
    solicitante_nome: String(payload.solicitante_nome || "").trim() || nomeExibicao(usuario.email, usuario.nome_completo),
    criado_por: String(usuario.email).toLowerCase(),
    data_envio: null, status: STATUS.ABERTA, responsavel: "", retorno_final: "",
    criado_em: new Date(), atualizado_em: new Date(), assumido_em: null, concluido_em: null,
  };

  if (p.quantidade < 1) p.quantidade = 1;

  /* Documentação obrigatória; Cotação obrigatória quando possui_cotacao (spec). */
  const tiposEnviados = (payload.anexos || []).map((a) => String(a.tipo || ""));
  exigir(tiposEnviados.includes("documentacao"),
    "Documentação (anexo) é obrigatória no registro da requisição.");
  if (p.possui_cotacao) {
    exigir(tiposEnviados.includes("cotacao"),
      "Cotação (anexo) é obrigatória quando 'Possui cotação?' = Sim.");
  }

  sh.appendRow([
    p.numero, p.produto, p.descricao_objeto, p.quantidade, p.modalidade,
    p.urgencia, p.possui_cotacao, p.solicitante_nome, p.criado_por,
    p.data_envio, p.status, p.responsavel, p.retorno_final,
    p.criado_em, p.atualizado_em, p.assumido_em, p.concluido_em,
  ]);
  _registrarHistorico(p, "", STATUS.ABERTA, usuario, "Requisição criada pelo solicitante.");

  /* Anexos (opcional na criação; obrigatórios validados no client/server) */
  (payload.anexos || []).forEach((a) => _salvarAnexo(p.numero, a, usuario));

  return { ok: true, data: _serealizarPedido(p) };
}

/* ------------------------------ enviar ------------------------------ */

function apiEnviarPedido(payload, usuario) {
  const reg = getPedido(String(payload.numero || ""));
  exigir(reg, "Requisição não encontrada: " + payload.numero);
  const p = reg.p;

  exigir(String(p.criado_por).toLowerCase() === String(usuario.email).toLowerCase(),
    "Apenas o solicitante pode enviar a requisição.");
  exigir(String(p.status) === STATUS.ABERTA,
    "Somente requisições com status 'Aberta' podem ser enviadas.");

  _editarPedido(reg.linha, { status: STATUS.ENVIADA, data_envio: new Date() });
  _registrarHistorico(p, STATUS.ABERTA, STATUS.ENVIADA, usuario, "Requisição enviada pelo solicitante.");
  return { ok: true, data: { numero: p.numero, status: STATUS.ENVIADA } };
}

/* ------------------------------ assumir ------------------------------ */

function apiAssumirPedido(payload, usuario) {
  exigir(isEquipe(usuario), "Apenas a equipe de compras pode assumir requisições.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const reg = getPedido(String(payload.numero || ""));
    exigir(reg, "Requisição não encontrada: " + payload.numero);
    const p = reg.p;

    /* Recheck sob lock — equivale ao UPDATE condicional do Django. */
    if (!(String(p.status) === STATUS.ENVIADA && !p.responsavel)) {
      throw new Error("Esta requisição já foi assumida por outro membro da equipe.");
    }

    _editarPedido(reg.linha, {
      status: STATUS.EM_ANALISE,
      responsavel: String(usuario.email).toLowerCase(),
      assumido_em: new Date(),
    });
    _registrarHistorico(p, STATUS.ENVIADA, STATUS.EM_ANALISE, usuario,
      "Requisição assumida por " + nomeExibicao(usuario.email, usuario.nome_completo) + ".");
    return { ok: true, data: { numero: p.numero, status: STATUS.EM_ANALISE } };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------ designar ------------------------------ */

function apiDesignarPedido(payload, usuario) {
  exigir(isManager(usuario), "Apenas a Gestão pode designar/redesignar responsável.");

  const emailResp = String(payload.responsavel || "").trim().toLowerCase();
  exigir(emailResp, "Informe o novo responsável.");
  const alvo = buscarUsuario(emailResp);
  exigir(alvo && isValido(alvo), "Responsável inválido ou inativo.");
  exigir(isEquipe(alvo) || isSuper(alvo), "O responsável deve ser membro da equipe de compras.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const reg = getPedido(String(payload.numero || ""));
    exigir(reg, "Requisição não encontrada: " + payload.numero);
    const p = reg.p;

    exigir(!STATUS_TERMINAIS.includes(String(p.status)), "Requisição já finalizada não pode ser designada.");
    exigir(String(p.status) !== STATUS.ABERTA, "A requisição ainda não foi enviada pelo solicitante.");

    let de, observacao;
    if (String(p.status) === STATUS.ENVIADA) {
      de = STATUS.ENVIADA;
      observacao = "Designado para " + nomeExibicao(emailResp, alvo.nome_completo)
        + " por " + nomeExibicao(usuario.email, usuario.nome_completo) + ".";
      _editarPedido(reg.linha, {
        responsavel: emailResp, status: STATUS.EM_ANALISE, assumido_em: new Date(),
      });
    } else {
      de = String(p.status);
      observacao = "Redesignado de " + (p.responsavel ? nomeExibicao(p.responsavel) : "—")
        + " para " + nomeExibicao(emailResp, alvo.nome_completo)
        + " por " + nomeExibicao(usuario.email, usuario.nome_completo) + ".";
      _editarPedido(reg.linha, { responsavel: emailResp });
    }

    _registrarHistorico(p, de, STATUS.EM_ANALISE, usuario, observacao);
    return { ok: true, data: { numero: p.numero, responsavel: emailResp } };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------ tramitar ------------------------------ */

function apiTramitarPedido(payload, usuario) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const reg = getPedido(String(payload.numero || ""));
    exigir(reg, "Requisição não encontrada: " + payload.numero);
    const p = reg.p;

    const ehResponsavel = String(p.responsavel).toLowerCase() === String(usuario.email).toLowerCase();
    exigir(ehResponsavel || isManager(usuario),
      "Apenas o responsável (ou a gestão) pode alterar a tramitação.");

    const novo = String(payload.status || "");
    if (novo === String(p.status)) throw new Error("O pedido já está neste status.");
    const permitidos = TRANSICOES[String(p.status)] || [];
    exigir(permitidos.includes(novo),
      "Transição de '" + p.status + "' para '" + novo + "' não é permitida.");

    if (novo === STATUS.CONCLUIDA) {
      exigir(String(payload.retorno_final || "").trim(),
        "Informe o retorno final ao solicitar a conclusão da requisição.");
    }

    const muda = { status: novo };
    if (payload.retorno_final != null) muda.retorno_final = String(payload.retorno_final);
    if (payload.modalidade) muda.modalidade = String(payload.modalidade);
    if (STATUS_TERMINAIS.includes(novo)) muda.concluido_em = new Date();

    _editarPedido(reg.linha, muda);
    _registrarHistorico(p, String(p.status), novo, usuario, String(payload.observacao || ""));
    return { ok: true, data: { numero: p.numero, status: novo } };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------ excluir ------------------------------ */

function apiExcluirPedido(payload, usuario) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const reg = getPedido(String(payload.numero || ""));
    exigir(reg, "Requisição não encontrada: " + payload.numero);
    const p = reg.p;

    exigir(String(p.criado_por).toLowerCase() === String(usuario.email).toLowerCase(),
      "Apenas o solicitante pode excluir a requisição.");
    exigir(String(p.status) === STATUS.ABERTA && !p.responsavel,
      "Requisição já assumida — exclusão bloqueada para preservar o histórico.");

    /* anexos do Drive + linhas de auditoria */
    const anexos = lerAbaComLinha("AnexosAudit")
      .filter((a) => String(a.numero_req) === String(p.numero));
    anexos.reverse().forEach((a) => {
      try { DriveApp.getFileById(a.drive_file_id).setTrashed(true); } catch (e) { /* gone */ }
      removerLinha("AnexosAudit", a.__linha__);
    });

    const hist = lerAbaComLinha("HistoricoStatus")
      .filter((h) => String(h.numero_req) === String(p.numero));
    hist.reverse().forEach((h) => removerLinha("HistoricoStatus", h.__linha__));

    aba("Pedidos").deleteRow(reg.linha);
    return { ok: true, data: { numero: p.numero } };
  } finally {
    lock.releaseLock();
  }
}

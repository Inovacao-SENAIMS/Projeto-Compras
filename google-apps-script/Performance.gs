/**
 * Performance.gs — página exclusiva da Gestão/SuperUsuário.
 * Indicadores no período, tabela por membro (lead time médio) e gráficos.
 */

function apiPerformance(payload, usuario) {
  exigir(isManager(usuario), "Página exclusiva da Gestão.");

  const de = payload.de ? new Date(payload.de) : null;
  const ate = payload.ate ? new Date(payload.ate) : null;
  const membro = String(payload.usuario || "").trim().toLowerCase();

  let pedidos = lerAba("Pedidos");
  pedidos = pedidos.filter((p) => {
    const criado = new Date(p.criado_em);
    if (de && criado < de) return false;
    if (ate) { const fim = new Date(ate); fim.setHours(23, 59, 59, 999); if (criado > fim) return false; }
    if (membro) return String(p.responsavel).toLowerCase() === membro;
    return true;
  });

  /* SuperUsuário é invisível nos relatórios */
  const ehSuperEmail = (em) => {
    const u = buscarUsuario(em);
    return !!u && isSuper(u);
  };

  const cnt = { total: pedidos.length, sem_responsavel: 0, em_analise: 0, concluida: 0, cancelada: 0 };
  const porMembro = {};

  pedidos.forEach((p) => {
    const st = String(p.status);
    if (!p.responsavel) cnt.sem_responsavel++;
    if (st === STATUS.EM_ANALISE) cnt.em_analise++;
    if (st === STATUS.CONCLUIDA) cnt.concluida++;
    if (st === STATUS.CANCELADA) cnt.cancelada++;

    const em = String(p.responsavel || "").toLowerCase();
    if (ehSuperEmail(em)) return;   /* SuperUsuário invisível no relatório */
    if (!porMembro[em]) {
      porMembro[em] = { email: em, nome: nomeExibicao(em), atribuidas: 0, em_analise: 0, concluida: 0, cancelada: 0, lead_soma: 0, lead_n: 0 };
    }
    const m = porMembro[em];
    m.atribuidas++;
    if (st === STATUS.EM_ANALISE) m.em_analise++;
    if (st === STATUS.CONCLUIDA) m.concluida++;
    if (st === STATUS.CANCELADA) m.cancelada++;
    const lead = leadTimeDias(p);
    if (lead != null && st === STATUS.CONCLUIDA) { m.lead_soma += lead; m.lead_n++; }
  });

  const tabela = Object.keys(porMembro).map((k) => {
    const m = porMembro[k];
    m.lead_medio = m.lead_n ? Math.round((m.lead_soma / m.lead_n) * 10) / 10 : null;
    delete m.lead_soma;
    delete m.lead_n;
    return m;
  }).sort((a, b) => b.atribuidas - a.atribuidas);

  const membros = lerAba("Usuarios")
    .filter((u) => isValido(u) && isEquipe(u) && !isSuper(u))
    .map((u) => ({ email: String(u.email).toLowerCase(), nome: u.nome_completo }));

  return { ok: true, data: { indicadores: cnt, membros: tabela, opcoes_membros: membros } };
}

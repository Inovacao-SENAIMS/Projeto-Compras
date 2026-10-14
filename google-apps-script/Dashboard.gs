/**
 * Dashboard.gs — agregações para a Home (`/`):
 * cards de números, requisições por mês, por status, por instituto.
 * Dados seguem o perfil: solicitante vê o próprio; equipe vê todas.
 */

function apiDashboard(payload, usuario) {
  let pedidos = lerAba("Pedidos");
  if (!isEquipe(usuario)) {
    const em = String(usuario.email).toLowerCase();
    pedidos = pedidos.filter((p) => String(p.criado_por).toLowerCase() === em);
  }

  const contPorStatus = {
    aberta: 0, enviada: 0, em_analise: 0, concluida: 0, cancelada: 0,
  };
  const porMes_ = {};   // "YYYY-MM" -> total aberto no mês
  const porInstituto = {};
  CONFIG_INSTITUTOS.forEach((inst) => { porInstituto[inst] = 0; });

  pedidos.forEach((p) => {
    const st = String(p.status);
    if (contPorStatus[st] != null) contPorStatus[st]++;
    if (st !== STATUS.ABERTA || true) {
      const d = new Date(p.criado_em);
      const chave = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
      porMes_[chave] = (porMes_[chave] || 0) + 1;
    }

    const u = buscarUsuario(p.criado_por);
    const inst = u ? String(u.instituto || "—") : "—";
    porInstituto[inst] = (porInstituto[inst] || 0) + 1;
  });

  /* últimos 12 meses (de mês corrente para trás) */
  const meses = [];
  const hoje = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
    meses.push({
      chave,
      rotulo: ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear(),
      total: porMes_[chave] || 0,
    });
  }

  const size = Object.keys(porMes_).length; // (para debug futuro, se necessário)

  return {
    ok: true,
    data: {
      total: pedidos.length,
      pendentes: contPorStatus.aberta + contPorStatus.enviada + contPorStatus.em_analise,
      concluidas: contPorStatus.concluida,
      canceladas: contPorStatus.cancelada,
      por_status: contPorStatus,
      por_mes: meses,
      por_instituto: Object.keys(porInstituto).map((k) => ({ instituto: k, total: porInstituto[k] })),
    },
  };
}

/* Lista de institutos (mantida aqui para a API/Dashboard sem depender do client) */
const CONFIG_INSTITUTOS = [
  "IST Alimentos e Bebidas - Dourados",
  "ISI Biomassa - Três Lagoas",
  "IST Eficiência Operacional - Campo Grande",
];

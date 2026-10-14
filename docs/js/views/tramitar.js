/* views/tramitar.js — Tramitar (#/tramitar/<numero>) — equipe.
 * Clone do equipe/tramitar.html: um único container com todas as informações
 * (detalhes, anexos, histórico) + botão Editar (Status, Observação, anexo,
 * Retorno final quando Concluída) e Voltar (lista).
 */

ROTAS["#/tramitar/<numero>"] = async function (numero) {
  atualizarNav("#/requisicoes");

  qs("#conteudo").innerHTML = `<div class="carregando"><i class="bi bi-arrow-repeat"></i> Carregando…</div>`;

  const r = await API.chamar("detalharPedido", { numero });
  if (!r.ok) {
    qs("#conteudo").innerHTML = `<ul class="mensagens"><li class="msg msg-error">
      <i class="bi bi-x-circle-fill"></i><span>${esc(r.erro)}</span></li></ul>
      <a class="link-secundario" href="#/requisicoes"><i class="bi bi-arrow-left"></i> Voltar</a>`;
    return;
  }
  const d = r.data;
  const p = d.pedido;

  function anexosHTML() {
    return d.anexos.map((a) => `
      <li>
        <span class="tag">${a.tipo === "cotacao" ? "Cotação" : "Documentação"}</span>
        ${esc(a.nome_original)} <span class="meta">${esc(a.enviado_por)} · ${fmtDataHora(a.enviado_em)}</span>
        <button type="button" class="btn-icone" title="Baixar" data-baixar="${esc(a.id)}"><i class="bi bi-download"></i></button>
      </li>`).join("") || '<li class="meta">Nenhum anexo.</li>';
  }
  function historicoHTML() {
    return d.historicos.map((h) => `
      <li>
        <span class="tag status-${h.para}">${CONFIG.STATUS[h.para] || h.para}</span>
        <span>${esc(h.usuario)} · ${fmtDataHora(h.criado_em)}</span>
        ${h.observacao ? `<div class="meta">${esc(h.observacao)}</div>` : ""}
      </li>`).join("") || '<li class="meta">Sem histórico.</li>';
  }

  function modoLeitura() {
    qs("#conteudo").innerHTML = `
      <div id="mensagens-flutuantes" hidden></div>
      <div class="cabecalho-pagina">
        <h2><i class="bi bi-arrow-repeat"></i> Tramitar — ${esc(p.numero)}</h2>
        <a class="botao" href="#/requisicoes"><i class="bi bi-arrow-left"></i> Voltar</a>
      </div>

      <div class="pagina-central">
        <section class="cartao-pedido">
          <h3><i class="bi bi-box"></i> Requisição <span class="tag status-${p.status}">${CONFIG.STATUS[p.status]}</span></h3>
          <dl class="dados">
            <dt>Item</dt><dd>${esc(p.produto)}</dd>
            <dt>Descrição do Objeto</dt><dd>${esc(p.descricao_objeto || "—")}</dd>
            <dt>Quantidade</dt><dd>${esc(p.quantidade)}</dd>
            <dt>Modalidade (RCA)</dt><dd>${esc(CONFIG.MODALIDADES[p.modalidade] || "—")}</dd>
            <dt>Urgência</dt><dd><span class="tag urgencia-${p.urgencia}">${esc(CONFIG.URGENCIAS[p.urgencia] || p.urgencia)}</span></dd>
            <dt>Possui cotação?</dt><dd>${p.possui_cotacao ? "Sim" : "Não"}</dd>
            <dt>Solicitante</dt><dd>${esc(p.solicitante_nome)}</dd>
            <dt>Responsável</dt><dd>${esc(p.responsavel_nome || "—")}</dd>
            <dt>Abertura</dt><dd>${fmtDataHora(p.criado_em)}</dd>
            <dt>Envio</dt><dd>${fmtDataHora(p.data_envio)}</dd>
            <dt>Encerramento</dt><dd>${fmtDataHora(p.concluido_em)}</dd>
            <dt>Lead Time</dt><dd>${fmtLead(p.lead_time_dias)}</dd>
            <dt>Retorno final</dt><dd>${esc(p.retorno_final || "—")}</dd>
          </dl>

          <h3><i class="bi bi-paperclip"></i> Anexos</h3>
          <ul class="anexos">${anexosHTML()}</ul>

          <h3><i class="bi bi-clock-history"></i> Histórico</h3>
          <ul class="historico">${historicoHTML()}</ul>

          ${d.transicoes.length ? `
            <div class="modal-acoes">
              <button type="button" class="botao" id="btn-editar"><i class="bi bi-pencil"></i> Editar</button>
              <a class="link-secundario" href="#/requisicoes"><i class="bi bi-arrow-left"></i> Voltar</a>
            </div>` : `
            <p class="meta">Requisição em status ${CONFIG.STATUS[p.status]} — sem tramitação disponível.</p>
            <div class="modal-acoes">
              <a class="link-secundario" href="#/requisicoes"><i class="bi bi-arrow-left"></i> Voltar</a>
            </div>`}
        </section>
      </div>`;

    qs("#btn-editar").addEventListener("click", modoEdicao);
    ligarDownloads();
  }

  function modoEdicao() {
    const transicoes = d.transicoes.map((t) =>
      `<option value="${t}">${CONFIG.STATUS[t]}</option>`).join("");

    qs("#conteudo").innerHTML = `
      <div id="mensagens-flutuantes" hidden></div>
      <div class="cabecalho-pagina">
        <h2><i class="bi bi-pencil"></i> Editar tramitação — ${esc(p.numero)}</h2>
        <button type="button" class="botao" id="btn-voltar"><i class="bi bi-arrow-left"></i> Voltar</button>
      </div>

      <div class="pagina-central">
        <section class="cartao-pedido">
          <form id="form-tramitar" class="formulario formulario-modal">
            <p>
              <label for="t-status">Status</label>
              <select id="t-status" class="campo" required>${transicoes}</select>
            </p>
            <p>
              <label for="t-observacao">Observação</label>
              <textarea id="t-observacao" class="campo" rows="3"></textarea>
            </p>
            <p id="wrap-retorno-final" hidden>
              <label for="t-retorno">Retorno final</label>
              <textarea id="t-retorno" class="campo" rows="3"></textarea>
            </p>
            <p>
              <label for="t-arquivo">Anexo (opcional)</label>
              <input id="t-arquivo" type="file" class="campo">
            </p>
            <div class="modal-acoes">
              <button type="submit" class="botao"><i class="bi bi-check-lg"></i> Salvar tramitação</button>
              <button type="button" class="link-secundario" id="btn-cancelar">Cancelar</button>
            </div>
          </form>
        </section>
      </div>`;

    qs("#btn-voltar").addEventListener("click", modoLeitura);
    qs("#btn-cancelar").addEventListener("click", modoLeitura);

    const selStatus = qs("#t-status");
    const wrapRetorno = qs("#wrap-retorno-final");
    selStatus.addEventListener("change", () => {
      wrapRetorno.hidden = selStatus.value !== "concluida";
    });

    qs("#form-tramitar").addEventListener("submit", async (e) => {
      e.preventDefault();
      const novoStatus = val("t-status");
      if (!novoStatus) { mostrarMensagem("error", "Escolha o status."); return; }
      if (novoStatus === "concluida" && !val("t-retorno")) {
        mostrarMensagem("error", "Informe o retorno final ao concluir.");
        return;
      }

      const r2 = await API.chamar("tramitarPedido", {
        numero, status: novoStatus,
        observacao: val("t-observacao"),
        retorno_final: novoStatus === "concluida" || val("t-retorno") ? val("t-retorno") : undefined,
      });
      if (mostrarSucessoOuErro(r2)) {
        /* anexo opcional */
        const file = qs("#t-arquivo").files[0];
        if (file) {
          const erro = API.validarArquivo(file);
          if (!erro) {
            await API.chamar("anexarArquivo", {
              numero, tipo: "documentacao",
              nome_original: file.name, base64: await API.lerArquivoBase64(file),
            });
          } else mostrarMensagem("error", erro);
        }
        mostrarMensagem("success", "Tramitação registrada com sucesso.");
        /* re-renderiza a página com os dados atualizados */
        ROTAS["#/tramitar/<numero>"](numero);
      }
    });
  }

  function ligarDownloads() {
    qsa('[data-baixar]').forEach((b) => b.addEventListener("click", async () => {
      const r2 = await API.chamar("baixarArquivo", { id: b.dataset.baixar });
      if (r2.ok) {
        const bytes = Uint8Array.from(atob(r2.data.base64), (c) => c.charCodeAt(0));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([bytes], { type: r2.data.mime }));
        a.download = r2.data.nome;
        a.click();
      } else mostrarMensagem("error", r2.erro);
    }));
  }

  modoLeitura();
};

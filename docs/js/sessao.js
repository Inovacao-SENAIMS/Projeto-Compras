/* Sessão do usuário no client (token + perfil + nome).
 * Guarda em localStorage para sobreviver a recarregamentos da página.
 */
const Sessao = (() => {
  const CHAVE = "projeto_compras.sessao";

  function ler() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return null;
      const s = JSON.parse(bruto);
      if (!s || !s.token || !s.email) return null;
      if (s.expira_em && Date.now() > s.expira_em) {
        limpar();
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function gravar({ token, email, nome, grupo }) {
    localStorage.setItem(
      CHAVE,
      JSON.stringify({
        token,
        email,
        nome,
        grupo,
        expira_em: Date.now() + CONFIG.SESSAO_MS,
      })
    );
  }

  function limpar() {
    localStorage.removeItem(CHAVE);
  }

  /** Flags de perfil (iguais às do Django: accounts/perfis.py). */
  function isSolicitante(s) { s = s || ler(); return !!s && s.grupo === "UserISI_IST"; }
  function isTime(s)        { s = s || ler(); return !!s && s.grupo === "Time_Compras"; }
  function isGestor(s)      { s = s || ler(); return !!s && s.grupo === "Manager_Compras"; }
  function isEquipe(s)      { return isTime(s) || isGestor(s); }

  return { ler, gravar, limpar, isSolicitante, isTime, isGestor, isEquipe };
})();

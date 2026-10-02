// Regras de cálculo (sem nada de tela, para ser fácil de testar).
//
// Cada registro = { pid, data:'AAAA-MM-DD', estoque, repo, desp }
//   estoque = contagem na prateleira ao chegar
//   repo    = quantidade reposta
//   desp    = quantidade retirada por vencimento/estrago
//
// modo 'depois': o estoque informado já está SEM os vencidos/estragados
//    prateleira após a visita = estoque + repo
//    vendido = (prateleira após a visita anterior) - estoque - desperdício
// modo 'antes': o estoque informado ainda INCLUI os vencidos/estragados
//    prateleira após a visita = estoque - desperdício + repo
//    vendido = (prateleira após a visita anterior) - estoque
(function (root) {
  const Calc = {};

  Calc.apos = (r, modo) => modo === 'antes' ? r.estoque - r.desp + r.repo : r.estoque + r.repo;

  Calc.vendido = (prev, r, modo) => {
    if (!prev) return null; // primeiro registro: não há base de comparação
    const P = Calc.apos(prev, modo);
    return modo === 'antes' ? P - r.estoque : P - r.estoque - r.desp;
  };

  Calc.historico = (registros, pid) =>
    Object.values(registros).filter(r => r.pid === pid)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

  Calc.anterior = (registros, pid, data) => {
    let p = null;
    for (const r of Calc.historico(registros, pid)) { if (r.data < data) p = r; else break; }
    return p;
  };

  Calc.produzir = (min, apos) => Math.max(0, (min || 0) - apos);

  // Totais por produto no período [de, ate]
  Calc.resumo = (st, de, ate) => st.produtos.map(p => {
    const hist = Calc.historico(st.registros, p.id);
    let visitas = 0, repo = 0, desp = 0, vend = 0, temVend = false, neg = false;
    hist.forEach((r, i) => {
      if (r.data < de || r.data > ate) return;
      visitas++; repo += r.repo; desp += r.desp;
      const v = Calc.vendido(i > 0 ? hist[i - 1] : null, r, st.modo);
      if (v !== null) { vend += v; temVend = true; if (v < 0) neg = true; }
    });
    return { produto: p, visitas, repo, desp, vendido: temVend ? vend : null, neg };
  });

  // Linha a linha de cada registro no período
  Calc.detalhe = (st, de, ate) => {
    const ordem = {}; st.produtos.forEach((p, i) => ordem[p.id] = i);
    const out = [];
    st.produtos.forEach(p => {
      const hist = Calc.historico(st.registros, p.id);
      hist.forEach((r, i) => {
        if (r.data < de || r.data > ate) return;
        const prev = i > 0 ? hist[i - 1] : null;
        out.push({
          data: r.data, produto: p, estoque: r.estoque, repo: r.repo, desp: r.desp,
          prevApos: prev ? Calc.apos(prev, st.modo) : null,
          vendido: Calc.vendido(prev, r, st.modo),
          apos: Calc.apos(r, st.modo)
        });
      });
    });
    out.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : ordem[a.produto.id] - ordem[b.produto.id]);
    return out;
  };

  // O que produzir, com base no último registro de cada produto até a data escolhida
  Calc.plano = (st, data) => st.produtos.map(p => {
    const hist = Calc.historico(st.registros, p.id).filter(r => r.data <= data);
    const rec = hist.length ? hist[hist.length - 1] : null;
    const apos = rec ? Calc.apos(rec, st.modo) : null;
    return { produto: p, rec, apos, min: p.min || 0, produzir: rec ? Calc.produzir(p.min, apos) : null };
  });

  root.Calc = Calc;
  if (typeof module !== 'undefined') module.exports = Calc;
})(typeof window !== 'undefined' ? window : globalThis);

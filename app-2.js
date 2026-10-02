// ---------- utilidades ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => isoDe(new Date());
const br = iso => iso ? iso.split('-').reverse().join('/') : '';
const nf = v => (v === null || v === undefined) ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const lerNum = id => { const v = $(id).value.trim(); if (v === '') return null; const n = Number(v.replace(',', '.')); return isFinite(n) ? n : NaN; };

let toastT;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------- armazenamento (neste navegador) ----------
const KEY = 'tats_reposicao_v1';
function padrao() {
  return {
    produtos: PRODUTOS_INICIAIS.map((p, i) => ({ id: 'p' + (i + 1), nome: p.nome, codigo: p.codigo || '', min: 0 })),
    registros: {}, modo: 'depois'
  };
}
function carregar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.produtos) && s.registros) { s.modo = s.modo || 'depois'; return s; } }
  } catch (e) { }
  return padrao();
}
let state = carregar();
function salvar() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Atenção: não foi possível salvar neste navegador.'); }
}
const prod = pid => state.produtos.find(p => p.id === pid);
const chave = (data, pid) => `${data}|${pid}`;

// ---------- abas ----------
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  ['repor', 'rel', 'cfg'].forEach(t => $('tab-' + t).hidden = (t !== b.dataset.tab));
  if (b.dataset.tab === 'rel') renderRelatorio();
  if (b.dataset.tab === 'cfg') renderConfig();
  window.scrollTo(0, 0);
});

// ---------- REPOSIÇÃO ----------
function renderSelect() {
  const atual = $('produto').value;
  $('produto').innerHTML = state.produtos.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  if (atual && prod(atual)) $('produto').value = atual;
}

function carregarForm() {
  const pid = $('produto').value, data = $('data').value, p = prod(pid);
  if (!p) return;
  const b = $('codigo');
  b.textContent = p.codigo || 'sem código'; b.classList.toggle('vazio', !p.codigo);
  const r = state.registros[chave(data, pid)];
  $('estoque').value = r ? r.estoque : '';
  $('repo').value = r ? r.repo : '';
  $('desp').value = r ? (r.desp || '') : '';
  $('btnAdd').textContent = r ? 'Atualizar reposição' : 'Adicionar reposição';
  $('hintEstoque').textContent = state.modo === 'antes'
    ? 'Conte tudo o que está na prateleira, inclusive vencidos/estragados.'
    : 'Conte o que está na prateleira já sem os vencidos/estragados.';
  const prev = Calc.anterior(state.registros, pid, data);
  let h = prev ? `Última reposição: ${br(prev.data)} — ficou com ${nf(Calc.apos(prev, state.modo))} na prateleira.`
               : 'Primeiro registro deste produto (ainda não dá para calcular vendas).';
  if (r) h = 'Já existe registro deste produto nesta data; salvar vai atualizar. ' + h;
  $('hint').textContent = h;
  atualizarPreview();
}

function atualizarPreview() {
  const pid = $('produto').value, data = $('data').value, p = prod(pid), pv = $('preview');
  const e = lerNum('estoque'), rp = lerNum('repo'), d = lerNum('desp') || 0;
  if (e === null || isNaN(e)) { pv.classList.remove('on'); return; }
  const draft = { estoque: e, repo: rp || 0, desp: d };
  const prev = Calc.anterior(state.registros, pid, data);
  const v = Calc.vendido(prev, draft, state.modo), apos = Calc.apos(draft, state.modo);
  let h = '';
  if (v !== null) h += `Vendido desde a última visita: <b class="${v < 0 ? 'neg' : ''}">${nf(v)}</b>${v < 0 ? ' (conferir contagem)' : ''}<br>`;
  h += `Ficará na prateleira: <b>${nf(apos)}</b>`;
  if (p.min > 0) { const z = Calc.produzir(p.min, apos); h += `<br>Mínimo ${nf(p.min)} → produzir: <b>${nf(z)}</b>`; }
  pv.innerHTML = h; pv.classList.add('on');
}

function adicionar() {
  const data = $('data').value, pid = $('produto').value;
  const e = lerNum('estoque'), rp = lerNum('repo'), d = lerNum('desp');
  if (!data) return toast('Escolha a data.');
  if (e === null || rp === null) return toast('Preencha o estoque atual e a reposição (pode ser 0).');
  if ([e, rp, d].some(x => x !== null && (isNaN(x) || x < 0))) return toast('Use apenas números iguais ou maiores que 0.');
  const existia = !!state.registros[chave(data, pid)];
  state.registros[chave(data, pid)] = { pid, data, estoque: e, repo: rp, desp: d || 0 };
  salvar();
  toast(existia ? 'Reposição atualizada.' : 'Reposição adicionada.');
  // avança para o próximo produto ainda sem registro nesta data
  const ids = state.produtos.map(p => p.id), i0 = ids.indexOf(pid);
  for (let k = 1; k <= ids.length; k++) {
    const nx = ids[(i0 + k) % ids.length];
    if (!state.registros[chave(data, nx)]) { $('produto').value = nx; break; }
  }
  carregarForm(); renderHoje(); renderProducao();
}

function renderHoje() {
  const data = $('data').value; $('lblData').textContent = br(data);
  const rows = [];
  state.produtos.forEach(p => {
    const r = state.registros[chave(data, p.id)]; if (!r) return;
    const v = Calc.vendido(Calc.anterior(state.registros, p.id, data), r, state.modo);
    rows.push(`<tr><td>${esc(p.nome)}<small>${esc(p.codigo)}</small></td><td>${nf(r.estoque)}</td><td>${nf(r.repo)}</td><td>${nf(r.desp)}</td>
      <td class="${v !== null && v < 0 ? 'neg' : ''}">${v === null ? '–' : nf(v)}</td><td>${nf(Calc.apos(r, state.modo))}</td>
      <td><button class="mini" data-ed="${p.id}">Editar</button><button class="mini del" data-rm="${p.id}">Excluir</button></td></tr>`);
  });
  $('listaHoje').innerHTML = rows.length
    ? `<table><tr><th>Produto</th><th>Estoque</th><th>Repos.</th><th>Desperd.</th><th>Vendido</th><th>Prateleira</th><th></th></tr>${rows.join('')}</table>`
    : '<div class="vazio-msg">Nenhuma reposição registrada nesta data.</div>';
}
$('listaHoje').onclick = e => {
  const ed = e.target.dataset.ed, rm = e.target.dataset.rm;
  if (ed) { $('produto').value = ed; carregarForm(); $('estoque').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (rm && confirm('Excluir este registro?')) { delete state.registros[chave($('data').value, rm)]; salvar(); carregarForm(); renderHoje(); renderProducao(); }
};

function renderProducao() {
  const data = $('data').value;
  $('lblProd').textContent = `(com base nas reposições até ${br(data)})`;
  const plano = Calc.plano(state, data).filter(x => x.min > 0);
  if (!plano.length) { $('producao').innerHTML = '<div class="vazio-msg">Defina o mínimo de cada produto na aba "Produtos e mínimos" para ver o que produzir.</div>'; return; }
  const linhas = plano.map(x => {
    if (!x.rec) return `<tr><td>${esc(x.produto.nome)}<small>${esc(x.produto.codigo)}</small></td><td>${nf(x.min)}</td><td colspan="2">sem registro</td></tr>`;
    const antigo = x.rec.data !== data ? `<small>registro de ${br(x.rec.data)}</small>` : '';
    return `<tr class="${x.produzir > 0 ? 'prod-sim' : ''}"><td>${esc(x.produto.nome)}<small>${esc(x.produto.codigo)}</small></td><td>${nf(x.min)}</td>
      <td>${nf(x.apos)}${antigo}</td><td class="${x.produzir > 0 ? 'pr' : 'ok'}">${x.produzir > 0 ? nf(x.produzir) : 'OK'}</td></tr>`;
  }).join('');
  const total = plano.reduce((s, x) => s + (x.produzir || 0), 0);
  $('producao').innerHTML = `<div class="scroll"><table><tr><th>Produto</th><th>Mínimo</th><th>Na prateleira</th><th>Produzir</th></tr>${linhas}
    <tr class="tot"><td colspan="3">Total a produzir</td><td>${nf(total)}</td></tr></table></div>`;
}

function gerarPdf() {
  if (!window.jspdf) return alert('A biblioteca de PDF não carregou. Verifique a internet e recarregue a página.');
  const data = $('data').value;
  const plano = Calc.plano(state, data).filter(x => x.min > 0);
  const precisa = plano.filter(x => x.rec && x.produzir > 0);
  const ok = plano.filter(x => x.rec && x.produzir === 0).map(x => x.produto.nome);
  const sem = plano.filter(x => !x.rec).map(x => x.produto.nome);
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(17); doc.text('TATS Confeitaria - Lista de produ\u00e7\u00e3o', 14, 18);
  doc.setFontSize(10); doc.text(`Reposi\u00e7\u00e3o de ${br(data)}  |  gerado em ${br(hoje())}`, 14, 25);
  const total = precisa.reduce((s, x) => s + x.produzir, 0);
  doc.autoTable({
    startY: 31,
    head: [['Produto', 'C\u00f3digo', 'M\u00ednimo', 'Na prateleira', 'PRODUZIR']],
    body: precisa.map(x => [x.produto.nome, x.produto.codigo || '-', nf(x.min), nf(x.apos), nf(x.produzir)]),
    foot: [['Total a produzir', '', '', '', nf(total)]],
    styles: { fontSize: 10 }, headStyles: { fillColor: [181, 71, 107] }, footStyles: { fillColor: [240, 230, 235], textColor: 20 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } }
  });
  let y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  const par = (titulo, lista) => {
    if (!lista.length) return;
    const t = doc.splitTextToSize(`${titulo}: ${lista.join(', ')}`, 180);
    if (y + t.length * 5 > 285) { doc.addPage(); y = 20; }
    doc.text(t, 14, y); y += t.length * 5 + 3;
  };
  if (!precisa.length) { doc.setFontSize(11); doc.text('Nenhum produto precisa ser produzido.', 14, y); y += 8; doc.setFontSize(9); }
  par('M\u00ednimo atingido (nada a produzir)', ok);
  par('Sem registro de reposi\u00e7\u00e3o', sem);
  doc.save(`producao_${data}.pdf`);
}

// ---------- RELATÓRIO ----------
function periodo() { return { de: $('de').value, ate: $('ate').value }; }
function renderRelatorio() {
  const { de, ate } = periodo();
  if (!de || !ate) return;
  if (de > ate) { $('resumo').innerHTML = '<div class="vazio-msg">A data inicial é maior que a final.</div>'; $('detalhe').innerHTML = ''; return; }
  const res = Calc.resumo(state, de, ate).filter(r => r.visitas > 0);
  if (!res.length) {
    $('resumo').innerHTML = '<div class="vazio-msg">Sem reposições neste período.</div>'; $('detalhe').innerHTML = ''; return;
  }
  let tr = 0, td = 0, tv = 0;
  const linhas = res.map(r => {
    tr += r.repo; td += r.desp; if (r.vendido !== null) tv += r.vendido;
    return `<tr><td>${esc(r.produto.nome)}<small>${esc(r.produto.codigo)}</small></td><td>${r.visitas}</td><td>${nf(r.repo)}</td><td>${nf(r.desp)}</td>
      <td class="${r.neg ? 'neg' : ''}">${r.vendido === null ? '–' : nf(r.vendido)}</td></tr>`;
  }).join('');
  $('resumo').innerHTML = `<table><tr><th>Produto</th><th>Visitas</th><th>Reposto</th><th>Desperd.</th><th>Vendido</th></tr>${linhas}
    <tr class="tot"><td>Total</td><td></td><td>${nf(tr)}</td><td>${nf(td)}</td><td>${nf(tv)}</td></tr></table>`;
  const det = Calc.detalhe(state, de, ate);
  $('detalhe').innerHTML = `<table><tr><th>Data / Produto</th><th>Antes</th><th>Estoque</th><th>Desperd.</th><th>Repos.</th><th>Vendido</th><th>Depois</th></tr>` +
    det.map(d => `<tr><td>${br(d.data)} · ${esc(d.produto.nome)}</td><td>${d.prevApos === null ? '–' : nf(d.prevApos)}</td><td>${nf(d.estoque)}</td><td>${nf(d.desp)}</td>
      <td>${nf(d.repo)}</td><td class="${d.vendido !== null && d.vendido < 0 ? 'neg' : ''}">${d.vendido === null ? '–' : nf(d.vendido)}</td><td>${nf(d.apos)}</td></tr>`).join('') + '</table>';
}

function definirPeriodo(tipo) {
  const h = new Date(); let de = new Date(h);
  if (tipo === '7') de.setDate(h.getDate() - 6);
  if (tipo === 'mes') de = new Date(h.getFullYear(), h.getMonth(), 1);
  $('de').value = isoDe(de); $('ate').value = hoje(); renderRelatorio();
}
document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => definirPeriodo(b.dataset.p));
['de', 'ate'].forEach(id => $(id).addEventListener('change', renderRelatorio));

const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };

function exportarExcel() {
  if (!window.XLSX) return alert('A biblioteca do Excel não carregou. Verifique a internet e recarregue a página.');
  const { de, ate } = periodo();
  if (!de || !ate || de > ate) return toast('Escolha um período válido.');
  const res = Calc.resumo(state, de, ate).filter(r => r.visitas > 0);
  const det = Calc.detalhe(state, de, ate);
  if (!det.length) return toast('Não há reposições neste período.');

  const a1 = [['TATS Confeitaria - Relatório de reposição'], [`Período: ${br(de)} a ${br(ate)}`], [],
    ['Código', 'Produto', 'Nº de reposições', 'Total reposto', 'Total de desperdício', 'Total vendido']];
  let tr = 0, td = 0, tv = 0;
  res.forEach(r => {
    tr += r.repo; td += r.desp; if (r.vendido !== null) tv += r.vendido;
    a1.push([r.produto.codigo, r.produto.nome, r.visitas, r.repo, r.desp, r.vendido === null ? '' : r.vendido]);
  });
  a1.push(['', 'TOTAL', '', tr, td, tv]);
  const s1 = XLSX.utils.aoa_to_sheet(a1);
  s1['!cols'] = [{ wch: 10 }, { wch: 36 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 15 }];

  const a2 = [['Data', 'Código', 'Produto', 'Na prateleira após reposição anterior', 'Estoque atual', 'Desperdício', 'Reposição', 'Vendido', 'Na prateleira após esta reposição', 'Obs.']];
  det.forEach(d => a2.push([serial(d.data), d.produto.codigo, d.produto.nome, d.prevApos === null ? '' : d.prevApos, d.estoque, d.desp, d.repo,
    d.vendido === null ? '' : d.vendido, d.apos, d.vendido !== null && d.vendido < 0 ? 'Conferir contagem (vendido negativo)' : (d.vendido === null ? 'Primeiro registro' : '')]));
  const s2 = XLSX.utils.aoa_to_sheet(a2);
  for (let r = 1; r < a2.length; r++) { const c = s2[XLSX.utils.encode_cell({ r, c: 0 })]; if (c) { c.t = 'n'; c.z = 'dd/mm/yyyy'; } }
  s2['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 36 }, { wch: 22 }, { wch: 14 }, { wch: 13 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 34 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, s1, 'Resumo');
  XLSX.utils.book_append_sheet(wb, s2, 'Detalhe por dia');
  XLSX.writeFile(wb, `reposicao_${de}_a_${ate}.xlsx`);
}

// ---------- PRODUTOS E MÍNIMOS ----------
function renderConfig() {
  document.querySelectorAll('input[name=modo]').forEach(r => r.checked = (r.value === state.modo));
  $('cfgLista').innerHTML = `<table><tr><th>Produto</th><th>Código</th><th>Mínimo</th><th></th></tr>` +
    state.produtos.map(p => `<tr><td><input class="txt" data-f="nome" data-id="${p.id}" value="${esc(p.nome)}"></td>
      <td><input data-f="codigo" data-id="${p.id}" value="${esc(p.codigo)}"></td>
      <td><input type="number" min="0" step="any" inputmode="numeric" data-f="min" data-id="${p.id}" value="${p.min || ''}"></td>
      <td><button class="mini del" data-del="${p.id}">Excluir</button></td></tr>`).join('') + '</table>';
}
$('cfgLista').addEventListener('change', e => {
  const t = e.target, p = prod(t.dataset.id); if (!p) return;
  if (t.dataset.f === 'min') { const n = Number(t.value.replace(',', '.')); p.min = isFinite(n) && n > 0 ? n : 0; }
  else if (t.dataset.f === 'nome') { if (!t.value.trim()) { t.value = p.nome; return; } p.nome = t.value.trim(); }
  else p.codigo = t.value.trim();
  salvar(); renderSelect(); carregarForm(); renderHoje(); renderProducao(); toast('Salvo.');
});
$('cfgLista').addEventListener('click', e => {
  const id = e.target.dataset.del; if (!id) return;
  const p = prod(id), n = Object.values(state.registros).filter(r => r.pid === id).length;
  if (!confirm(`Excluir "${p.nome}"${n ? ` e seus ${n} registros de reposição` : ''}? Isso não pode ser desfeito.`)) return;
  state.produtos = state.produtos.filter(x => x.id !== id);
  Object.keys(state.registros).forEach(k => { if (state.registros[k].pid === id) delete state.registros[k]; });
  salvar(); renderSelect(); renderConfig(); carregarForm(); renderHoje(); renderProducao();
});
document.querySelectorAll('input[name=modo]').forEach(r => r.onchange = () => {
  state.modo = r.value; salvar(); carregarForm(); renderHoje(); renderProducao(); toast('Forma de contagem salva.');
});
$('btnNovo').onclick = () => {
  const nome = $('novoNome').value.trim(); if (!nome) return toast('Informe o nome do produto.');
  const m = Number($('novoMin').value.replace(',', '.'));
  state.produtos.push({ id: 'p' + Date.now(), nome, codigo: $('novoCod').value.trim(), min: isFinite(m) && m > 0 ? m : 0 });
  ['novoNome', 'novoCod', 'novoMin'].forEach(i => $(i).value = '');
  salvar(); renderSelect(); renderConfig(); carregarForm(); renderProducao(); toast('Produto adicionado.');
};

// ---------- cópia de segurança ----------
$('btnBackup').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `backup_reposicao_tats_${hoje()}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('btnRestore').onclick = () => $('fileRestore').click();
$('fileRestore').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const s = JSON.parse(rd.result);
      if (!s || !Array.isArray(s.produtos) || typeof s.registros !== 'object') throw 0;
      if (!confirm('Substituir todos os dados atuais pelos dados desta cópia?')) return;
      s.modo = s.modo || 'depois'; state = s; salvar();
      renderSelect(); renderConfig(); carregarForm(); renderHoje(); renderProducao(); toast('Cópia restaurada.');
    } catch (err) { alert('Arquivo inválido.'); }
  };
  rd.readAsText(f); e.target.value = '';
};

// ---------- eventos e início ----------
$('data').onchange = () => { if (!$('data').value) $('data').value = hoje(); carregarForm(); renderHoje(); renderProducao(); };
$('btnHoje').onclick = () => { $('data').value = hoje(); $('data').onchange(); };
$('produto').onchange = carregarForm;
['estoque', 'repo', 'desp'].forEach(id => $(id).addEventListener('input', atualizarPreview));
$('btnAdd').onclick = adicionar;
$('btnPdf').onclick = gerarPdf;
$('btnXlsx').onclick = exportarExcel;

$('data').value = hoje();
renderSelect(); carregarForm(); renderHoje(); renderProducao();
definirPeriodo('mes');

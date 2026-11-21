// RADAR SINDICAL PRO — app do site v4.4 (Claude, 08/11/2026)
// Busca por CNPJ da empresa (enquadramento), por sindicato (nome/CNPJ) ou por cidade/UF; histórico e salvos;
// Grátis = básico da convenção mais recente; Pro = 5 anos + gráfico + documentos + ACT; Plus = + Telegram.
const C = window.RADAR || {};
const sb = C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase
  ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
const $ = (id) => document.getElementById(id);
const POR_PAGINA = 50;
const MEDIADOR = "https://mediador.trabalho.gov.br/sistemas/mediador/Resumo/ResumoVisualizar?NrSolicitacao=";
const cacheUF = {};
let indice = null, mapaCNPJ = null, resultados = [], pagina = 0, usuario = { id: "visitante-demo", email: "visitante@radarsindical.com.br" }, perfil = { plano: "pro", aceite_termos_em: "2026-11-21", email: "visitante@radarsindical.com.br" }, plano = "pro", modo = "sindicato";

const moeda = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => String(Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })) + "%";
const data = (d) => (d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "-");
const soNum = (s) => (s || "").replace(/\D/g, "");
const fmtCNPJ = (n) => `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
const semAcento = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ehPro = () => plano === "pro" || plano === "pro_completo";
const NOME_TIPO = { CCT: "Convenção coletiva", ACT: "Acordo coletivo", ADITIVO_CCT: "Termo aditivo à convenção", ADITIVO_ACT: "Termo aditivo ao acordo" };
const AVISO_LEGAL = "Informação de apoio. Confira sempre no documento registrado; não substitui parecer jurídico.";

// ───────── dados públicos ─────────
async function carregarIndice() {
  indice = await (await fetch("dados/indice.json")).json();
  const sel = $("qUF");
  Object.keys(indice.ufs).sort().forEach((uf) => sel.insertAdjacentHTML("beforeend", `<option>${uf}</option>`));
  $("numeros").innerHTML =
    `<div><b>${indice.entidades_ativas.toLocaleString("pt-BR")}</b>entidades sindicais ativas</div>` +
    `<div><b>${indice.total.toLocaleString("pt-BR")}</b>endereços (matriz e filiais)</div>` +
    `<div><b>${Object.keys(indice.ufs).length}</b>estados</div>`;
  $("fonteBase").textContent = `Base de sindicatos: ${indice.fonte || "Receita Federal"}, gerada em ${indice.gerado_em}.`;
}
async function dadosUF(uf) {
  if (!cacheUF[uf]) cacheUF[uf] = (await (await fetch(`dados/${uf}.json`)).json()).map((r) => ({
    cnpj: r[0], nome: r[1], municipio: r[2], situacao: r[3], matriz: r[4], uf, _busca: semAcento(r[1] + " " + r[2]),
  }));
  return cacheUF[uf];
}

// ───────── modos de busca ─────────
const MODOS = {
  empresa: { ph: "CNPJ da empresa (ex.: 12.345.678/0001-99)", dica: "Mostra os sindicatos prováveis pela atividade (CNAE) e pela cidade da empresa na Receita Federal. Precisa de conta grátis." },
  sindicato: { ph: "Nome do sindicato ou CNPJ do sindicato", dica: "Ex.: “comerciários canoas”, “vigilantes porto alegre” ou o CNPJ do sindicato. Escolher o estado deixa a busca mais rápida." },
  cidade: { ph: "", dica: "Todos os sindicatos de uma cidade ou de um estado." },
};
function trocarModo(m) {
  modo = m;
  $("formBusca").dataset.modo = m;
  document.querySelectorAll("[data-modo]").forEach((b) => b.tagName === "BUTTON" && b.setAttribute("aria-selected", String(b.dataset.modo === m)));
  $("qTexto").placeholder = MODOS[m].ph;
  $("qTexto").inputMode = m === "empresa" ? "numeric" : "text";
  $("dicaModo").textContent = MODOS[m].dica;
}

async function buscar(ev) {
  ev && ev.preventDefault();
  if (modo === "empresa") return buscarEmpresa();
  $("empresa").innerHTML = "";
  const texto = modo === "sindicato" ? $("qTexto").value.trim() : "";
  const cidadeTxt = modo === "cidade" ? $("qCidade").value.trim() : "";
  const cidade = semAcento(cidadeTxt), soAtivos = $("qAtivos").checked, uf = $("qUF").value;
  const num = soNum(texto);
  let base = [];
  if (modo === "sindicato" && num.length >= 8 && num.length === texto.replace(/[\s.\/-]/g, "").length) {   // CNPJ do sindicato
    $("resultados").innerHTML = '<div class="item">Buscando…</div>';
    if (!mapaCNPJ) mapaCNPJ = await (await fetch("dados/cnpj_uf.json")).json();
    const ufs = new Set(Object.keys(mapaCNPJ).filter((k) => k.startsWith(num)).map((k) => mapaCNPJ[k]));
    for (const u of ufs) base = base.concat((await dadosUF(u)).filter((r) => soNum(r.cnpj).startsWith(num)));
  } else {
    if (modo === "sindicato" && !texto) return ($("resultados").innerHTML = '<div class="item">Digite o nome ou o CNPJ do sindicato.</div>');
    if (modo === "cidade" && !uf && !cidade) return ($("resultados").innerHTML = '<div class="item">Escolha um estado ou digite uma cidade.</div>');
    $("resultados").innerHTML = '<div class="item">Buscando…</div>';
    const ufs = uf ? [uf] : Object.keys(indice.ufs);
    const termos = semAcento(texto).split(/\s+/).filter(Boolean);
    for (const u of ufs) {
      for (const r of await dadosUF(u)) {
        if (termos.length && !termos.every((t) => r._busca.includes(t))) continue;
        if (cidade && semAcento(r.municipio) !== cidade && !semAcento(r.municipio).startsWith(cidade)) continue;
        base.push(r);
      }
    }
  }
  resultados = soAtivos ? base.filter((r) => r.situacao === "ATIVA") : base;
  resultados.sort((a, b) => b.matriz - a.matriz || a.nome.localeCompare(b.nome));
  pagina = 0;
  desenhar();
  const lugar = [cidadeTxt, uf].filter(Boolean).join("/");
  registrarBusca(modo === "cidade" ? "cidade" : num.length >= 8 ? "sindicato" : "nome",
    { m: modo, t: texto, uf, c: cidadeTxt, a: soAtivos },
    `${modo === "cidade" ? lugar || "Brasil" : texto + (uf ? " · " + uf : "")} · ${resultados.length} sindicato(s)`);
}

function desenhar() {
  const total = resultados.length;
  $("barraResultados").classList.toggle("oculto", !total);
  $("contagem").textContent = `${total.toLocaleString("pt-BR")} resultado(s)`;
  const fatia = resultados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  $("resultados").innerHTML = total ? fatia.map((r, i) => linhaSindicato(r, pagina * POR_PAGINA + i)).join("")
    : '<div class="item">Nada encontrado. Tente outro nome, tire o filtro de cidade ou desmarque "Só ativos".</div>';
  const paginas = Math.ceil(total / POR_PAGINA);
  $("paginacao").innerHTML = paginas > 1 ? Array.from({ length: Math.min(paginas, 20) }, (_, p) =>
    `<button class="${p === pagina ? "btn" : "btn-claro"}" data-p="${p}">${p + 1}</button>`).join("") +
    (paginas > 20 ? `<span class="nota">Refine a busca para ver menos resultados.</span>` : "") : "";
}
const linhaSindicato = (r, i, extra = "") => `
  <div class="item" data-i="${i}">
    <div><div class="nome">${esc(r.nome)}</div>
    <div class="info">CNPJ ${esc(r.cnpj)} · ${esc(r.municipio)}/${esc(r.uf)}${r.matriz === undefined ? "" : r.matriz ? " · Matriz" : " · Filial"}${extra}</div></div>
    <span class="sit ${r.situacao === "ATIVA" ? "ATIVA" : "outra"}">${esc(r.situacao || "—")}</span>
  </div>`;

// ───────── busca pelo CNPJ da empresa (enquadramento) ─────────
async function buscarEmpresa(cnpjPronto) {
  const num = soNum(cnpjPronto || $("qTexto").value);
  $("barraResultados").classList.add("oculto"); $("paginacao").innerHTML = ""; $("resultados").innerHTML = "";
  if (num.length !== 14) return ($("empresa").innerHTML = '<div class="aviso">O CNPJ da empresa tem 14 números.</div>');
  // Liberado direto para testes
  // if (!usuario) ...
  $("empresa").innerHTML = '<div class="aviso">Consultando a Receita Federal e cruzando com os sindicatos da região…</div>';
  const { data: d, error } = await sb.functions.invoke("enquadramento", { body: { cnpj: num } });
  if (error || d?.erro) return ($("empresa").innerHTML = `<div class="msg err">${esc(d?.erro || (await erroDaFuncao(error)))}</div>`);
  const e = d.empresa;
  const lista = [...(d.laborais || []).map((s) => ({ ...s, lado: "laboral" })), ...(d.patronais || []).map((s) => ({ ...s, lado: "patronal" }))]
    .map((s) => ({ cnpj: s.cnpj, nome: s.razao_social, municipio: s.municipio, uf: s.uf, situacao: s.situacao, lado: s.lado, motivos: s.motivos || [] }));
  resultados = lista;
  const bloco = (lado, titulo, vazio) => {
    const itens = lista.map((s, i) => [s, i]).filter(([s]) => s.lado === lado);
    return `<h3 class="sub">${titulo}</h3><div class="lista">${itens.length ? itens.map(([s, i]) =>
      linhaSindicato(s, i, s.motivos.length ? ` · ${esc(s.motivos.join(", "))}` : "")).join("") : `<div class="item">${vazio}</div>`}</div>`;
  };
  let acts = "";
  if (Array.isArray(d.acordos_da_empresa)) {
    acts = d.acordos_da_empresa.length ? `<h3 class="sub">Acordos coletivos desta empresa</h3><div class="lista">${d.acordos_da_empresa.map((a) =>
      `<div class="item item-fixo"><div><div class="nome">${esc(NOME_TIPO[a.tipo] || a.tipo)} ${esc(a.ano || "")}</div>
      <div class="info">${a.reajuste_pct != null ? "Reajuste " + pct(a.reajuste_pct) + " · " : ""}Vigência ${data(a.vigencia_inicio)} a ${data(a.vigencia_fim)}${a.registro_mte ? " · registro " + esc(a.registro_mte) : ""}</div></div>
      ${a.nr_solicitacao ? `<a class="btn-claro" target="_blank" rel="noopener" href="${MEDIADOR + encodeURIComponent(a.nr_solicitacao)}">Abrir no Mediador</a>` : ""}</div>`).join("")}</div>` : "";
  } else if (d.acordos_da_empresa?.quantidade) {
    acts = `<div class="aviso">Esta empresa tem <b>${d.acordos_da_empresa.quantidade} acordo(s) coletivo(s)</b> registrado(s). ${esc(d.acordos_da_empresa.mensagem)} <a href="#planos">Ver planos</a></div>`;
  }
  $("empresa").innerHTML = `<article class="cartao-empresa">
      <p class="info">Empresa</p><h2>${esc(e.razao_social)}</h2>
      <dl class="ficha"><dt>CNPJ</dt><dd>${esc(e.cnpj)}</dd><dt>Cidade/UF</dt><dd>${esc(e.municipio)}/${esc(e.uf)}</dd>
      <dt>Atividade principal (CNAE)</dt><dd>${esc(e.cnae)} · ${esc(e.atividade)}</dd><dt>Ramo</dt><dd>${esc(d.ramo?.nome || "não identificado")}</dd></dl>
      <div class="aviso">${esc(d.aviso)}</div>
      ${bloco("laboral", "Sindicato dos empregados (prováveis)", "Nenhum sindicato de empregados com o ramo desta atividade no estado. Tente a busca por nome.")}
      ${bloco("patronal", "Sindicato patronal (prováveis)", "Nenhum sindicato patronal com o ramo desta atividade no estado.")}
      ${acts}
      ${d.restantes != null ? `<p class="nota">Consultas de empresa restantes hoje: ${d.restantes}.</p>` : ""}
    </article>`;
  registrarBusca("empresa", { m: "empresa", t: e.cnpj }, `${e.razao_social} · ${e.municipio}/${e.uf}`);
}
async function erroDaFuncao(error) {
  try { const j = await error.context.json(); return j.erro || error.message; } catch { return error?.message || "Erro na consulta."; }
}

// ───────── histórico e salvos ─────────
async function registrarBusca(tipo, termo, rotulo) {
  if (!usuario || perfil?.guardar_historico === false) return;
  await sb.from("historico_buscas").insert({ tipo, termo: JSON.stringify(termo), rotulo });
  carregarMeus();
}
async function carregarMeus() {
  if (!usuario) return $("meus").classList.add("oculto");
  const [h, f] = await Promise.all([
    sb.from("historico_buscas").select("id, tipo, termo, rotulo, criado_em").order("criado_em", { ascending: false }).limit(8),
    sb.from("favoritos").select("cnpj, nome, cidade").order("criado_em", { ascending: false }),
  ]);
  $("meus").classList.remove("oculto");
  $("listaHistorico").innerHTML = (h.data || []).map((x) => `<button class="chip" data-hist="${esc(x.termo)}" title="Buscar de novo">${esc(x.rotulo || x.termo)}</button>`).join("")
    || `<p class="nota">${perfil?.guardar_historico === false ? "Você desligou o histórico em Minha conta." : "Suas buscas aparecem aqui. Clique para refazer."}</p>`;
  $("listaFavoritos").innerHTML = (f.data || []).map((x) => `<button class="chip chip-salvo" data-fav="${esc(x.cnpj)}" data-nome="${esc(x.nome)}" data-cidade="${esc(x.cidade)}">${esc(x.nome)}<small>${esc(x.cidade || "")}</small></button>`).join("")
    || '<p class="nota">Abra a ficha de um sindicato e clique em “Salvar sindicato”.</p>';
}
function refazerBusca(termo) {
  let t; try { t = JSON.parse(termo); } catch { return; }
  trocarModo(t.m || "sindicato");
  $("qTexto").value = t.t || ""; $("qUF").value = t.uf || ""; $("qCidade").value = t.c || ""; $("qAtivos").checked = t.a !== false;
  buscar();
}
async function abrirSalvo(cnpj, nome, cidade) {
  const [municipio, uf] = String(cidade || "").split("/");
  let r = uf ? (await dadosUF(uf)).find((x) => x.cnpj === cnpj) : null;
  abrirFicha(r || { cnpj, nome, municipio, uf, situacao: "" });
}

// ───────── conta / plano ─────────
async function atualizarSessao() {
  if (!sb) { $("btnConta").textContent = "Entrar"; return; }
  const { data: s } = await sb.auth.getSession();
  usuario = s.session?.user || null;
  perfil = null; plano = "anon";
  if (usuario) {
    perfil = (await sb.from("perfis").select("*").eq("id", usuario.id).maybeSingle()).data;
    plano = (await sb.rpc("plano_ativo")).data || "free";
  }
  const nomes = { anon: "Entrar", free: "Minha conta (Grátis)", pro: "Minha conta (Pro)", pro_completo: "Minha conta (Plus)" };
  $("btnConta").textContent = nomes[plano] || "Minha conta";
  carregarMeus();
  if (usuario && perfil && !perfil.aceite_termos_em) telaAceite();
}

function abrirModal(html) { $("conteudoModal").innerHTML = html; $("modal").classList.remove("oculto"); $("fecharModal").focus(); }
function fecharModal() { $("modal").classList.add("oculto"); }

function telaEntrar(motivo) {
  if (!sb) return abrirModal(`<h3>Login ainda não configurado</h3><p>O administrador precisa preencher <code>config.js</code> com os dados do Supabase.</p>`);
  abrirModal(`<h3>Entrar ou criar conta grátis</h3>${motivo ? `<div class="aviso">${esc(motivo)}</div>` : ""}
    <p>Digite seu e-mail: enviamos um link de acesso (sem senha).</p>
    <input id="emailLogin" type="email" placeholder="seu@email.com" aria-label="E-mail">
    <p class="nota">Ao entrar você concorda com os <a href="#" data-pagina="termos">Termos de uso</a> e a <a href="#" data-pagina="privacidade">Política de privacidade</a>.</p>
    <div class="linha"><button class="btn" id="btnEnviarLink">Enviar link de acesso</button></div><div id="msgLogin"></div>`);
  $("btnEnviarLink").onclick = async () => {
    const email = $("emailLogin").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return ($("msgLogin").innerHTML = '<div class="msg err">E-mail inválido.</div>');
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    $("msgLogin").innerHTML = error ? `<div class="msg err">${esc(error.message)}</div>`
      : '<div class="msg ok">Pronto. Abra o seu e-mail e clique no link para entrar.</div>';
  };
}

function telaAceite() {
  abrirModal(`<h3>Antes de começar</h3>
    <p>Guardamos o seu e-mail, o plano, as buscas recentes e os sindicatos salvos para o site funcionar. Não vendemos nem repassamos seus dados. Você pode desligar o histórico ou apagar tudo em <b>Minha conta</b>.</p>
    <p>${AVISO_LEGAL}</p>
    <label class="chk"><input type="checkbox" id="chkAceite"> Li e aceito os <a href="#" data-pagina="termos">Termos de uso</a> e a <a href="#" data-pagina="privacidade">Política de privacidade</a></label>
    <div class="linha"><button class="btn" id="btnAceite" disabled>Aceitar e continuar</button></div><div id="msgAceite"></div>`);
  $("chkAceite").onchange = (e) => ($("btnAceite").disabled = !e.target.checked);
  $("btnAceite").onclick = async () => {
    const agora = new Date().toISOString();
    const { error } = await sb.from("perfis").update({ aceite_termos_em: agora }).eq("id", usuario.id);
    if (error) return ($("msgAceite").innerHTML = `<div class="msg err">${esc(error.message)}</div>`);
    perfil.aceite_termos_em = agora; fecharModal();
  };
}

async function telaConta() {
  if (!usuario) return telaEntrar();
  let seg = "";
  if (plano === "pro_completo") {
    const { data: s } = await sb.from("seguindo").select("cnpj").order("criado_em");
    seg = `<h4>Avisos no Telegram (${s?.length || 0} sindicatos)</h4>${(s || []).map((x) => `<div class="info">${esc(x.cnpj)}</div>`).join("") || '<div class="info">Abra a ficha de um sindicato e clique em “Seguir no Telegram”.</div>'}
      <div class="linha">${C.BOT_TELEGRAM ? `<a class="btn" target="_blank" rel="noopener" href="https://t.me/${esc(C.BOT_TELEGRAM)}?start=${usuario.id}">${perfil?.telegram_chat_id ? "Telegram conectado (reconectar)" : "Conectar o Telegram"}</a>` : ""}</div>`;
  }
  const nomePlano = plano === "pro_completo" ? "Plus" : plano === "pro" ? "Pro" : "Grátis";
  abrirModal(`<h3>Minha conta</h3><p>${esc(usuario.email)}</p>
    <div class="aviso">Plano <b>${nomePlano}</b>${plano !== "free" && perfil?.validade ? `, válido até <b>${data(perfil.validade)}</b>` : ""}</div>
    ${plano === "free" ? '<div class="linha"><a class="btn" href="#planos" data-fechar>Ver planos</a></div>' : ""}${seg}
    <h4>Seus dados</h4>
    <label class="chk"><input type="checkbox" id="chkHistorico" ${perfil?.guardar_historico === false ? "" : "checked"}> Guardar minhas buscas recentes</label>
    <div class="linha"><button class="btn-claro" id="btnApagar">Apagar buscas, salvos e avisos</button></div><div id="msgDados"></div>
    <div class="linha"><button class="btn-claro" id="btnSair">Sair</button></div>`);
  $("btnSair").onclick = async () => { await sb.auth.signOut(); fecharModal(); atualizarSessao(); };
  $("chkHistorico").onchange = async (e) => {
    const { error } = await sb.from("perfis").update({ guardar_historico: e.target.checked }).eq("id", usuario.id);
    $("msgDados").innerHTML = error ? `<div class="msg err">${esc(error.message)}</div>` : `<div class="msg ok">${e.target.checked ? "Histórico ligado." : "Histórico desligado. Novas buscas não serão guardadas."}</div>`;
    if (!error) { perfil.guardar_historico = e.target.checked; carregarMeus(); }
  };
  const ap = $("btnApagar");
  ap.onclick = async () => {
    if (!ap.dataset.confirmar) { ap.dataset.confirmar = "1"; ap.textContent = "Clique de novo para apagar (não tem volta)"; return; }
    const { error } = await sb.rpc("apagar_meus_dados");
    $("msgDados").innerHTML = error ? `<div class="msg err">${esc(error.message)}</div>` : '<div class="msg ok">Pronto: buscas, salvos e avisos apagados. Para excluir a conta inteira, peça pelo e-mail de contato.</div>';
    ap.textContent = "Apagar buscas, salvos e avisos"; delete ap.dataset.confirmar; carregarMeus();
  };
}

// ───────── ficha do sindicato ─────────
const linkDoc = (c) => c.nr_solicitacao ? { url: MEDIADOR + encodeURIComponent(c.nr_solicitacao), rot: "Abrir no Mediador (MTE)" }
  : c.link ? { url: c.link, rot: "Abrir documento" } : null;
const seloIA = (c) => c.verificado === false ? '<span class="selo-ia" title="Lido automaticamente; ainda não conferido pela equipe">lido por IA, confira no documento</span>' : "";

function blocoBasico(c) {
  return `<div class="conv">
    <div class="conv-topo">${c.reajuste_pct != null ? `<span class="carimbo"><small>reajuste</small>${pct(c.reajuste_pct)}</span>` : ""}
      <dl class="mini"><dt>${esc(NOME_TIPO[c.tipo] || "Convenção")}</dt><dd>${c.ano ? `${c.ano}/${c.ano + 1}` : "-"}</dd>
      ${c.piso_salarial != null ? `<dt>Piso</dt><dd>${moeda(c.piso_salarial)}</dd>` : ""}
      ${c.data_base ? `<dt>Data-base</dt><dd>${esc(c.data_base)}</dd>` : ""}</dl></div>
    ${c.resumo_curto ? `<p>${esc(c.resumo_curto)}</p>` : ""}${seloIA(c)}</div>`;
}

function graficoAnos(convs) {
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - 4 + i);
  const porAno = anos.map((a) => {
    const doAno = convs.filter((c) => c.ano === a && c.reajuste_pct != null);
    const principal = doAno.find((c) => c.tipo === "CCT") || doAno[0];
    return { ano: a, v: principal ? Number(principal.reajuste_pct) : null };
  });
  const max = Math.max(1, ...porAno.map((p) => p.v || 0));
  const L = 520, A = 210, base = 170, larg = 64, passo = L / 5;
  const barras = porAno.map((p, i) => {
    const x = i * passo + (passo - larg) / 2;
    if (p.v == null) return `<rect x="${x}" y="${base - 40}" width="${larg}" height="40" class="g-vazio"/><text x="${x + larg / 2}" y="${base - 14}" class="g-sem">sem registro</text><text x="${x + larg / 2}" y="${base + 22}" class="g-ano">${p.ano}</text>`;
    const h = Math.max(4, (p.v / max) * 130);
    return `<rect x="${x}" y="${base - h}" width="${larg}" height="${h}" class="${p.ano === anoAtual ? "g-atual" : "g-barra"}"><title>${p.ano}: ${pct(p.v)}</title></rect>
      <text x="${x + larg / 2}" y="${base - h - 8}" class="g-valor">${pct(p.v)}</text><text x="${x + larg / 2}" y="${base + 22}" class="g-ano">${p.ano}</text>`;
  }).join("");
  const resumo = porAno.map((p) => `${p.ano}: ${p.v == null ? "sem registro" : pct(p.v)}`).join("; ");
  return `<figure class="grafico"><svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Reajuste por ano. ${esc(resumo)}">
    <line x1="0" y1="${base}" x2="${L}" y2="${base}" class="g-eixo"/>${barras}</svg>
    <figcaption>Reajuste salarial da convenção, ano atual e 4 anteriores.</figcaption></figure>`;
}

function linhaDocumento(c) {
  const l = linkDoc(c);
  return `<div class="doc">
    <div><div class="nome">${esc(NOME_TIPO[c.tipo] || c.tipo)} ${c.ano ? `${c.ano}/${c.ano + 1}` : ""}${c.empresa_nome ? ` · ${esc(c.empresa_nome)}` : ""}</div>
    <div class="info">${c.reajuste_pct != null ? "Reajuste " + pct(c.reajuste_pct) + " · " : ""}${c.piso_salarial != null ? "Piso " + moeda(c.piso_salarial) + " · " : ""}Vigência ${data(c.vigencia_inicio)} a ${data(c.vigencia_fim)}${c.registro_mte ? " · registro " + esc(c.registro_mte) : ""}</div>
    ${c.abrangencia ? `<div class="info">Abrangência: ${esc(c.abrangencia)}</div>` : ""}${seloIA(c)}</div>
    ${l ? `<a class="btn-claro" target="_blank" rel="noopener" href="${esc(l.url)}">${l.rot}</a>` : ""}</div>`;
}

async function abrirFicha(r) {
  let html = `<h3>${esc(r.nome)}</h3><dl class="ficha">
    <dt>CNPJ</dt><dd>${esc(r.cnpj)}${r.matriz === undefined ? "" : r.matriz ? " (Matriz)" : " (Filial)"}</dd>
    <dt>Cidade/UF</dt><dd>${esc(r.municipio)}/${esc(r.uf)}</dd>${r.situacao ? `<dt>Situação na Receita</dt><dd>${esc(r.situacao)}</dd>` : ""}</dl>`;
  if (!usuario) {
    abrirModal(html + `<div class="aviso"><b>Crie sua conta grátis</b> para ver o piso, o reajuste e o resumo da convenção deste sindicato.</div><div class="linha"><button class="btn" id="fEntrar">Criar conta grátis</button></div>`);
    $("fEntrar").onclick = () => telaEntrar();
    return;
  }
  abrirModal(html + "<p>Carregando…</p>");
  const { data: jaSalvo } = await sb.from("favoritos").select("cnpj").eq("cnpj", r.cnpj).maybeSingle();
  html += `<div class="linha"><button class="btn-claro" id="fSalvar">${jaSalvo ? "Remover dos salvos" : "Salvar sindicato"}</button>`;
  if (plano === "pro_completo") {
    const { data: jaSegue } = await sb.from("seguindo").select("cnpj").eq("cnpj", r.cnpj).maybeSingle();
    html += `<button class="btn-claro" id="fSeguir">${jaSegue ? "Parar aviso no Telegram" : "Seguir no Telegram"}</button>`;
  }
  html += "</div>";

  if (ehPro()) {
    const { data: convs } = await sb.from("convencoes").select("*").eq("status", "publicado").eq("cnpj", r.cnpj)
      .order("ano", { ascending: false }).order("id", { ascending: false }).limit(60);
    const anoMin = new Date().getFullYear() - 4;
    const ccts = (convs || []).filter((c) => c.tipo === "CCT" || c.tipo === "ADITIVO_CCT");
    const acts = (convs || []).filter((c) => c.tipo === "ACT" || c.tipo === "ADITIVO_ACT");
    if (ccts.length) {
      const atual = ccts[0];
      html += `<h4>Convenção mais recente</h4>${blocoBasico({ ...atual, resumo_curto: null })}
        <dl class="ficha">${atual.categoria ? `<dt>Categoria</dt><dd>${esc(atual.categoria)}</dd>` : ""}
        <dt>Vigência</dt><dd>${data(atual.vigencia_inicio)} a ${data(atual.vigencia_fim)}</dd>
        ${atual.abrangencia ? `<dt>Abrangência</dt><dd>${esc(atual.abrangencia)}</dd>` : ""}</dl>
        ${atual.resumo ? `<p class="resumo">${esc(atual.resumo)}</p>` : ""}
        ${graficoAnos(ccts)}
        <h4>Documentos dos últimos 5 anos</h4>${ccts.filter((c) => !c.ano || c.ano >= anoMin).map(linhaDocumento).join("")}
        <p class="nota">O documento abre direto na fonte oficial, na hora; o Radar não guarda arquivos.</p>`;
    } else {
      html += '<div class="aviso">Ainda não há convenção deste sindicato na base. Pergunte à IA abaixo: ela procura o documento para você.</div>';
    }
    if (acts.length) html += `<h4>Acordos coletivos com empresas (${acts.length})</h4>${acts.slice(0, 10).map(linhaDocumento).join("")}`;
    const { data: s } = await sb.from("sindicatos").select("*").eq("cnpj", r.cnpj).maybeSingle();
    if (s) html += `<h4>Contato</h4><dl class="ficha">
      ${s.nome_fantasia ? `<dt>Nome fantasia</dt><dd>${esc(s.nome_fantasia)}</dd>` : ""}
      <dt>Endereço</dt><dd>${esc([s.logradouro, s.numero, s.complemento, s.bairro].filter(Boolean).join(", "))} · CEP ${esc(s.cep)}</dd>
      <dt>Telefone</dt><dd>${esc(s.telefone) || "-"}</dd><dt>E-mail</dt><dd>${esc(s.email) || "-"}</dd>
      <dt>CNAE principal</dt><dd>${esc(s.cnae_principal)}</dd><dt>Início das atividades</dt><dd>${esc(s.data_inicio)}</dd></dl>`;
  } else {
    const { data: b } = await sb.rpc("convencao_basica", { p_cnpj: r.cnpj });
    const c = Array.isArray(b) ? b[0] : b;
    html += c ? `<h4>Convenção mais recente</h4>${blocoBasico(c)}` : '<div class="aviso">Ainda não há convenção deste sindicato na base.</div>';
    html += `<div class="aviso">No <b>Pro</b>: ano atual e 4 anteriores com gráfico, termos aditivos, acordos com empresas, documento oficial e contato do sindicato. <a href="#planos" data-fechar>Ver planos</a></div>`;
  }

  html += `<h4>Pergunte à IA sobre este sindicato</h4>
    <textarea id="fPergunta" rows="2" placeholder="Ex.: qual o reajuste e a data-base? Tem adicional de insalubridade?"></textarea>
    <div class="linha"><button class="btn" id="fPerguntar">Perguntar</button></div><div id="fResp"></div>
    <p class="nota">${AVISO_LEGAL}</p>`;
  abrirModal(html);

  $("fSalvar").onclick = async () => {
    const { data: ja } = await sb.from("favoritos").select("cnpj").eq("cnpj", r.cnpj).maybeSingle();
    const res = ja ? await sb.from("favoritos").delete().eq("cnpj", r.cnpj).eq("user_id", usuario.id)
      : await sb.from("favoritos").insert({ cnpj: r.cnpj, nome: r.nome, cidade: `${r.municipio || ""}/${r.uf || ""}` });
    $("fSalvar").textContent = res.error ? "Erro: " + res.error.message : ja ? "Salvar sindicato" : "Remover dos salvos";
    carregarMeus();
  };
  const fs = $("fSeguir");
  if (fs) fs.onclick = async () => {
    const { data: ja } = await sb.from("seguindo").select("cnpj").eq("cnpj", r.cnpj).maybeSingle();
    const res = ja ? await sb.from("seguindo").delete().eq("cnpj", r.cnpj).eq("user_id", usuario.id)
      : await sb.from("seguindo").insert({ user_id: usuario.id, cnpj: r.cnpj });
    fs.textContent = res.error ? "Erro: " + res.error.message : ja ? "Seguir no Telegram" : "Parar aviso no Telegram";
  };
  $("fPerguntar").onclick = async () => {
    const pergunta = $("fPergunta").value.trim();
    if (!pergunta) return;
    const bt = $("fPerguntar"); bt.disabled = true; $("fResp").innerHTML = '<div class="ia-resp">Procurando na base e nas fontes…</div>';
    const { data: d, error } = await sb.functions.invoke("perguntar-ia", { body: { pergunta, cnpj: r.cnpj } });
    bt.disabled = false;
    if (error || d?.erro) return ($("fResp").innerHTML = `<div class="msg err">${esc(d?.erro || (await erroDaFuncao(error)))}</div>`);
    const fontes = (d.fontes || []).map((f) => `<li><a target="_blank" rel="noopener" href="${esc(f.link)}">${esc(f.titulo || f.link)}</a></li>`).join("");
    $("fResp").innerHTML = `<div class="ia-resp">${esc(d.resposta)}</div>${fontes ? `<p class="nota">Fontes:</p><ul class="fontes">${fontes}</ul>` : ""}
      ${d.restantes != null ? `<p class="nota">Perguntas restantes hoje: ${d.restantes}.</p>` : ""}`;
  };
}

// ───────── download ZIP (Pro) ─────────
async function baixarZip() {
  if (!usuario) return telaEntrar("A planilha do resultado é do plano Pro.");
  if (!ehPro()) return abrirModal('<h3>Planilha do resultado</h3><div class="aviso">Disponível nos planos <b>Pro</b> e <b>Plus</b>.</div><div class="linha"><a class="btn" href="#planos" data-fechar>Ver planos</a></div>');
  const lista = resultados.slice(0, C.LIMITE_ZIP || 3000);
  const btn = $("btnZip"); btn.disabled = true;
  const fichas = [], convs = [];
  for (let i = 0; i < lista.length; i += 150) {
    btn.textContent = `Preparando… ${Math.min(i + 150, lista.length)}/${lista.length}`;
    const cnpjs = lista.slice(i, i + 150).map((r) => r.cnpj);
    const a = await sb.from("sindicatos").select("*").in("cnpj", cnpjs);
    const b = await sb.from("convencoes").select("*").eq("status", "publicado").in("cnpj", cnpjs);
    fichas.push(...(a.data || [])); convs.push(...(b.data || []));
  }
  const csv = (rows) => {
    if (!rows.length) return "";
    const cols = Object.keys(rows[0]);
    return "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\r\n");
  };
  const zip = new JSZip();
  zip.file("sindicatos.csv", csv(fichas));
  zip.file("convencoes.csv", csv(convs));
  zip.file("sindicatos.json", JSON.stringify(fichas, null, 1));
  zip.file("LEIA-ME.txt", `Radar Sindical Pro, exportação de ${new Date().toLocaleString("pt-BR")}\n${fichas.length} sindicatos, ${convs.length} convenções/acordos.\nFonte: ${indice.fonte}. Abra os .csv no Excel (separador ;).\n${AVISO_LEGAL}`);
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `radar_sindical_${new Date().toISOString().slice(0, 10)}.zip`; a.click();
  btn.disabled = false; btn.innerHTML = 'Baixar resultado em planilha <span class="tag">Pro</span>';
}

// ───────── assinatura por PIX ─────────
function telaAssinar(qual) {
  if (!usuario) return telaEntrar("Crie sua conta (grátis) e depois escolha o plano.");
  const nome = qual === "pro" ? "Pro" : "Plus", valor = C.PRECOS[qual];
  abrirModal(`<h3>Assinar ${nome}: ${moeda(valor)} por mês</h3>
    <p>1. Faça um PIX de <b>${moeda(valor)}</b> para:</p><div class="pix">${esc(C.PIX_CHAVE)}</div><p class="info">Favorecido: ${esc(C.PIX_NOME)}</p>
    <div class="linha"><button class="btn-claro" id="copiarPix">Copiar chave PIX</button></div>
    <p>2. Cole abaixo o <b>ID da transação</b> (ou o nome de quem pagou) e confirme:</p>
    <input id="comprovante" placeholder="ID da transação PIX ou nome do pagador" aria-label="Comprovante">
    <div class="linha"><button class="btn" id="btnJaPaguei">Já paguei</button></div>
    <div id="msgPedido"></div>`);
  $("copiarPix").onclick = () => navigator.clipboard.writeText(C.PIX_CHAVE).then(() => ($("copiarPix").textContent = "Chave copiada"));
  $("btnJaPaguei").onclick = async () => {
    const { error } = await sb.from("pedidos").insert({ email: usuario.email, plano: qual, valor, comprovante: $("comprovante").value.trim() });
    $("msgPedido").innerHTML = error ? `<div class="msg err">${esc(error.message)}</div>`
      : '<div class="msg ok">Pedido registrado. Assim que o PIX for confirmado, o plano é liberado na sua conta.</div>';
  };
}

// ───────── termos e privacidade (LGPD) ─────────
const PAGINAS = {
  termos: `<h3>Termos de uso</h3>
    <p>O Radar Sindical reúne dados públicos da Receita Federal e de convenções e acordos coletivos registrados no Sistema Mediador do Ministério do Trabalho e nos sites dos sindicatos.</p>
    <p><b>Informação de apoio.</b> O enquadramento sindical mostrado é provável, calculado pela atividade principal (CNAE) e pela cidade. Valores lidos automaticamente aparecem com o selo “lido por IA” até serem conferidos. Antes de aplicar reajuste, piso ou cláusula, confira no documento registrado. O Radar não presta consultoria jurídica.</p>
    <p><b>Planos.</b> Pagamento mensal por PIX, liberado após a confirmação. Sem renovação automática: se não pagar, a conta volta ao plano Grátis.</p>
    <p><b>Uso justo.</b> Há limites diários de consultas e de perguntas à IA por plano. É proibido copiar a base em massa por robô.</p>`,
  privacidade: `<h3>Política de privacidade</h3>
    <p><b>O que guardamos:</b> seu e-mail, o plano e a validade, as buscas recentes (as 50 últimas, se o histórico estiver ligado), os sindicatos salvos e seguidos e, no Plus, o código do chat do Telegram para enviar os avisos.</p>
    <p><b>Para quê:</b> fazer o site funcionar, mostrar seu histórico e enviar os avisos que você pediu (base legal: execução do contrato, art. 7º, V, da LGPD).</p>
    <p><b>Perguntas à IA:</b> o texto da pergunta é enviado a um provedor de IA para gerar a resposta. Não escreva dados pessoais de empregados nas perguntas.</p>
    <p><b>Seus direitos:</b> em <b>Minha conta</b> você desliga o histórico e apaga buscas, salvos e avisos na hora. Para excluir a conta inteira ou pedir uma cópia dos seus dados, escreva para o contato do site.</p>
    <p>Não vendemos nem repassamos seus dados.</p>`,
};

// ───────── eventos ─────────
$("formBusca").addEventListener("submit", buscar);
document.querySelectorAll(".modos [data-modo]").forEach((b) => (b.onclick = () => { trocarModo(b.dataset.modo); $(b.dataset.modo === "cidade" ? "qUF" : "qTexto").focus(); }));
document.addEventListener("click", (e) => {
  const it = e.target.closest(".item[data-i]"); if (it) return abrirFicha(resultados[+it.dataset.i]);
  const h = e.target.closest("[data-hist]"); if (h) return refazerBusca(h.dataset.hist);
  const f = e.target.closest("[data-fav]"); if (f) return abrirSalvo(f.dataset.fav, f.dataset.nome, f.dataset.cidade);
  const pg = e.target.closest("[data-pagina]");
  if (pg) { e.preventDefault(); return abrirModal(PAGINAS[pg.dataset.pagina] + (usuario && perfil && !perfil.aceite_termos_em ? '<div class="linha"><button class="btn" data-voltar-aceite>Voltar para o aceite</button></div>' : "")); }
  if (e.target.closest("[data-voltar-aceite]")) return telaAceite();
  if (e.target.closest("[data-fechar]")) fecharModal();
});
$("paginacao").addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) { pagina = +b.dataset.p; desenhar(); scrollTo({ top: $("formBusca").offsetTop - 70, behavior: "smooth" }); } });
$("btnZip").onclick = baixarZip;
$("btnConta").onclick = () => (usuario ? telaConta() : telaEntrar());
$("fecharModal").onclick = fecharModal;
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") fecharModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
document.querySelectorAll("[data-assinar]").forEach((b) => (b.onclick = () => telaAssinar(b.dataset.assinar)));
document.querySelectorAll('[data-acao="entrar"]').forEach((b) => (b.onclick = () => (usuario ? telaConta() : telaEntrar())));
$("precoPro").textContent = moeda(C.PRECOS?.pro || 0) + "/mês";
$("precoCompleto").textContent = moeda(C.PRECOS?.pro_completo || 0) + "/mês";
trocarModo("empresa");
if (sb) sb.auth.onAuthStateChange(() => setTimeout(atualizarSessao, 0));
carregarIndice().then(atualizarSessao).catch((e) => ($("resultados").innerHTML = `<div class="item">Erro ao carregar a base: ${esc(e.message)}</div>`));

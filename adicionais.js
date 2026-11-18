// Módulo Insalubridade & Periculosidade por Convenção (NR-15 / NR-16 / CLT)
(async function initAdicionaisConvencoes() {
  const box = document.getElementById("adicionaisBox");
  if (!box) return;
  try {
    const resp = await fetch("dados/adicionais_convencoes.json");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    const sel = document.getElementById("selCategoriaAdic");
    const salInput = document.getElementById("inpSalarioBase");
    const grauSel = document.getElementById("selGrauInsalub");
    const chkPeric = document.getElementById("chkPericulosidade");
    const out = document.getElementById("resultadoAdicional");
    const aviso = document.getElementById("avisoAdicionais");
    if (aviso) aviso.textContent = data.aviso_transparencia;

    data.categorias.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.categoria;
      sel.appendChild(opt);
    });

    const fmt = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function calcular() {
      const cat = data.categorias.find((x) => x.id === sel.value) || data.categorias[0];
      const sal = Math.max(0, Number(salInput.value) || 0);
      const sm = Number(data.salario_minimo_referencia_brl) || 1518;
      const grau = Number(grauSel.value) || 0;
      const valInsalubSM = sm * (grau / 100);
      const valInsalubSal = sal * (grau / 100);
      const valPeric = chkPeric.checked ? sal * 0.30 : 0;
      const melhor = Math.max(valInsalubSM, valPeric);
      const recomendacao =
        valPeric === 0 && valInsalubSM === 0
          ? "Nenhum adicional selecionado."
          : valPeric >= valInsalubSM
          ? `Periculosidade (30% sobre salário-base) = ${fmt(valPeric)} é mais vantajosa que Insalubridade s/ SM (${fmt(valInsalubSM)}).`
          : `Insalubridade (${grau}% sobre SM) = ${fmt(valInsalubSM)} é mais vantajosa que Periculosidade (${fmt(valPeric)}).`;

      out.innerHTML = `
        <div class="adic-grid">
          <div class="adic-card">
            <strong>${cat.categoria}</strong>
            <div style="font-size:13px;opacity:.85;margin-top:4px;">Sindicatos ref.: ${cat.sindicatos_ref}</div>
            <p style="margin:8px 0 4px;"><b>Insalubridade (NR-15):</b> ${cat.insalubridade}</p>
            <p style="margin:4px 0;"><b>Base na CCT:</b> ${cat.insalubridade_base}</p>
            <p style="margin:4px 0;"><b>Periculosidade (NR-16):</b> ${cat.periculosidade}</p>
            <p style="margin:4px 0;"><b>Cumulação:</b> ${cat.cumulacao}</p>
          </div>
          <div class="adic-card adic-calc">
            <strong>Simulação de Cálculo (CLT Art. 192 / 193)</strong>
            <ul style="margin:8px 0;padding-left:18px;">
              <li>Insalubridade (${grau}% sobre SM ${fmt(sm)}): <b>${fmt(valInsalubSM)}</b></li>
              <li>Insalubridade (${grau}% se CCT usar salário/piso ${fmt(sal)}): <b>${fmt(valInsalubSal)}</b></li>
              <li>Periculosidade (30% sobre salário-base ${fmt(sal)}): <b>${fmt(valPeric)}</b></li>
            </ul>
            <div style="padding:8px 10px;border-radius:8px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);font-size:13px;">
              <b>Opção legal mais vantajosa (sem cumulação):</b> ${recomendacao}<br>
              <b>Salário + adicional estimado:</b> ${fmt(sal + melhor)}
            </div>
          </div>
        </div>`;
    }

    sel.addEventListener("change", () => {
      const cat = data.categorias.find((x) => x.id === sel.value);
      if (cat) {
        grauSel.value = String(cat.grau_padrao_pct || 0);
        chkPeric.checked = Number(cat.periculosidade_padrao_pct || 0) > 0;
      }
      calcular();
    });
    salInput.addEventListener("input", calcular);
    grauSel.addEventListener("change", calcular);
    chkPeric.addEventListener("change", calcular);
    sel.dispatchEvent(new Event("change"));
  } catch (e) {
    console.error("[ADICIONAIS] Erro ao carregar adicionais_convencoes.json:", e);
  }
})();

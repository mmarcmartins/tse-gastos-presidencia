// Baixa os dados oficiais e grava data/gastos.json.
// Uso: node scripts/atualizar.js [--todos]   (--todos refaz também os anos já fechados)
const fs = require("fs");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const ARQ = "data/gastos.json";
const ANOS = [2023, 2024, 2025, 2026];
const COD_SENADOR = 5894; // Flávio Bolsonaro
const ORGAO_PRESIDENCIA = "20000";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Suba VERSAO quando mudar o que é calculado ou omitido: a próxima execução refaz todos os anos.
const VERSAO = 3;
let todos = process.argv.includes("--todos");
const agora = new Date();
const partes = Object.fromEntries(
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(agora).map((p) => [p.type, p.value])
);
const anoAtual = Number(partes.year);
const mesAtual = Number(partes.month);

const soma = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const ehCpf = (doc) => !doc || doc.includes("*") || doc.replace(/\D/g, "").length === 11;
// Empresas individuais (MEI) costumam levar o nome do dono: só mostra o nome se parecer razão social.
const RAZAO_SOCIAL = /\b(LTDA|S\.?\/?A|EIRELI|EPP|CIA|COMPANHIA|COM[EÉ]RCIO|SERVI[CÇ]OS?|POSTO|HOTEL|IND[UÚ]STRIA|EMPRESA|ASSOCIA[CÇ][AÃ]O|CONDOM[IÍ]NIO|TELECOM|IMOBILI[AÁ]RIA|CONSULTORIA|PARTICIPA[CÇ](OES|ÕES)|GRUPO|BANCO|RESTAURANTE|LOCADORA|TRANSPORTES?|DISTRIBUIDORA|EDITORA|GR[AÁ]FICA|TECNOLOGIA|AG[EÊ]NCIA|TURISMO|FARM[AÁ]CIA|SUPERMERCADO|LOJAS?)\b/i;
function nomeFornecedor(doc, nome) {
  if (ehCpf(doc)) return "Pessoa física";
  return RAZAO_SOCIAL.test(nome || "") ? tituloCaso(nome) : "Empresa individual (nome omitido)";
}
const tituloCaso = (s) =>
  s.toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a)\b\.?/g, "")
    .replace(/[\s.,-]+$/, "")
    .replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

async function baixar(url) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fetch(url, { headers: { "User-Agent": "tse-gastos-presidencia (GitHub Actions)" } });
    } catch (e) {
      if (tentativa >= 3) throw e;
      await new Promise((r) => setTimeout(r, 3000 * tentativa));
    }
  }
}

// ---------- Senado: cota parlamentar (CEAPS) ----------

function categoriaSenado(tipo) {
  if (/^Aluguel/i.test(tipo)) return "Aluguel e despesas do escritório";
  if (/^Passagens/i.test(tipo)) return "Passagens aéreas";
  if (/^Locomo/i.test(tipo)) return "Locomoção, hospedagem e combustível";
  if (/^Contrata/i.test(tipo)) return "Consultorias";
  if (/^Aquisi/i.test(tipo)) return "Material de escritório";
  if (/^Divulga/i.test(tipo)) return "Divulgação da atividade parlamentar";
  if (/Seguran/i.test(tipo)) return "Segurança privada";
  return tipo.split(",")[0];
}

// Nunca devolve nomes: só diz se o passageiro era o próprio senador.
function passageiro(det) {
  if (!det) return "Passageiro não informado";
  return /FL[AÁ]VIO NANTES BOLSONARO/i.test(det) ? "O próprio senador" : "Outro passageiro";
}

async function senado(ano) {
  const r = await baixar(`https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${ano}`);
  if (!r.ok) throw new Error(`Senado ${ano}: HTTP ${r.status}`);
  const linhas = (await r.json()).filter((d) => d.codSenador === COD_SENADOR);
  if (!linhas.length) throw new Error(`Senado ${ano}: nenhuma despesa encontrada`);

  const ultimoMes = ano < anoAtual ? 12 : Math.max(...linhas.map((d) => d.mes));
  const porMes = Array(ultimoMes).fill(0);
  const porCat = new Map();
  for (const d of linhas) {
    if (d.mes >= 1 && d.mes <= ultimoMes) porMes[d.mes - 1] += d.valorReembolsado;
    const c = categoriaSenado(d.tipoDespesa);
    porCat.set(c, (porCat.get(c) || 0) + d.valorReembolsado);
  }

  const top = [...linhas]
    .sort((a, b) => b.valorReembolsado - a.valorReembolsado)
    .slice(0, 10)
    .map((d) => {
      const cat = categoriaSenado(d.tipoDespesa);
      const passagem = cat === "Passagens aéreas";
      const [, mm, dd] = (d.data || "").split("-");
      return {
        descricao: `${dd}/${mm} · ${passagem ? `Passagem aérea, ${d.fornecedor}` : cat}`,
        detalhe: passagem ? passageiro(d.detalhamento) : nomeFornecedor(d.cpfCnpj, d.fornecedor),
        valor: d.valorReembolsado,
      };
    });

  return {
    ate: `${MESES[ultimoMes - 1]}/${ano}`,
    total: soma(linhas.map((d) => d.valorReembolsado)),
    despesas: linhas.length,
    top,
    categorias: [...porCat].map(([nome, valor]) => ({ nome, valor: soma([valor]) })).sort((a, b) => b.valor - a.valor),
    meses: porMes.map((v, i) => ({ mes: MESES[i], valor: soma([v]) })),
  };
}

// ---------- Portal da Transparência: cartão de pagamento (CPGF) ----------

const NOMES_ORGAO = {
  "Gabinete da Vice-Presidência da República": "Gabinete da Vice-Presidência",
  "Empresa Brasil de Comunicação": "EBC",
  "Fundo de Imprensa Nacional": "Imprensa Nacional",
};

function detalhePortal(sigiloso, doc, fav) {
  if (sigiloso) return "Portador e favorecido sob sigilo";
  if (/^SEM INFORMA/i.test(fav)) return "Favorecido sem informação";
  if (/^NAO SE APLICA/i.test(fav)) return "Favorecido: não se aplica";
  return nomeFornecedor(doc, fav);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// O Portal bloqueia (403/405) depois de uns 20–30 downloads seguidos. Por isso cada mês é
// baixado uma única vez e resumido em data/cpgf/AAAAMM.json, já sem nomes: a chave do grupo
// é um hash e o favorecido já passou pelas regras de privacidade. Cada execução baixa no
// máximo LIMITE_DOWNLOADS meses novos e para no primeiro bloqueio; a seguinte continua.
const CACHE = "data/cpgf";
const LIMITE_DOWNLOADS = 18;
let baixados = 0;
let portalBloqueado = false;

async function mesPortal(ano, m, deveExistir) {
  const id = `${ano}${String(m).padStart(2, "0")}`;
  const arq = `${CACHE}/${id}.json`;
  if (fs.existsSync(arq)) {
    const c = JSON.parse(fs.readFileSync(arq, "utf8"));
    if (c.versao === VERSAO) return c;
  }
  if (portalBloqueado || baixados >= LIMITE_DOWNLOADS) {
    portalBloqueado = true;
    return null;
  }

  if (baixados) await espera(5000);
  baixados++;
  const r = await baixar(`https://portaldatransparencia.gov.br/download-de-dados/cpgf/${id}`);
  if (!r.ok || !/zip/i.test(r.headers.get("content-type") || "")) {
    console.log(`  Portal ${id}: HTTP ${r.status}`);
    // Um mês que já deveria estar publicado e foi recusado é bloqueio: para por esta execução.
    if (deveExistir) portalBloqueado = true;
    return null;
  }

  const zip = new AdmZip(Buffer.from(await r.arrayBuffer()));
  const csv = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".csv"));
  const grupos = new Map(); // hash(órgão + portador + favorecido) -> grupo
  let total = 0, sigPres = 0, sigVice = 0;
  for (const bruta of csv.getData().toString("latin1").split("\n").slice(1)) {
    const l = bruta.trim();
    if (!l) continue;
    const c = l.slice(1, -1).split('";"');
    if (c[0] !== ORGAO_PRESIDENCIA) continue;
    const orgao = c[3], portador = c[9], doc = c[10], fav = c[11];
    const valor = Number(c[14].replace(/\./g, "").replace(",", "."));
    const sigiloso = /sigil/i.test(portador);
    if (sigiloso && orgao === "Presidência da República") sigPres += valor;
    if (sigiloso && /Vice-Presid/.test(orgao)) sigVice += valor;
    total += valor;

    const chave = crypto.createHash("sha256").update(`${orgao}|${portador}|${fav}`).digest("hex").slice(0, 16);
    const g = grupos.get(chave) || [chave, NOMES_ORGAO[orgao] || orgao, detalhePortal(sigiloso, doc, fav), sigiloso ? 1 : 0, 0];
    g[4] += valor;
    grupos.set(chave, g);
  }

  const resumo = {
    versao: VERSAO,
    total: soma([total]),
    sigiloso_presidencia: soma([sigPres]),
    sigiloso_vice: soma([sigVice]),
    grupos: [...grupos.values()].map((g) => [...g.slice(0, 4), soma([g[4]])]),
  };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(arq, JSON.stringify(resumo) + "\n");
  console.log(`  Portal ${id}: baixado`);
  return resumo;
}

async function portal(ano, ateMes) {
  const grupos = new Map();
  const porMes = [];
  let sigPres = 0, sigVice = 0, ultimo = 0;

  for (let m = 1; m <= ateMes; m++) {
    const c = await mesPortal(ano, m, ano < anoAtual);
    if (!c) break; // mês ainda não publicado, ou Portal bloqueado nesta execução
    for (const [chave, descricao, detalhe, sigiloso, valor] of c.grupos) {
      const g = grupos.get(chave) || { descricao, detalhe, sigiloso: !!sigiloso, valor: 0 };
      g.valor += valor;
      grupos.set(chave, g);
    }
    sigPres += c.sigiloso_presidencia;
    sigVice += c.sigiloso_vice;
    porMes.push({ mes: MESES[m - 1], valor: c.total });
    ultimo = m;
  }
  if (!ultimo) throw new Error(`Portal ${ano}: nenhum mês disponível${portalBloqueado ? " (Portal bloqueou downloads nesta execução)" : ""}`);

  const top = [...grupos.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)
    .map((g) => ({ ...g, valor: soma([g.valor]) }));

  return {
    ate: `${MESES[ultimo - 1]}/${ano}`,
    completo: ultimo === 12,
    sigiloso_presidencia: soma([sigPres]),
    sigiloso_vice: soma([sigVice]),
    total: soma(porMes.map((x) => x.valor)),
    top,
    meses: porMes,
  };
}

// ---------- principal ----------

(async () => {
  const dados = fs.existsSync(ARQ) ? JSON.parse(fs.readFileSync(ARQ, "utf8")) : {};
  dados.anos = dados.anos || {};
  if (dados.versao !== VERSAO) todos = true;
  const erros = [];
  let atualizados = 0;

  // Do ano mais recente para o mais antigo: com downloads limitados, os meses novos vêm primeiro.
  for (const ano of [...ANOS].reverse()) {
    const fechado = ano < anoAtual;
    const atual = dados.anos[ano] || {};

    if (todos || !fechado || !atual.flavio) {
      try { atual.flavio = await senado(ano); atualizados++; } catch (e) { erros.push(e.message); }
    }
    // Nunca troca dados por uma versão com menos meses, nem publica ano incompleto
    // (download interrompido no meio): a próxima execução continua de onde parou.
    const guardar = (campo, novo, rotulo, minimo = 1) => {
      if (novo.meses.length < minimo || (atual[campo] && novo.meses.length < atual[campo].meses.length)) {
        erros.push(`${rotulo}: ${novo.meses.length} de ${minimo} meses baixados até agora; continua na próxima execução`);
      } else {
        atual[campo] = novo;
        atualizados++;
      }
    };

    // Portal: sempre recalculado a partir do cache; só os meses que faltam são baixados.
    try { guardar("lula", await portal(ano, fechado ? 12 : mesAtual), `Portal ${ano}`, fechado ? 12 : 1); } catch (e) { erros.push(e.message); }

    // Jair Bolsonaro: cartão da Presidência no ano equivalente do mandato dele (2019 ↔ 2023 …),
    // limitado aos mesmos meses já publicados para o Lula, para comparar períodos iguais.
    const anoJair = ano - 4;
    const mesesAlvo = fechado ? 12 : atual.lula ? atual.lula.meses.length : 0;
    if (mesesAlvo) {
      try { guardar("jair", { ano_mandato: anoJair, ...(await portal(anoJair, mesesAlvo)) }, `Portal ${anoJair}`, mesesAlvo); } catch (e) { erros.push(e.message); }
    }

    dados.anos[ano] = atual;
    console.log(`${ano}: Senado até ${atual.flavio?.ate ?? "-"}, Portal até ${atual.lula?.ate ?? "-"}, Jair até ${atual.jair?.ate ?? "-"}`);
  }

  dados.atualizado_em = `${partes.day}/${partes.month}/${partes.year}, ${partes.hour}h${partes.minute}`;
  dados.erros = erros;
  // Só marca a versão nova quando tudo foi refeito sem falha; senão a próxima execução tenta de novo.
  if (!erros.length) dados.versao = VERSAO;
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(ARQ, JSON.stringify(dados, null, 2) + "\n");

  if (erros.length) console.error("Avisos:\n- " + erros.join("\n- "));
  if (!atualizados && erros.length) process.exit(1);
})();

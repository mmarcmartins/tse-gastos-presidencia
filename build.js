// Gera dist/index.html a partir de src/index.pug + data/gastos.json.
const fs = require("fs");
const pug = require("pug");

const dados = JSON.parse(fs.readFileSync("data/gastos.json", "utf8"));
const fmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v) => fmt.format(v);
const compacto = (v) =>
  v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`
  : v >= 1e3 ? `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
  : `R$ ${brl(v)}`;

// Do mais recente para o mais antigo; um ano aparece mesmo se uma das fontes falhou.
const anos = Object.entries(dados.anos)
  .filter(([, a]) => a.lula || a.flavio || a.jair)
  .map(([ano, a]) => ({ ano: Number(ano), ...a }))
  .sort((a, b) => b.ano - a.ano);
const ultimoPortal = anos.find((a) => a.lula);
const ultimoSenado = anos.find((a) => a.flavio);

const html = pug.renderFile("src/index.pug", { ...dados, anos, ultimoPortal, ultimoSenado, brl, compacto });

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", html);
fs.copyFileSync("data/gastos.json", "dist/gastos.json");
console.log("dist/index.html gerado");

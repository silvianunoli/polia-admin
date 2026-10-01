import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Lock, Store } from "lucide-react";
import { obterConfigLoja, salvarConfigLoja, type ConfigLoja } from "@/lib/loja.functions";
import { configSchema, primeiroErro } from "@/lib/loja";
import {
  btnOutline,
  btnPrimary,
  cardClass,
  formatarDataHora,
  inputClass,
  labelClass,
} from "@/lib/crm-ui";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";

export const Route = createFileRoute("/loja/config")({
  head: () => ({ meta: [{ title: "Abrir ou fechar a loja · Gestão Pólia" }] }),
  component: LojaConfig,
});

function LojaConfig() {
  const { confirmar, dialogo } = useConfirmacao();
  const [config, setConfig] = useState<ConfigLoja | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setErro(null);
    try {
      const r = await obterConfigLoja();
      setConfig(r.config);
      setAviso(r.config.aviso ?? "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra carregar a configuração.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function gravar(lojaAberta: boolean, mensagemOk: string) {
    const dados = { loja_aberta: lojaAberta, aviso };
    const v = configSchema.safeParse(dados);
    if (!v.success) {
      toastErro(primeiroErro(v.error));
      return;
    }
    setSalvando(true);
    try {
      const r = await salvarConfigLoja({ data: dados });
      setConfig(r.config);
      setAviso(r.config.aviso ?? "");
      toastSucesso(mensagemOk);
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não deu pra salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function virarChave() {
    if (!config) return;
    if (!config.loja_aberta) {
      const ok = await confirmar({
        titulo: "Abrir a loja agora",
        descricao: (
          <div className="flex flex-col gap-2">
            <p>
              A partir de agora, quem entrar em servicos.usepolia.com.br/loja consegue comprar os
              serviços publicados.
            </p>
            <p>
              <strong>O Stripe está em modo real.</strong> Cada compra é cobrança de verdade no
              cartão da cliente e vira compromisso de entrega.
            </p>
            <p>Antes de abrir, vale conferir preço, prazo e fotos de cada serviço publicado.</p>
          </div>
        ),
        rotuloConfirmar: "Abrir a loja",
        rotuloCancelar: "Deixar fechada",
      });
      if (!ok) return;
      await gravar(true, "Loja aberta.");
    } else {
      const ok = await confirmar({
        titulo: "Fechar a loja",
        descricao:
          "A vitrine para de aceitar pedido novo. Pedidos já feitos continuam aqui, do mesmo jeito.",
        rotuloConfirmar: "Fechar a loja",
        rotuloCancelar: "Deixar aberta",
        perigo: true,
      });
      if (!ok) return;
      await gravar(false, "Loja fechada.");
    }
  }

  if (erro) {
    return (
      <div className={`${cardClass} max-w-xl p-8`}>
        <p className="text-[14px] text-[var(--ink-soft)]">{erro}</p>
        <button type="button" onClick={carregar} className={`${btnOutline} mt-4`}>
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!config) {
    return <div className="h-48 max-w-3xl animate-pulse rounded-2xl bg-[var(--surface)]" />;
  }

  const avisoMudou = (config.aviso ?? "") !== aviso.trim();

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {dialogo}
      <section
        className={`flex flex-col gap-4 rounded-2xl border p-6 ${
          config.loja_aberta
            ? "border-[var(--secondary)] bg-[var(--secondary-light)]"
            : "border-[var(--line)] bg-white"
        }`}
      >
        <div className="flex items-center gap-3">
          {config.loja_aberta ? (
            <Store size={26} className="text-[var(--ink)]" aria-hidden="true" />
          ) : (
            <Lock size={26} className="text-[var(--muted)]" aria-hidden="true" />
          )}
          <div>
            <p className="font-cabinet text-[24px] leading-tight text-[var(--ink)]">
              {config.loja_aberta ? "A loja está aberta" : "A loja está fechada"}
            </p>
            <p className="text-[13px] text-[var(--ink-soft)]">
              Última mudança em {formatarDataHora(config.updated_at)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white p-4 text-[13px] text-[var(--ink-soft)]">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-[var(--danger)]"
            aria-hidden="true"
          />
          <p>
            Loja aberta aceita compra com cobrança real pelo Stripe. Fechada, a vitrine não aceita
            pedido novo.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={virarChave}
            disabled={salvando}
            className={
              config.loja_aberta
                ? "rounded-xl border border-[var(--danger)] bg-white px-5 py-2.5 text-[14px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
                : btnPrimary
            }
          >
            {salvando ? "Salvando..." : config.loja_aberta ? "Fechar a loja" : "Abrir a loja"}
          </button>
        </div>
      </section>

      <section className={`${cardClass} flex flex-col gap-3 p-6`}>
        <label htmlFor="aviso" className="font-cabinet text-[17px] text-[var(--ink)]">
          Aviso na vitrine
        </label>
        <p className="text-[13px] text-[var(--muted)]">
          Frase curta que aparece no topo da loja. Ex.: "Agenda de outubro com duas vagas." Vazio,
          não aparece nada.
        </p>
        <textarea
          id="aviso"
          value={aviso}
          onChange={(e) => setAviso(e.target.value)}
          maxLength={300}
          rows={2}
          className={inputClass}
        />
        <p className={labelClass}>{aviso.length}/300</p>
        <div>
          <button
            type="button"
            onClick={() => gravar(config.loja_aberta, "Aviso salvo.")}
            disabled={!avisoMudou || salvando}
            className={btnOutline}
          >
            Salvar aviso
          </button>
        </div>
      </section>
    </div>
  );
}

import { $ } from './util';

/**
 * Monta a mensagem de orçamento e abre o WhatsApp. Nada é enviado a servidores.
 * Número e frase de abertura vêm de src/data/empresa.ts (atributos data-* do formulário).
 */
export function iniciarFormulario() {
  const form = $<HTMLFormElement>('[data-formulario]');
  if (!form) return;
  const numero = form.dataset.whatsapp;
  const abertura = form.dataset.mensagem ?? '';
  if (!numero) return;

  const nome = form.elements.namedItem('nome') as HTMLInputElement;
  const erroNome = $('[data-erro="nome"]', form);
  const erroAmbientes = $('[data-erro="ambientes"]', form);

  const marcados = () =>
    Array.from(form.querySelectorAll<HTMLInputElement>('input[name="ambientes"]:checked')).map((c) => c.value);

  const limpar = () => {
    nome.removeAttribute('aria-invalid');
    if (erroNome) erroNome.textContent = '';
    if (erroAmbientes) erroAmbientes.textContent = '';
  };
  form.addEventListener('input', limpar);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    limpar();
    const valorNome = nome.value.trim();
    const ambientes = marcados();
    let valido = true;

    if (valorNome.length < 2) {
      valido = false;
      nome.setAttribute('aria-invalid', 'true');
      if (erroNome) erroNome.textContent = 'Informe seu nome para a equipe saber com quem vai falar.';
    }
    if (ambientes.length === 0) {
      valido = false;
      if (erroAmbientes) erroAmbientes.textContent = 'Selecione pelo menos um ambiente.';
    }
    if (!valido) {
      (valorNome.length < 2 ? nome : form.querySelector<HTMLInputElement>('input[name="ambientes"]'))?.focus();
      return;
    }

    const bairro = (form.elements.namedItem('bairro') as HTMLInputElement).value.trim();
    const mensagem = (form.elements.namedItem('mensagem') as HTMLTextAreaElement).value.trim();
    const linhas = [
      abertura,
      '',
      `*Nome:* ${valorNome}`,
      `*Ambientes:* ${ambientes.join(', ')}`,
      bairro ? `*Bairro/cidade:* ${bairro}` : null,
      mensagem ? `*Sobre o espaço:* ${mensagem}` : null,
    ].filter((l): l is string => l !== null);

    const link = `https://wa.me/${numero}?text=${encodeURIComponent(linhas.join('\n'))}`;
    const janela = window.open(link, '_blank', 'noopener');
    if (!janela) window.location.href = link;
  });
}
